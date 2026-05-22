// Backend 选择 + DbContext 单例。
//
// 所有 server 持久化均经此入口;legacy server/src/db.ts 已删除。
//
// 环境变量:
//   PETRIFY_DB_BACKEND   sqlite | pearl     (默认 sqlite)
//   PETRIFY_DB           SQLite 文件路径     (默认 ./data/petrify.sqlite)
//   PETRIFY_PEARL_DIR    Pearl 数据目录      (默认 ./data/pearl)

import type { DbContext } from "@petrify/db-core";
import { createSqliteDb } from "@petrify/db-sqlite";
import { createPearlDb } from "@petrify/db-pearl";

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
  // db-sqlite 独占连接,内部处理路径解析 / mkdir / pragma / applySchema。
  return createSqliteDb({});
}

export const dbContext: DbContext = build();
export const dbBackend: DbBackend = resolveBackend();
