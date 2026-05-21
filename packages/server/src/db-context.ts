// Backend 选择 + DbContext 单例。
//
// 本次脚手架阶段:legacy `db.ts` 仍然被未迁移的 routes 引用,继续打开自己的
// SQLite 连接。新 DbContext 是独立的、按 env 选 backend 的实例;目前只
// 服务 routes/workflows.ts 和 runtime/events.ts。
//
// 等所有 routes 都迁移到 DbContext 后,删 legacy db.ts。
//
// 环境变量:
//   PETRIFY_DB_BACKEND   sqlite | pearl     (默认 sqlite)
//   PETRIFY_DB           SQLite 文件路径     (默认 ./data/petrify.sqlite,与 legacy 共享)
//   PETRIFY_PEARL_DIR    Pearl 数据目录      (默认 ./data/pearl)

import type { DbContext } from "@petrify/db-core";
import { createSqliteDb } from "@petrify/db-sqlite";
import { createPearlDb } from "@petrify/db-pearl";
import { db as legacyDb } from "./db.js";

export type DbBackend = "sqlite" | "pearl";

function resolveBackend(): DbBackend {
  const raw = (process.env.PETRIFY_DB_BACKEND ?? "sqlite").toLowerCase();
  if (raw === "pearl") return "pearl";
  return "sqlite";
}

function build(): DbContext {
  const backend = resolveBackend();
  if (backend === "pearl") {
    const dir = process.env.PETRIFY_PEARL_DIR ?? "./data/pearl";
    return createPearlDb({ dir });
  }
  // 复用 legacy db.ts 的同一连接,避免双连接 + FK 可见性问题(尤其是
  // :memory: 模式下两条连接看不到彼此的写入)。等所有 route 迁移到 ctx
  // 后,legacy db.ts 整个删掉。
  return createSqliteDb({ existingDb: legacyDb });
}

export const dbContext: DbContext = build();
export const dbBackend: DbBackend = resolveBackend();
