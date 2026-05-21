import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IntentRejected, Pearl } from "../src/index.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "pearl-test-"));
}

describe("Pearl - 写后读", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(() => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("Created 后 get(id) 返回 entity", async () => {
    const r = await db.commit({
      events: [
        {
          entityId: "run-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });

    const e = db.get("run-1");
    expect(e).toBeDefined();
    expect(e!.type).toBe("run");
    expect(e!.attrs["status"]).toBe("running");
    expect(e!.version).toBe(r.toSeq);
    expect(r.count).toBe(1);
  });

  it("AttrSet 合并属性,version 推进", async () => {
    await db.commit({
      events: [
        {
          entityId: "p-1",
          type: "Created",
          payload: { entityType: "project", attrs: { name: "alpha" } },
        },
      ],
    });
    const r = await db.commit({
      events: [
        { entityId: "p-1", type: "AttrSet", payload: { name: "beta", color: "red" } },
      ],
    });

    const e = db.get("p-1");
    expect(e!.attrs).toEqual({ name: "beta", color: "red" });
    expect(e!.version).toBe(r.toSeq);
  });

  it("AttrUnset 删除指定属性", async () => {
    await db.commit({
      events: [
        {
          entityId: "p-1",
          type: "Created",
          payload: {
            entityType: "project",
            attrs: { name: "alpha", color: "red", tag: "x" },
          },
        },
      ],
    });
    await db.commit({
      events: [{ entityId: "p-1", type: "AttrUnset", payload: { keys: ["color", "tag"] } }],
    });
    const e = db.get("p-1");
    expect(e!.attrs).toEqual({ name: "alpha" });
  });

  it("Deleted 后 get 返回 undefined,match 不再包含", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    await db.commit({ events: [{ entityId: "r-1", type: "Deleted" }] });
    expect(db.get("r-1")).toBeUndefined();
    expect(db.match("run")).toHaveLength(0);
  });

  it("match(type) 返回该 type 全部 entity", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
        {
          entityId: "r-2",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "completed" } },
        },
        {
          entityId: "p-1",
          type: "Created",
          payload: { entityType: "project", attrs: {} },
        },
      ],
    });
    const runs = db.match("run");
    expect(runs.map((r) => r.id).sort()).toEqual(["r-1", "r-2"]);
  });

  it("match(type, where) 等值谓词过滤", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
        {
          entityId: "r-2",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "completed" } },
        },
      ],
    });
    const running = db.match("run", { status: "running" });
    expect(running.map((r) => r.id)).toEqual(["r-1"]);
  });

  it("commit 串行化:并发触发 fromSeq 单调递增", async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.commit({
        events: [
          {
            entityId: `e-${i}`,
            type: "Created",
            payload: { entityType: "x", attrs: { tag: "static" } },
          },
        ],
      }),
    );
    const receipts = await Promise.all(promises);
    const seqs = receipts.map((r) => r.fromSeq);
    // 严格单调递增
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    }
  });

  it("重启后回放日志重建索引", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    const c2 = await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { status: "completed" } }],
    });
    const lastBeforeRestart = db._lastSeq();
    db.close();

    const db2 = Pearl.open({ dir, fsync: false });
    try {
      const e = db2.get("r-1");
      expect(e).toBeDefined();
      expect(e!.attrs["status"]).toBe("completed");
      expect(db2._lastSeq()).toBe(lastBeforeRestart);
      // 后续 commit 接续 seq
      const r = await db2.commit({
        events: [{ entityId: "r-1", type: "AttrSet", payload: { status: "running" } }],
      });
      expect(r.fromSeq).toBeGreaterThan(c2.toSeq);
    } finally {
      db2.close();
    }
  });

  it("一次 commit 内多 event 共享 intentId", async () => {
    const r = await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: {} },
        },
        { entityId: "r-1", type: "AttrSet", payload: { status: "running" } },
        { entityId: "r-1", type: "AttrSet", payload: { status: "completed" } },
      ],
    });
    expect(r.count).toBe(3);
    const events = db._eventsFor("r-1");
    expect(events).toHaveLength(3);
    const intents = new Set(events.map((e) => e.intentId));
    expect(intents.size).toBe(1);
  });

  it("空 intent 应抛错", () => {
    expect(() => db.commit({ events: [] })).toThrow(/at least one event/);
    expect(() => db.commit({})).toThrow(/at least one event/);
  });

  it("Created 缺少 entityType 应抛 IntentRejected", () => {
    expect(() =>
      db.commit({
        events: [{ entityId: "x", type: "Created", payload: {} }],
      }),
    ).toThrow(IntentRejected);
  });
});

describe("Pearl - Edge + traverse", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(() => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("EdgeAdded 后 traverse out 找到目标", async () => {
    await db.commit({
      events: [
        {
          entityId: "run-1",
          type: "Created",
          payload: { entityType: "run", attrs: {} },
        },
        {
          entityId: "cp-1",
          type: "Created",
          payload: { entityType: "checkpoint", attrs: {} },
        },
      ],
    });
    await db.commit({
      edges: { add: [{ from: "run-1", to: "cp-1", type: "has_checkpoint" }] },
    });

    const out = db.traverse("run-1", { edgeType: "has_checkpoint" });
    expect(out.map((e) => e.id)).toEqual(["cp-1"]);
  });

  it("traverse in 方向", async () => {
    await db.commit({
      events: [
        {
          entityId: "run-1",
          type: "Created",
          payload: { entityType: "run", attrs: {} },
        },
        {
          entityId: "cp-1",
          type: "Created",
          payload: { entityType: "checkpoint", attrs: {} },
        },
      ],
    });
    await db.commit({
      edges: { add: [{ from: "run-1", to: "cp-1", type: "has_checkpoint" }] },
    });
    const back = db.traverse("cp-1", {
      direction: "in",
      edgeType: "has_checkpoint",
    });
    expect(back.map((e) => e.id)).toEqual(["run-1"]);
  });

  it("EdgeRemoved 后 traverse 不再返回", async () => {
    await db.commit({
      events: [
        {
          entityId: "a",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
        {
          entityId: "b",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
      ],
    });
    await db.commit({ edges: { add: [{ from: "a", to: "b", type: "link" }] } });
    await db.commit({ edges: { remove: [{ from: "a", to: "b", type: "link" }] } });
    expect(db.traverse("a", { edgeType: "link" })).toHaveLength(0);
  });

  it("traverse asOfSeq 看到过去的 edge", async () => {
    await db.commit({
      events: [
        {
          entityId: "a",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
        {
          entityId: "b",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
      ],
    });
    const r1 = await db.commit({
      edges: { add: [{ from: "a", to: "b", type: "link" }] },
    });
    await db.commit({ edges: { remove: [{ from: "a", to: "b", type: "link" }] } });
    // 现在已删除
    expect(db.traverse("a", { edgeType: "link" })).toHaveLength(0);
    // 时间旅行到 add 时,仍能看到
    expect(
      db.traverse("a", { edgeType: "link", asOfSeq: r1.toSeq }).map((e) => e.id),
    ).toEqual(["b"]);
  });

  it("空 edges 也算非空意图", async () => {
    // 纯 edges 操作(不含 events)的有效性
    await db.commit({
      events: [
        {
          entityId: "a",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
        {
          entityId: "b",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
      ],
    });
    const r = await db.commit({
      edges: { add: [{ from: "a", to: "b", type: "link" }] },
    });
    expect(r.count).toBe(1);
  });
});

describe("Pearl - history + at", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(() => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("history 返回 entity 全部 user 事件", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { status: "completed" } }],
    });
    const h = db.history("r-1");
    expect(h.map((e) => e.type)).toEqual(["Created", "AttrSet"]);
  });

  it("history reverse + limit", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: {} },
        },
        { entityId: "r-1", type: "AttrSet", payload: { a: 1 } },
        { entityId: "r-1", type: "AttrSet", payload: { b: 2 } },
        { entityId: "r-1", type: "AttrSet", payload: { c: 3 } },
      ],
    });
    const h = db.history("r-1", { reverse: true, limit: 2 });
    expect(h).toHaveLength(2);
    // 最新两条:c → b
    expect(h[0]!.payload).toEqual({ c: 3 });
    expect(h[1]!.payload).toEqual({ b: 2 });
  });

  it("at(id, seq) 返回过去状态", async () => {
    const c1 = await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { status: "completed" } }],
    });

    expect(db.get("r-1")!.attrs["status"]).toBe("completed");
    const past = db.at("r-1", c1.toSeq);
    expect(past!.attrs["status"]).toBe("running");
  });

  it("at 删除前的状态可见", async () => {
    const c1 = await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    await db.commit({ events: [{ entityId: "r-1", type: "Deleted" }] });

    expect(db.get("r-1")).toBeUndefined();
    const past = db.at("r-1", c1.toSeq);
    expect(past).toBeDefined();
    expect(past!.deleted).toBeUndefined();
    expect(past!.attrs["status"]).toBe("running");
  });

  it("at 早于 Created 返回 undefined", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: {} },
        },
      ],
    });
    expect(db.at("r-1", 0)).toBeUndefined();
  });
});

describe("Pearl - Shape registry", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(() => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("首次写入沉淀 shape", async () => {
    const r = await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running", count: 0 } },
        },
      ],
    });
    expect(r.driftAttrs).toHaveLength(2);
    const shape = db._shapeOf("run");
    expect(shape.get("status")).toBe("string");
    expect(shape.get("count")).toBe("number");
  });

  it("类型冲突拒绝意图,失败后 entity 不存在", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { count: 5 } },
        },
      ],
    });
    expect(() =>
      db.commit({
        events: [
          {
            entityId: "r-2",
            type: "Created",
            payload: { entityType: "run", attrs: { count: "five" } },
          },
        ],
      }),
    ).toThrow(IntentRejected);

    expect(db.get("r-2")).toBeUndefined();
    expect(db.match("run").map((e) => e.id)).toEqual(["r-1"]);
  });

  it("新字段自动 drift,不拒绝", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    const r = await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { newField: "x" } }],
    });
    expect(r.driftAttrs).toEqual([
      { entityType: "run", attr: "newField", primitive: "string" },
    ]);
    expect(db._shapeOf("run").get("newField")).toBe("string");
  });

  it("null 不约束 shape", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { maybeNull: null } },
        },
      ],
    });
    expect(db._shapeOf("run").has("maybeNull")).toBe(false);
    // 后续可以写字符串
    await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { maybeNull: "now-a-string" } }],
    });
    expect(db._shapeOf("run").get("maybeNull")).toBe("string");
  });

  it("expectedShape 硬约束:未声明的字段被拒", () => {
    expect(() =>
      db.commit({
        events: [
          {
            entityId: "r-1",
            type: "Created",
            payload: {
              entityType: "run",
              attrs: { status: "running", extra: "no" },
            },
          },
        ],
        expectedShape: { run: { status: "string" } },
      }),
    ).toThrow(/shape-not-allowed/);
  });

  it("Shape 跨重启持久化(由 ShapeExtended 事件重建)", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    db.close();
    const db2 = Pearl.open({ dir, fsync: false });
    try {
      expect(db2._shapeOf("run").get("status")).toBe("string");
      // 再写类型冲突,仍应被拒
      expect(() =>
        db2.commit({
          events: [
            {
              entityId: "r-2",
              type: "Created",
              payload: { entityType: "run", attrs: { status: 1 } },
            },
          ],
        }),
      ).toThrow(IntentRejected);
    } finally {
      db2.close();
    }
  });
});

describe("Pearl - 意图边界回滚", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("未提交意图在回放时被丢弃", async () => {
    const db = Pearl.open({ dir, fsync: false });
    const ok = await db.commit({
      events: [
        {
          entityId: "good",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
      ],
    });
    db.close();

    // 手工往 log 追加一个缺少 IntentCommitted 的"残缺意图"
    const path = join(dir, "events.log");
    const existing = readFileSync(path, "utf8");
    expect(existing).toContain("IntentCommitted");
    const lastGoodSeq = ok.toSeq + 1; // ok 的 toSeq 是 user 事件;IntentCommitted 占用 toSeq+1
    const brokenEvent = {
      id: "broken-event",
      seq: lastGoodSeq + 1,
      entityId: "broken",
      type: "Created",
      payload: { entityType: "x", attrs: {} },
      ts: Date.now(),
      intentId: "incomplete-intent",
    };
    appendFileSync(path, JSON.stringify(brokenEvent) + "\n");

    // 重新打开,残缺意图应被丢弃
    const db2 = Pearl.open({ dir, fsync: false });
    try {
      expect(db2.get("broken")).toBeUndefined();
      expect(db2.get("good")).toBeDefined();
      // 后续 commit 的 seq 必须越过被烧掉的 seq,不复用
      const r = await db2.commit({
        events: [
          {
            entityId: "after",
            type: "Created",
            payload: { entityType: "x", attrs: {} },
          },
        ],
      });
      expect(r.fromSeq).toBeGreaterThan(brokenEvent.seq);
    } finally {
      db2.close();
    }
  });

  it("尾部撕裂的最后一行被容忍", async () => {
    const db = Pearl.open({ dir, fsync: false });
    await db.commit({
      events: [
        {
          entityId: "ok",
          type: "Created",
          payload: { entityType: "x", attrs: {} },
        },
      ],
    });
    db.close();

    // 追加一个破损 JSON(模拟 fsync 前断电)
    const path = join(dir, "events.log");
    appendFileSync(path, '{"id":"bad","seq":99,"type":"Cre');

    const db2 = Pearl.open({ dir, fsync: false });
    try {
      expect(db2.get("ok")).toBeDefined();
    } finally {
      db2.close();
    }
  });
});
