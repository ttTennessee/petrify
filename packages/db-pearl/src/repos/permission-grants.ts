// permission_grants 实体在 pearl 里:
//   entity type = "permission_grant"
//   entity id   = `${project_id}::${node_id}::${tool_kind}`(复合自然键)
//   attrs       = { project_id, node_id, tool_kind, decision, created_at }
//
// upsert 语义:不存在则 Created,存在则 AttrSet decision+created_at。
// deleteAll 通过 match(TYPE) 遍历后 Deleted 每个实体。

import type { Pearl } from "@petrify/pearl";
import type {
  PermissionGrantsRepo,
  PermissionGrantRow,
} from "@petrify/db-core";

const TYPE = "permission_grant";

function makeId(projectId: string, nodeId: string, toolKind: string): string {
  return `${projectId}::${nodeId}::${toolKind}`;
}

export function createPermissionGrantsRepo(
  pearl: Pearl,
): PermissionGrantsRepo {
  return {
    upsert(row: PermissionGrantRow) {
      const id = makeId(row.project_id, row.node_id, row.tool_kind);
      const ent = pearl.get(id);
      const exists = ent && ent.type === TYPE && !ent.deleted;
      if (exists) {
        pearl.commit({
          events: [
            {
              entityId: id,
              type: "AttrSet",
              payload: {
                decision: row.decision,
                created_at: row.created_at,
              },
            },
          ],
        });
      } else {
        pearl.commit({
          events: [
            {
              entityId: id,
              type: "Created",
              payload: {
                entityType: TYPE,
                attrs: {
                  project_id: row.project_id,
                  node_id: row.node_id,
                  tool_kind: row.tool_kind,
                  decision: row.decision,
                  created_at: row.created_at,
                },
              },
            },
          ],
        });
      }
    },

    getDecision(projectId, nodeId, toolKind) {
      const id = makeId(projectId, nodeId, toolKind);
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return String(ent.attrs["decision"] ?? "");
    },

    deleteAll() {
      const all = pearl.match(TYPE);
      if (all.length === 0) return;
      pearl.commit({
        events: all.map((e) => ({
          entityId: e.id,
          type: "Deleted",
          payload: {},
        })),
      });
    },
  };
}
