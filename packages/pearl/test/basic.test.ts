import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Pearl } from "../src/index.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "pearl-test-"));
}

describe("Pearl W1 - 写后读", () => {
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
    await db.commit({
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
    expect(e!.version).toBe(1);
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
    await db.commit({
      events: [
        { entityId: "p-1", type: "AttrSet", payload: { name: "beta", color: "red" } },
      ],
    });

    const e = db.get("p-1");
    expect(e!.attrs).toEqual({ name: "beta", color: "red" });
    expect(e!.version).toBe(2);
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

  it("commit 串行化:并发触发仍保持 seq 单调", async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.commit({
        events: [
          {
            entityId: `e-${i}`,
            type: "Created",
            payload: { entityType: "x", attrs: { i } },
          },
        ],
      }),
    );
    const receipts = await Promise.all(promises);
    const seqs = receipts.map((r) => r.fromSeq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
    await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { status: "completed" } }],
    });
    db.close();

    const db2 = Pearl.open({ dir, fsync: false });
    try {
      const e = db2.get("r-1");
      expect(e).toBeDefined();
      expect(e!.attrs["status"]).toBe("completed");
      expect(db2._lastSeq()).toBe(2);
      // 后续 commit 接续 seq
      const r = await db2.commit({
        events: [{ entityId: "r-1", type: "AttrSet", payload: { tag: "x" } }],
      });
      expect(r.fromSeq).toBe(3);
    } finally {
      db2.close();
    }
  });

  it("一次 commit 内多 event 共享 intentId 与连续 seq", async () => {
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
    expect(r.toSeq - r.fromSeq).toBe(2);
    const events = db._eventsFor("r-1");
    expect(events).toHaveLength(3);
    const intents = new Set(events.map((e) => e.intentId));
    expect(intents.size).toBe(1);
  });

  it("空 events 数组应抛错", async () => {
    await expect(db.commit({ events: [] })).rejects.toThrow(/non-empty/);
  });

  it("Created 缺少 entityType 应抛错", async () => {
    await expect(
      db.commit({
        events: [{ entityId: "x", type: "Created", payload: {} }],
      }),
    ).rejects.toThrow(/entityType/);
  });
});
