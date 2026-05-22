// templates 实体在 pearl 里:
//   entity type = "template"
//   attrs       = TemplateRow 的所有列
//
// findByName 通过 match by name attr,name 上有唯一约束语义(sqlite 端是 UNIQUE)。

import type { Pearl, Entity } from "@petrify/pearl";
import type { TemplateRow, TemplatesRepo } from "@petrify/db-core";

const TYPE = "template";

export function createTemplatesRepo(pearl: Pearl): TemplatesRepo {
  return {
    list() {
      return pearl
        .match(TYPE)
        .map((e) => entityToRow(e.id, e))
        .sort((a, b) => b.updated_at - a.updated_at);
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(id, ent);
    },

    findByName(name) {
      const found = pearl.match(TYPE, { name })[0];
      return found ? { id: found.id } : undefined;
    },

    insert(row) {
      pearl.commit({
        events: [
          {
            entityId: row.id,
            type: "Created",
            payload: {
              entityType: TYPE,
              attrs: {
                name: row.name,
                description: row.description,
                tags_json: row.tags_json,
                graph_json: row.graph_json,
                runtime_policy_json: row.runtime_policy_json,
                adapter_bindings_json: row.adapter_bindings_json,
                source_workflow_id: row.source_workflow_id,
                origin: row.origin,
                created_at: row.created_at,
                updated_at: row.updated_at,
              },
            },
          },
        ],
      });
    },

    deleteById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return { changes: 0 };
      pearl.commit({
        events: [{ entityId: id, type: "Deleted", payload: {} }],
      });
      return { changes: 1 };
    },
  };
}

function entityToRow(id: string, ent: Entity): TemplateRow {
  const a = ent.attrs;
  return {
    id,
    name: String(a["name"] ?? ""),
    description: a["description"] == null ? null : String(a["description"]),
    tags_json: a["tags_json"] == null ? null : String(a["tags_json"]),
    graph_json: String(a["graph_json"] ?? ""),
    runtime_policy_json:
      a["runtime_policy_json"] == null
        ? null
        : String(a["runtime_policy_json"]),
    adapter_bindings_json:
      a["adapter_bindings_json"] == null
        ? null
        : String(a["adapter_bindings_json"]),
    source_workflow_id:
      a["source_workflow_id"] == null ? null : String(a["source_workflow_id"]),
    origin: String(a["origin"] ?? ""),
    created_at: Number(a["created_at"] ?? 0),
    updated_at: Number(a["updated_at"] ?? 0),
  };
}
