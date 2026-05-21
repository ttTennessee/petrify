// 未实现 Repo 的 throw-stub。pearl backend 走到这些路径会爆;workflows /
// run_events / projects.existsById 之外的所有调用都是预期失败,等后续 PR
// 用 pearl 真正实现。
//
// 该文件只满足类型契约,不承担运行时正确性。

import type {
  AdapterInstancesRepo,
  BreakpointsRepo,
  CheckpointsRepo,
  GlobalConfigRepo,
  McpServersRepo,
  PermissionGrantsRepo,
  RunsRepo,
  TemplatesRepo,
} from "@petrify/db-core";

function notImpl(repo: string, method: string): never {
  throw new Error(
    `db-pearl: ${repo}.${method} not implemented yet — use sqlite backend or implement in db-pearl`,
  );
}

export const placeholderRuns: RunsRepo = {
  insert: () => notImpl("runs", "insert"),
  insertSingleNode: () => notImpl("runs", "insertSingleNode"),
  insertMinimal: () => notImpl("runs", "insertMinimal"),
  listByWorkflow: () => notImpl("runs", "listByWorkflow"),
  getById: () => notImpl("runs", "getById"),
  getCore: () => notImpl("runs", "getCore"),
  getLatestByWorkflow: () => notImpl("runs", "getLatestByWorkflow"),
  updateStatus: () => notImpl("runs", "updateStatus"),
  updateLastCheckpoint: () => notImpl("runs", "updateLastCheckpoint"),
  getStatus: () => notImpl("runs", "getStatus"),
};

export const placeholderCheckpoints: CheckpointsRepo = {
  insert: () => notImpl("checkpoints", "insert"),
  listByRun: () => notImpl("checkpoints", "listByRun"),
  getById: () => notImpl("checkpoints", "getById"),
};

export const placeholderGlobalConfig: GlobalConfigRepo = {
  list: () => notImpl("globalConfig", "list"),
  upsert: () => notImpl("globalConfig", "upsert"),
  deleteByKey: () => notImpl("globalConfig", "deleteByKey"),
};

export const placeholderAdapterInstances: AdapterInstancesRepo = {
  list: () => notImpl("adapterInstances", "list"),
  getByName: () => notImpl("adapterInstances", "getByName"),
  insert: () => notImpl("adapterInstances", "insert"),
  patch: () => notImpl("adapterInstances", "patch"),
  deleteByName: () => notImpl("adapterInstances", "deleteByName"),
  setEnabled: () => notImpl("adapterInstances", "setEnabled"),
  setStatus: () => notImpl("adapterInstances", "setStatus"),
};

export const placeholderPermissionGrants: PermissionGrantsRepo = {
  upsert: () => notImpl("permissionGrants", "upsert"),
  getDecision: () => notImpl("permissionGrants", "getDecision"),
  deleteAll: () => notImpl("permissionGrants", "deleteAll"),
};

export const placeholderBreakpoints: BreakpointsRepo = {
  listByWorkflow: () => notImpl("breakpoints", "listByWorkflow"),
  findByWorkflowAndNode: () => notImpl("breakpoints", "findByWorkflowAndNode"),
  insert: () => notImpl("breakpoints", "insert"),
  setEnabled: () => notImpl("breakpoints", "setEnabled"),
  deleteByWorkflowAndNode: () =>
    notImpl("breakpoints", "deleteByWorkflowAndNode"),
  hasEnabled: () => notImpl("breakpoints", "hasEnabled"),
};

export const placeholderMcpServers: McpServersRepo = {
  list: () => notImpl("mcpServers", "list"),
  getByName: () => notImpl("mcpServers", "getByName"),
  insert: () => notImpl("mcpServers", "insert"),
  patch: () => notImpl("mcpServers", "patch"),
  deleteByName: () => notImpl("mcpServers", "deleteByName"),
  setEnabled: () => notImpl("mcpServers", "setEnabled"),
};

export const placeholderTemplates: TemplatesRepo = {
  list: () => notImpl("templates", "list"),
  getById: () => notImpl("templates", "getById"),
  findByName: () => notImpl("templates", "findByName"),
  insert: () => notImpl("templates", "insert"),
  deleteById: () => notImpl("templates", "deleteById"),
};
