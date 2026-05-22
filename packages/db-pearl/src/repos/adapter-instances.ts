// adapter_instances 实体在 pearl 里:
//   entity type = "adapter_instance"
//   entity id   = name(natural key)
//   attrs       = AdapterInstanceRow 的所有列

import type { Pearl, Entity } from "@petrify/pearl";
import type {
  AdapterInstanceRow,
  AdapterInstancesRepo,
} from "@petrify/db-core";

const TYPE = "adapter_instance";

export function createAdapterInstancesRepo(
  pearl: Pearl,
): AdapterInstancesRepo {
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
                created_at: row.created_at,
                updated_at: row.updated_at,
              },
            },
          },
        ],
      });
    },

    patch(name, patch) {
      // 对齐 sqlite:patch 隐含 enabled=0 + status='unknown' + 清空 status_detail / last_probed_at。
      pearl.commit({
        events: [
          {
            entityId: name,
            type: "AttrSet",
            payload: {
              catalog_id: patch.catalog_id,
              kind: patch.kind,
              command: patch.command,
              args_json: patch.args_json,
              env_json: patch.env_json,
              default_cwd: patch.default_cwd,
              endpoint: patch.endpoint,
              enabled: 0,
              status: "unknown",
              status_detail: null,
              last_probed_at: null,
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

    setStatus(name, patch) {
      pearl.commit({
        events: [
          {
            entityId: name,
            type: "AttrSet",
            payload: {
              status: patch.status,
              status_detail: patch.status_detail,
              last_probed_at: patch.last_probed_at,
              updated_at: patch.updated_at,
            },
          },
        ],
      });
    },
  };
}

function entityToRow(name: string, ent: Entity): AdapterInstanceRow {
  const a = ent.attrs;
  return {
    name,
    catalog_id: a["catalog_id"] == null ? null : String(a["catalog_id"]),
    kind: String(a["kind"] ?? ""),
    enabled: Number(a["enabled"] ?? 0),
    command: a["command"] == null ? null : String(a["command"]),
    args_json: a["args_json"] == null ? null : String(a["args_json"]),
    env_json: a["env_json"] == null ? null : String(a["env_json"]),
    default_cwd: a["default_cwd"] == null ? null : String(a["default_cwd"]),
    endpoint: a["endpoint"] == null ? null : String(a["endpoint"]),
    status: String(a["status"] ?? "unknown"),
    status_detail:
      a["status_detail"] == null ? null : String(a["status_detail"]),
    last_probed_at:
      a["last_probed_at"] == null ? null : Number(a["last_probed_at"]),
    created_at: Number(a["created_at"] ?? 0),
    updated_at: Number(a["updated_at"] ?? 0),
  };
}
