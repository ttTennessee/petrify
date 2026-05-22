// @petrify/db-sqlite
//
// 基于 Drizzle ORM (better-sqlite3) 的 DbContext 实现。Schema 定义在 ./schema.ts
// 既作为 Drizzle 类型源、也作为运行时 applySchema 的 DDL 来源。
//
// 用法:
//   import { createSqliteDb } from "@petrify/db-sqlite";
//   const ctx = createSqliteDb({ path: "./data/petrify.sqlite" });

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { DbContext } from "@petrify/db-core";

import { applySchema, schema } from "./schema.js";
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

export type SqliteDbOptions = {
  /** 数据库文件路径;`":memory:"` 表示内存库。默认走 PETRIFY_DB 环境变量。 */
  path?: string;
  /**
   * 复用已有的 Database 实例(脚手架阶段:与 legacy server/src/db.ts 共享连接,
   * 避免 FK 跨连接可见性问题)。本轮 server 已不再传 existingDb;保留入参以便
   * 测试 / 嵌入式场景复用。提供时 path 被忽略,Schema 仍幂等 apply。
   */
  existingDb?: Database.Database;
};

export function createSqliteDb(opts: SqliteDbOptions = {}): DbContext {
  let raw: Database.Database;
  let ownsConnection: boolean;

  if (opts.existingDb) {
    raw = opts.existingDb;
    ownsConnection = false;
  } else {
    const p = opts.path ?? process.env.PETRIFY_DB ?? "./data/petrify.sqlite";
    const dbPath = p === ":memory:" ? ":memory:" : resolve(p);
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    raw = new Database(dbPath);
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");
    ownsConnection = true;
  }

  // applySchema 在原始连接上跑 CREATE TABLE IF NOT EXISTS / ensureColumn,与
  // 历史 server/src/db.ts 行为一致;兼容已有 user DB。
  applySchema(raw);

  const d = drizzle(raw, { schema });

  const ctx: DbContext = {
    projects: createProjectsRepo(d),
    workflows: createWorkflowsRepo(d),
    runs: createRunsRepo(d),
    runEvents: createRunEventsRepo(d),
    checkpoints: createCheckpointsRepo(d),
    globalConfig: createGlobalConfigRepo(d),
    adapterInstances: createAdapterInstancesRepo(d),
    permissionGrants: createPermissionGrantsRepo(d),
    breakpoints: createBreakpointsRepo(d),
    mcpServers: createMcpServersRepo(d),
    templates: createTemplatesRepo(d),
    close() {
      if (!ownsConnection) return;
      try {
        raw.close();
      } catch {
        /* ignore double-close */
      }
    },
  };

  return ctx;
}
