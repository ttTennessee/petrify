// 其余 9 个 Repo 在本次脚手架阶段不提供方法,后续迁移 server 各 route 时
// 把对应 inline SQL 收编进来即可。所有接口当前为空,这里返回空对象。

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
