// @petrify/db-core
//
// 持久化层的接口契约。两套实现(@petrify/db-sqlite / @petrify/db-pearl)各自
// 实现 DbContext;server 只依赖本包,按 env 选实现。

export type {
  ProjectRow,
  WorkflowRow,
  RunRow,
  RunEventRow,
  CheckpointRow,
  GlobalConfigRow,
  AdapterInstanceRow,
  PermissionGrantRow,
  BreakpointRow,
  McpServerRow,
  TemplateRow,
} from "./types.js";

export type {
  ProjectsRepo,
  WorkflowsRepo,
  RunsRepo,
  RunEventsRepo,
  CheckpointsRepo,
  GlobalConfigRepo,
  AdapterInstancesRepo,
  PermissionGrantsRepo,
  BreakpointsRepo,
  McpServersRepo,
  TemplatesRepo,
} from "./repos.js";

import type {
  AdapterInstancesRepo,
  BreakpointsRepo,
  CheckpointsRepo,
  GlobalConfigRepo,
  McpServersRepo,
  PermissionGrantsRepo,
  ProjectsRepo,
  RunEventsRepo,
  RunsRepo,
  TemplatesRepo,
  WorkflowsRepo,
} from "./repos.js";

export interface DbContext {
  projects: ProjectsRepo;
  workflows: WorkflowsRepo;
  runs: RunsRepo;
  runEvents: RunEventsRepo;
  checkpoints: CheckpointsRepo;
  globalConfig: GlobalConfigRepo;
  adapterInstances: AdapterInstancesRepo;
  permissionGrants: PermissionGrantsRepo;
  breakpoints: BreakpointsRepo;
  mcpServers: McpServersRepo;
  templates: TemplatesRepo;
  close(): void;
}

export type DbFactory = (opts: { dir?: string; path?: string }) => DbContext;

/** 未实现 Repo 方法的统一桩。 */
export class NotMigratedError extends Error {
  constructor(repo: string, method: string) {
    super(`${repo}.${method} not migrated yet — still uses server/src/db.ts directly`);
    this.name = "NotMigratedError";
  }
}
