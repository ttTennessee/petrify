// @petrify/db-pearl
//
// 基于 @petrify/pearl 的 DbContext 实现。每张 SQL 表映射到一种 pearl entity
// type;表间 FK 映射到 pearl edge 或 attr lookup。
//
// 用法:
//   import { createPearlDb } from "@petrify/db-pearl";
//   const ctx = createPearlDb({ dir: "./data/pearl" });

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { Pearl } from "@petrify/pearl";
import type { DbContext } from "@petrify/db-core";

import { createAdapterInstancesRepo } from "./repos/adapter-instances.js";
import { createBreakpointsRepo } from "./repos/breakpoints.js";
import { createCheckpointsRepo } from "./repos/checkpoints.js";
import { createGlobalConfigRepo } from "./repos/global-config.js";
import { createMcpServersRepo } from "./repos/mcp-servers.js";
import { createPermissionGrantsRepo } from "./repos/permission-grants.js";
import { createProjectsRepo } from "./repos/projects.js";
import { createRunEventsRepo } from "./repos/run-events.js";
import { createRunsRepo } from "./repos/runs.js";
import { createTemplatesRepo } from "./repos/templates.js";
import { createWorkflowsRepo } from "./repos/workflows.js";

export type PearlDbOptions = {
  /** pearl 数据目录,默认走 PETRIFY_DB 环境变量。 */
  dir?: string;
  /** 是否 fsync(测试可关)。 */
  fsync?: boolean;
};

export function createPearlDb(opts: PearlDbOptions = {}): DbContext {
  const raw = opts.dir ?? process.env.PETRIFY_DB ?? "./data/pearl";
  const dir = resolve(raw);
  mkdirSync(dir, { recursive: true });

  const pearl = Pearl.open({ dir, fsync: opts.fsync ?? true });

  const ctx: DbContext = {
    projects: createProjectsRepo(pearl),
    workflows: createWorkflowsRepo(pearl),
    runs: createRunsRepo(pearl),
    runEvents: createRunEventsRepo(pearl),
    checkpoints: createCheckpointsRepo(pearl),
    globalConfig: createGlobalConfigRepo(pearl),
    adapterInstances: createAdapterInstancesRepo(pearl),
    permissionGrants: createPermissionGrantsRepo(pearl),
    breakpoints: createBreakpointsRepo(pearl),
    mcpServers: createMcpServersRepo(pearl),
    templates: createTemplatesRepo(pearl),
    close() {
      pearl.close();
    },
  };

  return ctx;
}

/** 测试用:暴露底层 pearl 实例(seed project entity 等)。 */
export { Pearl } from "@petrify/pearl";
