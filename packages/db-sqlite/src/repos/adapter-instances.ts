// AdapterInstances Repo —— Drizzle 实现。
//
// 收编 server/src/adapters/persistence.ts 中针对 adapter_instances 表的 SQL。

import { asc, eq, sql } from "drizzle-orm";
import type { AdapterInstanceRow, AdapterInstancesRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { adapterInstances } from "../schema.js";

export function createAdapterInstancesRepo(
  d: DrizzleDb,
): AdapterInstancesRepo {
  return {
    list() {
      return d
        .select()
        .from(adapterInstances)
        .orderBy(asc(adapterInstances.created_at))
        .all() as AdapterInstanceRow[];
    },

    getByName(name) {
      const r = d
        .select()
        .from(adapterInstances)
        .where(eq(adapterInstances.name, name))
        .get();
      return r as AdapterInstanceRow | undefined;
    },

    insert(row) {
      d.insert(adapterInstances)
        .values({
          name: row.name,
          catalog_id: row.catalog_id,
          kind: row.kind,
          enabled: row.enabled,
          command: row.command,
          args_json: row.args_json,
          env_json: row.env_json,
          default_cwd: row.default_cwd,
          endpoint: row.endpoint,
          status: row.status,
          status_detail: row.status_detail,
          last_probed_at: row.last_probed_at,
          keep_alive: row.keep_alive,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })
        .run();
    },

    patch(name, patch) {
      // 与 legacy SQL 等价:patch 隐含 enabled=0 + status='unknown' + 清空 status_detail / last_probed_at。
      d.update(adapterInstances)
        .set({
          catalog_id: patch.catalog_id,
          kind: patch.kind,
          command: patch.command,
          args_json: patch.args_json,
          env_json: patch.env_json,
          default_cwd: patch.default_cwd,
          endpoint: patch.endpoint,
          keep_alive: patch.keep_alive,
          enabled: 0,
          status: "unknown",
          status_detail: null,
          last_probed_at: null,
          updated_at: patch.updated_at,
        })
        .where(eq(adapterInstances.name, name))
        .run();
    },

    deleteByName(name) {
      const info = d
        .delete(adapterInstances)
        .where(eq(adapterInstances.name, name))
        .run();
      return { changes: info.changes };
    },

    setEnabled(name, enabled, updatedAt) {
      d.update(adapterInstances)
        .set({ enabled, updated_at: updatedAt })
        .where(eq(adapterInstances.name, name))
        .run();
    },

    setKeepAlive(name, keepAlive, updatedAt) {
      d.update(adapterInstances)
        .set({ keep_alive: keepAlive, updated_at: updatedAt })
        .where(eq(adapterInstances.name, name))
        .run();
    },

    setStatus(name, patch) {
      d.update(adapterInstances)
        .set({
          status: patch.status,
          status_detail: patch.status_detail,
          last_probed_at: patch.last_probed_at,
          updated_at: patch.updated_at,
        })
        .where(eq(adapterInstances.name, name))
        .run();
    },
  };
}
