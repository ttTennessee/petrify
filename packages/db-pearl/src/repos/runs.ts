// runs 实体在 pearl 里:
//   entity type = "run"
//   attrs       = { workflow_id, status, started_at, finished_at,
//                   error, resumed_from, target_node_id, last_checkpoint_id }
//   edge        = run --[of_workflow]--> workflow_id
//
// 列表 / 最新 / by-workflow 查询走 match by workflow_id attr,简单可行;
// edge 仅用于将来可能的反向遍历(目前 listTypesAndNodes 等也走 attr 即可)。

import type { Pearl, Entity } from "@petrify/pearl";
import type { RunRow, RunsRepo } from "@petrify/db-core";

const TYPE = "run";
const WORKFLOW_EDGE = "of_workflow";

export function createRunsRepo(pearl: Pearl): RunsRepo {
  return {
    insert(row) {
      commitCreate(pearl, {
        id: row.id,
        workflow_id: row.workflow_id,
        status: row.status,
        started_at: row.started_at,
        finished_at: null,
        error: null,
        resumed_from: row.resumed_from ?? null,
        target_node_id: null,
        last_checkpoint_id: null,
      });
    },

    insertSingleNode(row) {
      commitCreate(pearl, {
        id: row.id,
        workflow_id: row.workflow_id,
        status: row.status,
        started_at: row.started_at,
        finished_at: null,
        error: null,
        resumed_from: row.resumed_from ?? null,
        target_node_id: row.target_node_id,
        last_checkpoint_id: null,
      });
    },

    insertMinimal(row) {
      commitCreate(pearl, {
        id: row.id,
        workflow_id: row.workflow_id,
        status: row.status,
        started_at: row.started_at,
        finished_at: null,
        error: null,
        resumed_from: null,
        target_node_id: null,
        last_checkpoint_id: null,
      });
    },

    listByWorkflow(workflowId, limit) {
      return pearl
        .match(TYPE, { workflow_id: workflowId })
        .map((e) => ({
          id: e.id,
          status: String(e.attrs["status"] ?? ""),
          started_at: Number(e.attrs["started_at"] ?? 0),
          finished_at: numOrNull(e.attrs["finished_at"]),
          error: strOrNull(e.attrs["error"]),
          resumed_from: strOrNull(e.attrs["resumed_from"]),
          target_node_id: strOrNull(e.attrs["target_node_id"]),
          last_checkpoint_id: strOrNull(e.attrs["last_checkpoint_id"]),
        }))
        .sort((a, b) => b.started_at - a.started_at)
        .slice(0, limit);
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(id, ent);
    },

    getCore(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return {
        id,
        workflow_id: String(ent.attrs["workflow_id"] ?? ""),
        status: String(ent.attrs["status"] ?? ""),
      };
    },

    getLatestByWorkflow(workflowId) {
      const rows = pearl
        .match(TYPE, { workflow_id: workflowId })
        .sort(
          (a, b) =>
            Number(b.attrs["started_at"] ?? 0) -
            Number(a.attrs["started_at"] ?? 0),
        );
      return rows[0] ? { id: rows[0].id } : undefined;
    },

    updateStatus(id, patch) {
      pearl.commit({
        events: [
          {
            entityId: id,
            type: "AttrSet",
            payload: {
              status: patch.status,
              finished_at: patch.finished_at,
              error: patch.error,
            },
          },
        ],
      });
    },

    updateLastCheckpoint(id, checkpointId) {
      pearl.commit({
        events: [
          {
            entityId: id,
            type: "AttrSet",
            payload: { last_checkpoint_id: checkpointId },
          },
        ],
      });
    },

    getStatus(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return String(ent.attrs["status"] ?? "");
    },
  };
}

function commitCreate(pearl: Pearl, row: RunRow): void {
  pearl.commit({
    events: [
      {
        entityId: row.id,
        type: "Created",
        payload: {
          entityType: TYPE,
          attrs: {
            workflow_id: row.workflow_id,
            status: row.status,
            started_at: row.started_at,
            finished_at: row.finished_at,
            error: row.error,
            resumed_from: row.resumed_from,
            target_node_id: row.target_node_id,
            last_checkpoint_id: row.last_checkpoint_id,
          },
        },
      },
    ],
    edges: {
      add: [{ from: row.id, to: row.workflow_id, type: WORKFLOW_EDGE }],
    },
  });
}

function entityToRow(id: string, ent: Entity): RunRow {
  return {
    id,
    workflow_id: String(ent.attrs["workflow_id"] ?? ""),
    status: String(ent.attrs["status"] ?? ""),
    started_at: Number(ent.attrs["started_at"] ?? 0),
    finished_at: numOrNull(ent.attrs["finished_at"]),
    error: strOrNull(ent.attrs["error"]),
    resumed_from: strOrNull(ent.attrs["resumed_from"]),
    target_node_id: strOrNull(ent.attrs["target_node_id"]),
    last_checkpoint_id: strOrNull(ent.attrs["last_checkpoint_id"]),
  };
}

function strOrNull(v: unknown): string | null {
  return v == null ? null : String(v);
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}
