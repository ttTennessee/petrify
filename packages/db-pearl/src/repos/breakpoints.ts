// breakpoints 实体在 pearl 里:
//   entity type = "breakpoint"
//   attrs       = { workflow_id, node_id, enabled, created_at }
//   edge        = breakpoint --[of_workflow_bp]--> workflow_id
//
// hasEnabled 是 scheduler 热路径,但 match by 复合 where 已是 O(N_of_type),
// 数据量量级足以接受。

import type { Pearl, Entity } from "@petrify/pearl";
import type { BreakpointRow, BreakpointsRepo } from "@petrify/db-core";

const TYPE = "breakpoint";
const WORKFLOW_EDGE = "of_workflow_bp";

export function createBreakpointsRepo(pearl: Pearl): BreakpointsRepo {
  return {
    listByWorkflow(workflowId) {
      return pearl
        .match(TYPE, { workflow_id: workflowId })
        .map((e) => entityToRow(e.id, e))
        .sort((a, b) => a.created_at - b.created_at);
    },

    findByWorkflowAndNode(workflowId, nodeId) {
      const found = pearl.match(TYPE, {
        workflow_id: workflowId,
        node_id: nodeId,
      })[0];
      return found ? entityToRow(found.id, found) : undefined;
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
                workflow_id: row.workflow_id,
                node_id: row.node_id,
                enabled: row.enabled,
                created_at: row.created_at,
              },
            },
          },
        ],
        edges: {
          add: [{ from: row.id, to: row.workflow_id, type: WORKFLOW_EDGE }],
        },
      });
    },

    setEnabled(id, enabled) {
      pearl.commit({
        events: [
          {
            entityId: id,
            type: "AttrSet",
            payload: { enabled },
          },
        ],
      });
    },

    deleteByWorkflowAndNode(workflowId, nodeId) {
      const matches = pearl.match(TYPE, {
        workflow_id: workflowId,
        node_id: nodeId,
      });
      if (matches.length === 0) return { changes: 0 };
      pearl.commit({
        events: matches.map((e) => ({
          entityId: e.id,
          type: "Deleted",
          payload: {},
        })),
      });
      return { changes: matches.length };
    },

    hasEnabled(workflowId, nodeId) {
      const found = pearl.match(TYPE, {
        workflow_id: workflowId,
        node_id: nodeId,
        enabled: 1,
      });
      return found.length > 0;
    },
  };
}

function entityToRow(id: string, ent: Entity): BreakpointRow {
  return {
    id,
    workflow_id: String(ent.attrs["workflow_id"] ?? ""),
    node_id: String(ent.attrs["node_id"] ?? ""),
    enabled: Number(ent.attrs["enabled"] ?? 0),
    created_at: Number(ent.attrs["created_at"] ?? 0),
  };
}
