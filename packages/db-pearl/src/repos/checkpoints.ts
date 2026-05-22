// checkpoints 实体在 pearl 里:
//   entity type = "checkpoint"
//   attrs       = { run_id, label, blob_json, created_at }
//   edge        = checkpoint --[of_run_checkpoint]--> run_id
//
// listByRun 走 match by run_id attr,DESC by created_at(对齐 sqlite 实现)。

import type { Pearl, Entity } from "@petrify/pearl";
import type { CheckpointRow, CheckpointsRepo } from "@petrify/db-core";

const TYPE = "checkpoint";
const RUN_EDGE = "of_run_checkpoint";

export function createCheckpointsRepo(pearl: Pearl): CheckpointsRepo {
  return {
    insert(row) {
      pearl.commit({
        events: [
          {
            entityId: row.id,
            type: "Created",
            payload: {
              entityType: TYPE,
              attrs: {
                run_id: row.run_id,
                label: row.label,
                blob_json: row.blob_json,
                created_at: row.created_at,
              },
            },
          },
        ],
        edges: {
          add: [{ from: row.id, to: row.run_id, type: RUN_EDGE }],
        },
      });
    },

    listByRun(runId) {
      return pearl
        .match(TYPE, { run_id: runId })
        .map((e) => entityToRow(e.id, e))
        .sort((a, b) => b.created_at - a.created_at);
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE || ent.deleted) return undefined;
      return entityToRow(id, ent);
    },
  };
}

function entityToRow(id: string, ent: Entity): CheckpointRow {
  return {
    id,
    run_id: String(ent.attrs["run_id"] ?? ""),
    label: ent.attrs["label"] == null ? null : String(ent.attrs["label"]),
    blob_json: String(ent.attrs["blob_json"] ?? ""),
    created_at: Number(ent.attrs["created_at"] ?? 0),
  };
}
