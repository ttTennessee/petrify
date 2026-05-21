import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Pearl, read } from "../src/index.js";
import type { Entity, Event, ReadIntent } from "../src/index.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "pearl-intent-"));
}

describe("ReadIntent + execute", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(async () => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });

    await db.commit({
      events: [
        {
          entityId: "p-1",
          type: "Created",
          payload: { entityType: "project", attrs: { name: "alpha" } },
        },
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running", progress: 0.5 } },
        },
        {
          entityId: "r-2",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "completed", progress: 1.0 } },
        },
        {
          entityId: "cp-1",
          type: "Created",
          payload: { entityType: "checkpoint", attrs: { ts: 100 } },
        },
        {
          entityId: "cp-2",
          type: "Created",
          payload: { entityType: "checkpoint", attrs: { ts: 200 } },
        },
      ],
      edges: {
        add: [
          { from: "p-1", to: "r-1", type: "has_run" },
          { from: "p-1", to: "r-2", type: "has_run" },
          { from: "r-1", to: "cp-1", type: "has_checkpoint" },
          { from: "r-1", to: "cp-2", type: "has_checkpoint" },
        ],
      },
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("get 模式返回单个 entity", () => {
    const intent = read({ get: "r-1" });
    const result = db.execute(intent) as Record<string, unknown>;
    expect(result).toBeDefined();
    expect(result["id"]).toBe("r-1");
    expect(result["type"]).toBe("run");
  });

  it("get 不存在返回 undefined", () => {
    const result = db.execute({ get: "missing" });
    expect(result).toBeUndefined();
  });

  it("match 模式返回 entity 数组", () => {
    const result = db.execute({ match: { type: "run" } }) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result.map((r) => r["id"]).sort()).toEqual(["r-1", "r-2"]);
  });

  it("match where 过滤", () => {
    const result = db.execute({
      match: { type: "run", where: { status: "running" } },
    }) as Array<Record<string, unknown>>;
    expect(result.map((r) => r["id"])).toEqual(["r-1"]);
  });

  it("match + traverse 挂载关系到 as 键", () => {
    const result = db.execute({
      match: { type: "project" },
      traverse: [{ edge: "has_run", as: "runs" }],
    }) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    const runs = result[0]!["runs"] as Entity[];
    expect(runs.map((r) => r.id).sort()).toEqual(["r-1", "r-2"]);
  });

  it("project 选择字段 + 嵌套 traverse 投影", () => {
    const intent: ReadIntent = {
      match: { type: "project" },
      traverse: [
        { edge: "has_run", as: "runs" },
      ],
      project: {
        id: true,
        attrs: ["name"],
        runs: { id: true, attrs: ["status"] },
      },
    };
    const result = db.execute(intent) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    const p = result[0]!;
    expect(p["id"]).toBe("p-1");
    expect(p["attrs"]).toEqual({ name: "alpha" });
    const runs = p["runs"] as Array<Record<string, unknown>>;
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(Object.keys(r).sort()).toEqual(["attrs", "id"]);
      const attrs = r["attrs"] as Record<string, unknown>;
      expect(Object.keys(attrs)).toEqual(["status"]);
    }
  });

  it("traverse limit 限制结果数量", () => {
    const result = db.execute({
      get: "r-1",
      traverse: [{ edge: "has_checkpoint", as: "checkpoints", limit: 1 }],
    }) as Record<string, unknown>;
    const cps = result["checkpoints"] as Entity[];
    expect(cps).toHaveLength(1);
  });

  it("traverse where 过滤目标 entity", () => {
    const result = db.execute({
      get: "r-1",
      traverse: [
        { edge: "has_checkpoint", as: "checkpoints", where: { ts: 200 } },
      ],
    }) as Record<string, unknown>;
    const cps = result["checkpoints"] as Entity[];
    expect(cps.map((c) => c.id)).toEqual(["cp-2"]);
  });

  it("history 模式返回事件流(含 from 端 edge 事件)", async () => {
    await db.commit({
      events: [{ entityId: "r-1", type: "AttrSet", payload: { progress: 0.9 } }],
    });
    // r-1 是 has_checkpoint 的 from,所以 2 条 EdgeAdded 都挂在 r-1 历史上
    const events = db.execute({ history: { entityId: "r-1" } }) as Event[];
    expect(events.map((e) => e.type)).toEqual([
      "Created",
      "EdgeAdded",
      "EdgeAdded",
      "AttrSet",
    ]);

    // types 过滤可以只看 entity 状态变更
    const stateOnly = db.execute({
      history: { entityId: "r-1", opts: { types: ["Created", "AttrSet"] } },
    }) as Event[];
    expect(stateOnly.map((e) => e.type)).toEqual(["Created", "AttrSet"]);
  });

  it("at 模式时间旅行", async () => {
    const c1 = await db.commit({
      events: [
        {
          entityId: "x-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    await db.commit({
      events: [{ entityId: "x-1", type: "AttrSet", payload: { status: "completed" } }],
    });
    const past = db.execute({ at: { entityId: "x-1", asOfSeq: c1.toSeq } }) as Entity;
    expect(past.attrs["status"]).toBe("running");
  });

  it("asOfSeq 作用于 get + traverse", async () => {
    // 必须先快照 seq:_eventsFor 返回的是引擎内部共享数组,后续 commit 会就地 push
    const initialEvents = db._eventsFor("r-1");
    expect(initialEvents.length).toBeGreaterThan(0);
    const snapshotSeq = initialEvents[initialEvents.length - 1]!.seq;

    // 再加一个 checkpoint
    await db.commit({
      events: [
        {
          entityId: "cp-3",
          type: "Created",
          payload: { entityType: "checkpoint", attrs: { ts: 300 } },
        },
      ],
      edges: { add: [{ from: "r-1", to: "cp-3", type: "has_checkpoint" }] },
    });

    // 现在 traverse 应看到 3 个
    const nowResult = db.execute({
      get: "r-1",
      traverse: [{ edge: "has_checkpoint", as: "checkpoints" }],
    }) as Record<string, unknown>;
    expect((nowResult["checkpoints"] as Entity[]).length).toBe(3);

    // 时间旅行到 beforeEach 末尾(只看得到 2 个)
    const pastResult = db.execute({
      get: "r-1",
      traverse: [{ edge: "has_checkpoint", as: "checkpoints" }],
      asOfSeq: snapshotSeq,
    }) as Record<string, unknown>;
    expect((pastResult["checkpoints"] as Entity[]).length).toBe(2);
  });

  it("entry 模式互斥校验", () => {
    expect(() =>
      db.execute({
        get: "r-1",
        match: { type: "run" },
      } as ReadIntent),
    ).toThrow(/exactly one entry/);

    expect(() => db.execute({} as ReadIntent)).toThrow(/exactly one entry/);
  });

  it("意图本身可二进制 roundtrip 并执行", () => {
    const intent: ReadIntent = {
      match: { type: "run", where: { status: "running" } },
      project: { id: true, attrs: ["status"] },
    };
    const buf = Pearl.toBinary(intent as unknown as import("../src/index.js").Value);
    const decoded = Pearl.fromBinary(buf) as ReadIntent;
    const result = db.execute(decoded) as Array<Record<string, unknown>>;
    expect(result).toEqual([{ id: "r-1", attrs: { status: "running" } }]);
  });
});
