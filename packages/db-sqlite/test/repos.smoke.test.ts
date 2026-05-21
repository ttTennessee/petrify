// 冒烟:11 个 Repo 全部 insert+read 走一遍,验证 schema/migrator/Drizzle builder
// 集成正常。每个测试用一个全新的 in-memory DB。

import { describe, expect, it } from "vitest";

import { createSqliteDb } from "../src/index.js";

function fresh() {
  return createSqliteDb({ path: ":memory:" });
}

describe("db-sqlite smoke", () => {
  it("projects: insert / list / getById / getGoalAndDescription / getRuntimePolicy", () => {
    const ctx = fresh();
    ctx.projects.insert({
      id: "p1",
      goal: "g",
      description: "d",
      constraints_json: "[]",
      preferred_tools_json: "[]",
      runtime_policy_json: '{"x":1}',
      status: "draft",
      created_at: 100,
    });
    expect(ctx.projects.existsById("p1")).toBe(true);
    expect(ctx.projects.list()).toHaveLength(1);
    expect(ctx.projects.getById("p1")?.goal).toBe("g");
    expect(ctx.projects.getGoalAndDescription("p1")).toEqual({ goal: "g", description: "d" });
    expect(ctx.projects.getRuntimePolicy("p1")?.runtime_policy_json).toBe('{"x":1}');
    ctx.close();
  });

  it("workflows: insert / getById / listByProject / updateGraph / updateVerify / getForTemplate", async () => {
    const ctx = fresh();
    ctx.projects.insert({
      id: "p1", goal: "g", description: null,
      constraints_json: null, preferred_tools_json: null, runtime_policy_json: null,
      status: "draft", created_at: 0,
    });
    await ctx.workflows.insert({ id: "w1", project_id: "p1", graph_json: "{}", created_at: 1 });
    expect(ctx.workflows.getById("w1")?.graph_json).toBe("{}");
    expect(ctx.workflows.listByProject("p1")).toHaveLength(1);
    await ctx.workflows.updateGraph("w1", '{"n":1}');
    await ctx.workflows.updateVerify("w1", '{"status":"pass"}');
    expect(ctx.workflows.getGraphAndVerify("w1")).toEqual({
      graph_json: '{"n":1}', last_verify_json: '{"status":"pass"}',
    });
    expect(ctx.workflows.getProjectId("w1")?.project_id).toBe("p1");
    expect(ctx.workflows.getForTemplate("w1")?.project_id).toBe("p1");
    ctx.close();
  });

  it("runs / checkpoints: insert / list / updateStatus / updateLastCheckpoint", () => {
    const ctx = fresh();
    ctx.projects.insert({
      id: "p1", goal: "g", description: null,
      constraints_json: null, preferred_tools_json: null, runtime_policy_json: null,
      status: "draft", created_at: 0,
    });
    void ctx.workflows.insert({ id: "w1", project_id: "p1", graph_json: "{}", created_at: 0 });
    ctx.runs.insert({ id: "r1", workflow_id: "w1", status: "running", started_at: 1 });
    ctx.checkpoints.insert({ id: "cp1", run_id: "r1", label: null, blob_json: "{}", created_at: 2 });
    ctx.runs.updateLastCheckpoint("r1", "cp1");
    expect(ctx.runs.getById("r1")?.last_checkpoint_id).toBe("cp1");
    expect(ctx.checkpoints.listByRun("r1")).toHaveLength(1);
    expect(ctx.checkpoints.getById("cp1")?.id).toBe("cp1");
    ctx.runs.updateStatus("r1", { status: "completed", finished_at: 3, error: null });
    expect(ctx.runs.getStatus("r1")).toBe("completed");
    expect(ctx.runs.listByWorkflow("w1", 10)).toHaveLength(1);
    expect(ctx.runs.getLatestByWorkflow("w1")?.id).toBe("r1");
    ctx.close();
  });

  it("run_events: append + listSince + listTypesAndNodes", async () => {
    const ctx = fresh();
    ctx.projects.insert({
      id: "p1", goal: "g", description: null,
      constraints_json: null, preferred_tools_json: null, runtime_policy_json: null,
      status: "draft", created_at: 0,
    });
    void ctx.workflows.insert({ id: "w1", project_id: "p1", graph_json: "{}", created_at: 0 });
    ctx.runs.insert({ id: "r1", workflow_id: "w1", status: "running", started_at: 1 });
    await ctx.runEvents.append({ event_id: "e1", run_id: "r1", node_id: "n1", type: "Started", payload_json: "{}", ts: 1 });
    await ctx.runEvents.append({ event_id: "e2", run_id: "r1", node_id: null, type: "Completed", payload_json: "{}", ts: 2 });
    const evs = ctx.runEvents.listSince("r1");
    expect(evs).toHaveLength(2);
    expect(evs[0].id).toBe(1);
    const since = ctx.runEvents.listSince("r1", 1);
    expect(since).toHaveLength(1);
    expect(ctx.runEvents.listTypesAndNodes("r1")).toEqual([
      { type: "Started", node_id: "n1" },
      { type: "Completed", node_id: null },
    ]);
    ctx.close();
  });

  it("global_config: upsert (insert + update) + list + deleteByKey", () => {
    const ctx = fresh();
    ctx.globalConfig.upsert("k1", '"v1"', 100);
    ctx.globalConfig.upsert("k1", '"v2"', 200); // overwrite
    const rows = ctx.globalConfig.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].value_json).toBe('"v2"');
    expect(rows[0].updated_at).toBe(200);
    ctx.globalConfig.deleteByKey("k1");
    expect(ctx.globalConfig.list()).toHaveLength(0);
    ctx.close();
  });

  it("adapter_instances: full CRUD + setEnabled + setStatus", () => {
    const ctx = fresh();
    ctx.adapterInstances.insert({
      name: "a1", catalog_id: null, kind: "spawn", enabled: 0,
      command: "echo", args_json: "[]", env_json: "{}", default_cwd: null, endpoint: null,
      status: "unknown", status_detail: null, last_probed_at: null,
      created_at: 1, updated_at: 1,
    });
    expect(ctx.adapterInstances.list()).toHaveLength(1);
    ctx.adapterInstances.setEnabled("a1", 1, 5);
    expect(ctx.adapterInstances.getByName("a1")?.enabled).toBe(1);
    ctx.adapterInstances.setStatus("a1", { status: "ok", status_detail: "fine", last_probed_at: 10, updated_at: 10 });
    expect(ctx.adapterInstances.getByName("a1")?.status).toBe("ok");
    ctx.adapterInstances.patch("a1", {
      catalog_id: "c1", kind: "spawn", command: "ls", args_json: null,
      env_json: null, default_cwd: null, endpoint: null, updated_at: 20,
    });
    expect(ctx.adapterInstances.getByName("a1")?.enabled).toBe(0); // patch resets
    expect(ctx.adapterInstances.deleteByName("a1").changes).toBe(1);
    ctx.close();
  });

  it("permission_grants: upsert + getDecision + deleteAll", () => {
    const ctx = fresh();
    ctx.permissionGrants.upsert({
      project_id: "p", node_id: "n", tool_kind: "edit", decision: "allow", created_at: 1,
    });
    expect(ctx.permissionGrants.getDecision("p", "n", "edit")).toBe("allow");
    ctx.permissionGrants.upsert({
      project_id: "p", node_id: "n", tool_kind: "edit", decision: "deny", created_at: 2,
    });
    expect(ctx.permissionGrants.getDecision("p", "n", "edit")).toBe("deny");
    ctx.permissionGrants.deleteAll();
    expect(ctx.permissionGrants.getDecision("p", "n", "edit")).toBeUndefined();
    ctx.close();
  });

  it("breakpoints: insert / setEnabled / hasEnabled / deleteByWorkflowAndNode", () => {
    const ctx = fresh();
    ctx.projects.insert({
      id: "p1", goal: "g", description: null,
      constraints_json: null, preferred_tools_json: null, runtime_policy_json: null,
      status: "draft", created_at: 0,
    });
    void ctx.workflows.insert({ id: "w1", project_id: "p1", graph_json: "{}", created_at: 0 });
    ctx.breakpoints.insert({
      id: "b1", workflow_id: "w1", node_id: "n1", enabled: 1, created_at: 1,
    });
    expect(ctx.breakpoints.hasEnabled("w1", "n1")).toBe(true);
    ctx.breakpoints.setEnabled("b1", 0);
    expect(ctx.breakpoints.hasEnabled("w1", "n1")).toBe(false);
    expect(ctx.breakpoints.findByWorkflowAndNode("w1", "n1")?.id).toBe("b1");
    expect(ctx.breakpoints.deleteByWorkflowAndNode("w1", "n1").changes).toBe(1);
    expect(ctx.breakpoints.listByWorkflow("w1")).toHaveLength(0);
    ctx.close();
  });

  it("mcp_servers: full CRUD + setEnabled", () => {
    const ctx = fresh();
    ctx.mcpServers.insert({
      name: "m1", transport: "stdio", command: "x", args_json: "[]", env_json: "[]",
      url: null, headers_json: "[]", enabled: 1, created_at: 1, updated_at: 1,
    });
    expect(ctx.mcpServers.list()).toHaveLength(1);
    ctx.mcpServers.patch("m1", {
      transport: "http", command: null, args_json: null, env_json: null,
      url: "http://x", headers_json: null, updated_at: 2,
    });
    expect(ctx.mcpServers.getByName("m1")?.transport).toBe("http");
    ctx.mcpServers.setEnabled("m1", 0, 3);
    expect(ctx.mcpServers.getByName("m1")?.enabled).toBe(0);
    expect(ctx.mcpServers.deleteByName("m1").changes).toBe(1);
    ctx.close();
  });

  it("templates: insert / list / getById / findByName / deleteById", () => {
    const ctx = fresh();
    ctx.templates.insert({
      id: "t1", name: "tpl-1", description: null, tags_json: "[]",
      graph_json: "{}", runtime_policy_json: null, adapter_bindings_json: null,
      source_workflow_id: null, origin: "local", created_at: 1, updated_at: 1,
    });
    expect(ctx.templates.list()).toHaveLength(1);
    expect(ctx.templates.getById("t1")?.name).toBe("tpl-1");
    expect(ctx.templates.findByName("tpl-1")?.id).toBe("t1");
    expect(ctx.templates.deleteById("t1").changes).toBe(1);
    expect(ctx.templates.list()).toHaveLength(0);
    ctx.close();
  });
});
