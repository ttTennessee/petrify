// @petrify/db-sqlite
//
// 基于 better-sqlite3 的 DbContext 实现。Schema、PRAGMA、ALTER 全部原样从
// packages/server/src/db.ts 搬过来;Repo 方法收编各 route 里 inline 的 SQL。
//
// 用法:
//   import { createSqliteDb } from "@petrify/db-sqlite";
//   const ctx = createSqliteDb({ path: "./data/petrify.sqlite" });

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { DbContext } from "@petrify/db-core";

import { applySchema } from "./schema.js";
import { createProjectsRepo } from "./repos/projects.js";
import { createRunEventsRepo } from "./repos/run-events.js";
import { createWorkflowsRepo } from "./repos/workflows.js";
import {
  placeholderAdapterInstances,
  placeholderBreakpoints,
  placeholderCheckpoints,
  placeholderGlobalConfig,
  placeholderMcpServers,
  placeholderPermissionGrants,
  placeholderRuns,
  placeholderTemplates,
} from "./repos/placeholders.js";

export type SqliteDbOptions = {
  /** 数据库文件路径;`":memory:"` 表示内存库。默认走 PETRIFY_DB 环境变量。 */
  path?: string;
  /**
   * 复用已有的 Database 实例(server 脚手架阶段:与 legacy `db.ts` 共享连接,
   * 避免 FK 跨连接可见性问题)。提供时 path 被忽略,Schema 仍然会幂等 apply。
   */
  existingDb?: Database.Database;
};

export function createSqliteDb(opts: SqliteDbOptions = {}): DbContext {
  let db: Database.Database;
  let ownsConnection: boolean;

  if (opts.existingDb) {
    db = opts.existingDb;
    ownsConnection = false;
  } else {
    const raw = opts.path ?? process.env.PETRIFY_DB ?? "./data/petrify.sqlite";
    const dbPath = raw === ":memory:" ? ":memory:" : resolve(raw);
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    ownsConnection = true;
  }

  applySchema(db);

  const ctx: DbContext = {
    projects: createProjectsRepo(db),
    workflows: createWorkflowsRepo(db),
    runs: placeholderRuns,
    runEvents: createRunEventsRepo(db),
    checkpoints: placeholderCheckpoints,
    globalConfig: placeholderGlobalConfig,
    adapterInstances: placeholderAdapterInstances,
    permissionGrants: placeholderPermissionGrants,
    breakpoints: placeholderBreakpoints,
    mcpServers: placeholderMcpServers,
    templates: placeholderTemplates,
    close() {
      if (!ownsConnection) return; // 复用连接时由 owner 负责关闭
      try {
        db.close();
      } catch {
        /* ignore double-close */
      }
    },
  };

  return ctx;
}
