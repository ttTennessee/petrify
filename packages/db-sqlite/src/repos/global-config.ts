// GlobalConfig Repo —— Drizzle 实现。
//
// 收编 server/src/routes/config.ts、adapters/acp/permission-broker.test.ts 中
// 针对 global_config 表的 SQL。

import { eq, sql } from "drizzle-orm";
import type { GlobalConfigRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { globalConfig } from "../schema.js";

export function createGlobalConfigRepo(d: DrizzleDb): GlobalConfigRepo {
  return {
    list() {
      return d.select().from(globalConfig).all();
    },

    upsert(key, valueJson, updatedAt) {
      d.insert(globalConfig)
        .values({ key, value_json: valueJson, updated_at: updatedAt })
        .onConflictDoUpdate({
          target: globalConfig.key,
          set: {
            value_json: sql`excluded.value_json`,
            updated_at: sql`excluded.updated_at`,
          },
        })
        .run();
    },

    deleteByKey(key) {
      d.delete(globalConfig).where(eq(globalConfig.key, key)).run();
    },
  };
}
