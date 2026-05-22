// mcp_servers 实体在 pearl 里:
//   entity type = "mcp_server"
//   entity id   = name(natural key)
//   attrs       = McpServerRow 的所有列

import type { Pearl, Entity } from "@petrify/pearl";
import type { McpServerRow, McpServersRepo } from "@petrify/db-core";

const TYPE = "mcp_server";

export function createMcpServersRepo(pearl: Pearl): McpServersRepo {
  return {
    list() {
      return pearl
        .match(TYPE)
        .map((e) => entityToRow(e.id, e))
        .sort((a, b) => a.created_at - b.created_at);
    },

    getByName(name) {
      const ent = pearl.get(name);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(name, ent);
    },

    insert(row) {
      pearl.commit({
        events: [
          {
            entityId: row.name,
            type: "Created",
            payload: {
              entityType: TYPE,
              attrs: {
                transport: row.transport,
                command: row.command,
                args_json: row.args_json,
                env_json: row.env_json,
                url: row.url,
                headers_json: row.headers_json,
                enabled: row.enabled,
                created_at: row.created_at,
                updated_at: row.updated_at,
              },
            },
          },
        ],
      });
    },

    patch(name, patch) {
      pearl.commit({
        events: [
          {
            entityId: name,
            type: "AttrSet",
            payload: {
              transport: patch.transport,
              command: patch.command,
              args_json: patch.args_json,
              env_json: patch.env_json,
              url: patch.url,
              headers_json: patch.headers_json,
              updated_at: patch.updated_at,
            },
          },
        ],
      });
    },

    deleteByName(name) {
      const ent = pearl.get(name);
      if (!ent || ent.type !== TYPE || ent.deleted) return { changes: 0 };
      pearl.commit({
        events: [{ entityId: name, type: "Deleted", payload: {} }],
      });
      return { changes: 1 };
    },

    setEnabled(name, enabled, updatedAt) {
      pearl.commit({
        events: [
          {
            entityId: name,
            type: "AttrSet",
            payload: { enabled, updated_at: updatedAt },
          },
        ],
      });
    },
  };
}

function entityToRow(name: string, ent: Entity): McpServerRow {
  const a = ent.attrs;
  return {
    name,
    transport: String(a["transport"] ?? ""),
    command: a["command"] == null ? null : String(a["command"]),
    args_json: a["args_json"] == null ? null : String(a["args_json"]),
    env_json: a["env_json"] == null ? null : String(a["env_json"]),
    url: a["url"] == null ? null : String(a["url"]),
    headers_json: a["headers_json"] == null ? null : String(a["headers_json"]),
    enabled: Number(a["enabled"] ?? 0),
    created_at: Number(a["created_at"] ?? 0),
    updated_at: Number(a["updated_at"] ?? 0),
  };
}
