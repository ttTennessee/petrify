// 同 db-sqlite 的 placeholders.ts:其余 8 个 Repo 在脚手架阶段为空对象。

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

export const placeholderRuns: RunsRepo = {};
export const placeholderCheckpoints: CheckpointsRepo = {};
export const placeholderGlobalConfig: GlobalConfigRepo = {};
export const placeholderAdapterInstances: AdapterInstancesRepo = {};
export const placeholderPermissionGrants: PermissionGrantsRepo = {};
export const placeholderBreakpoints: BreakpointsRepo = {};
export const placeholderMcpServers: McpServersRepo = {};
export const placeholderTemplates: TemplatesRepo = {};
