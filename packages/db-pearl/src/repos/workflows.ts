// workflows 实体在 pearl 里:
//   entity type = "workflow"
//   attrs       = { graph_json, last_verify_json, created_at }
//   edge        = workflow --[belongs_to_project]--> project_id
//
// 列表查询走 traverse(direction: "in", edgeType: "belongs_to_project") 从
// project 反向找回所有 workflows。

import type { Pearl, Entity } from "@petrify/pearl";
import type { WorkflowRow, WorkflowsRepo } from "@petrify/db-core";

const TYPE = "workflow";
const PROJECT_EDGE = "belongs_to_project";

export function createWorkflowsRepo(pearl: Pearl): WorkflowsRepo {
  return {
    async insert(row) {
      await pearl.commit({
        events: [
          {
            entityId: row.id,
            type: "Created",
            payload: {
              entityType: TYPE,
              attrs: {
                graph_json: row.graph_json,
                last_verify_json: null,
                created_at: row.created_at,
              },
            },
          },
        ],
        edges: {
          add: [
            { from: row.id, to: row.project_id, type: PROJECT_EDGE },
          ],
        },
      });
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(id, ent, pearl);
    },

    getGraphById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return { id, graph_json: String(ent.attrs["graph_json"] ?? "") };
    },

    listByProject(projectId) {
      // 从 project 反向找出所有指向它的 workflow。
      const workflows = pearl.traverse(projectId, {
        direction: "in",
        edgeType: PROJECT_EDGE,
      });
      return workflows
        .filter((w) => w.type === TYPE && !w.deleted)
        .map((w) => ({
          id: w.id,
          created_at: Number(w.attrs["created_at"] ?? 0),
        }))
        .sort((a, b) => b.created_at - a.created_at);
    },

    async updateGraph(id, graphJson) {
      await pearl.commit({
        events: [
          {
            entityId: id,
            type: "AttrSet",
            payload: { graph_json: graphJson },
          },
        ],
      });
    },

    async updateVerify(id, lastVerifyJson) {
      await pearl.commit({
        events: [
          {
            entityId: id,
            type: "AttrSet",
            payload: { last_verify_json: lastVerifyJson },
          },
        ],
      });
    },
  };
}

function entityToRow(id: string, ent: Entity, pearl: Pearl): WorkflowRow {
  // project_id 通过出边反查 —— traverse out + edge type filter。
  const projects = pearl.traverse(id, {
    direction: "out",
    edgeType: PROJECT_EDGE,
    limit: 1,
  });
  const projectId = projects[0]?.id ?? "";
  return {
    id,
    project_id: projectId,
    graph_json: String(ent.attrs["graph_json"] ?? ""),
    last_verify_json:
      ent.attrs["last_verify_json"] == null
        ? null
        : String(ent.attrs["last_verify_json"]),
    created_at: Number(ent.attrs["created_at"] ?? 0),
  };
}
