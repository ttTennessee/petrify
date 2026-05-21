// McpServers Repo —— Drizzle 实现。
//
// 收编 server/src/services/mcp-servers.ts 中针对 mcp_servers 表的 SQL。

import { asc, eq } from "drizzle-orm";
import type { McpServerRow, McpServersRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { mcpServers } from "../schema.js";

export function createMcpServersRepo(d: DrizzleDb): McpServersRepo {
  return {
    list() {
      return d
        .select()
        .from(mcpServers)
        .orderBy(asc(mcpServers.created_at))
        .all() as McpServerRow[];
    },

    getByName(name) {
      const r = d
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();
      return r as McpServerRow | undefined;
    },

    insert(row) {
      d.insert(mcpServers)
        .values({
          name: row.name,
          transport: row.transport,
          command: row.command,
          args_json: row.args_json,
          env_json: row.env_json,
          url: row.url,
          headers_json: row.headers_json,
          enabled: row.enabled,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })
        .run();
    },

    patch(name, patch) {
      d.update(mcpServers)
        .set({
          transport: patch.transport,
          command: patch.command,
          args_json: patch.args_json,
          env_json: patch.env_json,
          url: patch.url,
          headers_json: patch.headers_json,
          updated_at: patch.updated_at,
        })
        .where(eq(mcpServers.name, name))
        .run();
    },

    deleteByName(name) {
      const info = d
        .delete(mcpServers)
        .where(eq(mcpServers.name, name))
        .run();
      return { changes: info.changes };
    },

    setEnabled(name, enabled, updatedAt) {
      d.update(mcpServers)
        .set({ enabled, updated_at: updatedAt })
        .where(eq(mcpServers.name, name))
        .run();
    },
  };
}
