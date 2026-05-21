// 冒烟:验证 db-pearl 的 WorkflowsRepo 行为与 db-sqlite 等价。
//
// 1. 手动 seed 一条 project 实体到 pearl(因为 server projects 路由还没迁,
//    pearl backend 下 project 数据不会自动出现)。
// 2. 跑 WorkflowsRepo 全套方法,断言读写自洽。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPearlDb, Pearl } from "../src/index.js";

describe("db-pearl WorkflowsRepo (smoke)", () => {
  let dir: string;
  let pearl: Pearl;
  let ctx: ReturnType<typeof createPearlDb>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "db-pearl-test-"));
    // seed project: 直接用底层 Pearl 实例,模拟 projects.ts 已迁移后的状态。
    pearl = Pearl.open({ dir, fsync: false });
    await pearl.commit({
      events: [
        {
          entityId: "proj-1",
          type: "Created",
          payload: {
            entityType: "project",
            attrs: { goal: "test", created_at: 1 },
          },
        },
      ],
    });
    pearl.close();

    ctx = createPearlDb({ dir, fsync: false });
  });

  afterEach(() => {
    ctx.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("insert → getById → updateGraph → getGraphById → listByProject", async () => {
    expect(ctx.projects.existsById("proj-1")).toBe(true);
    expect(ctx.projects.existsById("proj-missing")).toBe(false);

    await ctx.workflows.insert({
      id: "wf-1",
      project_id: "proj-1",
      graph_json: '{"nodes":[],"edges":[]}',
      created_at: 100,
    });

    const got = ctx.workflows.getById("wf-1");
    expect(got).toBeDefined();
    expect(got?.id).toBe("wf-1");
    expect(got?.project_id).toBe("proj-1");
    expect(got?.graph_json).toBe('{"nodes":[],"edges":[]}');
    expect(got?.created_at).toBe(100);
    expect(got?.last_verify_json).toBeNull();

    await ctx.workflows.updateGraph("wf-1", '{"nodes":[{"id":"n1"}],"edges":[]}');
    expect(ctx.workflows.getGraphById("wf-1")?.graph_json).toBe(
      '{"nodes":[{"id":"n1"}],"edges":[]}',
    );

    await ctx.workflows.updateVerify("wf-1", '{"ok":true}');
    expect(ctx.workflows.getById("wf-1")?.last_verify_json).toBe('{"ok":true}');

    await ctx.workflows.insert({
      id: "wf-2",
      project_id: "proj-1",
      graph_json: "{}",
      created_at: 200,
    });

    const list = ctx.workflows.listByProject("proj-1");
    expect(list).toHaveLength(2);
    // ORDER BY created_at DESC
    expect(list[0]?.id).toBe("wf-2");
    expect(list[1]?.id).toBe("wf-1");

    expect(ctx.workflows.getById("wf-missing")).toBeUndefined();
  });

  it("RunEventsRepo: append → listSince", async () => {
    // 不依赖 runs 表(尚未实现)。listSince 直接用 runId 反查边。
    await ctx.runEvents.append({
      event_id: "ev-1",
      run_id: "run-1",
      node_id: "n-a",
      type: "NodeStarted",
      payload_json: '{"x":1}',
      ts: 1,
    });
    await ctx.runEvents.append({
      event_id: "ev-2",
      run_id: "run-1",
      node_id: "n-a",
      type: "NodeCompleted",
      payload_json: '{"y":2}',
      ts: 2,
    });

    const all = ctx.runEvents.listSince("run-1");
    expect(all).toHaveLength(2);
    expect(all[0]?.event_id).toBe("ev-1");
    expect(all[1]?.event_id).toBe("ev-2");
    expect(all[0]!.id).toBeLessThan(all[1]!.id);

    const tail = ctx.runEvents.listSince("run-1", all[0]!.id);
    expect(tail).toHaveLength(1);
    expect(tail[0]?.event_id).toBe("ev-2");
  });
});
