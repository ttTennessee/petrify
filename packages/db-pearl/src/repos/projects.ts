// projects 实体在 pearl 里:
//   entity type = "project"
//   attrs       = {
//     goal, description, constraints_json, preferred_tools_json,
//     runtime_policy_json, status, created_at
//   }
//
// 无外向 edge —— project 是聚合根;workflow 通过 belongs_to_project 反指它。

import type { Pearl, Entity } from "@petrify/pearl";
import type { ProjectRow, ProjectsRepo } from "@petrify/db-core";

const TYPE = "project";

export function createProjectsRepo(pearl: Pearl): ProjectsRepo {
  return {
    existsById(id) {
      const ent = pearl.get(id);
      return ent !== undefined && ent.type === TYPE && !ent.deleted;
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
                goal: row.goal,
                description: row.description,
                constraints_json: row.constraints_json,
                preferred_tools_json: row.preferred_tools_json,
                runtime_policy_json: row.runtime_policy_json,
                status: row.status,
                created_at: row.created_at,
              },
            },
          },
        ],
      });
    },

    list() {
      return pearl
        .match(TYPE)
        .filter((e) => !e.deleted)
        .map((e) => ({
          id: e.id,
          goal: String(e.attrs["goal"] ?? ""),
          description:
            e.attrs["description"] == null
              ? null
              : String(e.attrs["description"]),
          status: String(e.attrs["status"] ?? ""),
          created_at: Number(e.attrs["created_at"] ?? 0),
        }))
        .sort((a, b) => b.created_at - a.created_at);
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(id, ent);
    },

    getGoalAndDescription(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return {
        goal: String(ent.attrs["goal"] ?? ""),
        description:
          ent.attrs["description"] == null
            ? null
            : String(ent.attrs["description"]),
      };
    },

    getRuntimePolicy(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return {
        runtime_policy_json:
          ent.attrs["runtime_policy_json"] == null
            ? null
            : String(ent.attrs["runtime_policy_json"]),
      };
    },
  };
}

function entityToRow(id: string, ent: Entity): ProjectRow {
  const nullable = (k: string): string | null =>
    ent.attrs[k] == null ? null : String(ent.attrs[k]);
  return {
    id,
    goal: String(ent.attrs["goal"] ?? ""),
    description: nullable("description"),
    constraints_json: nullable("constraints_json"),
    preferred_tools_json: nullable("preferred_tools_json"),
    runtime_policy_json: nullable("runtime_policy_json"),
    status: String(ent.attrs["status"] ?? ""),
    created_at: Number(ent.attrs["created_at"] ?? 0),
  };
}
