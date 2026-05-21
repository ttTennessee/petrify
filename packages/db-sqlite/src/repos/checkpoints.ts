// Checkpoints Repo —— Drizzle 实现。
//
// 收编 server/src/runtime/checkpoints.ts、routes/runs.ts 中针对 checkpoints 表的 SQL。

import { desc, eq } from "drizzle-orm";
import type { CheckpointRow, CheckpointsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { checkpoints } from "../schema.js";

export function createCheckpointsRepo(d: DrizzleDb): CheckpointsRepo {
  return {
    insert(row) {
      d.insert(checkpoints)
        .values({
          id: row.id,
          run_id: row.run_id,
          label: row.label,
          blob_json: row.blob_json,
          created_at: row.created_at,
        })
        .run();
    },

    listByRun(runId) {
      return d
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.run_id, runId))
        .orderBy(desc(checkpoints.created_at))
        .all() as CheckpointRow[];
    },

    getById(id) {
      const r = d
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.id, id))
        .get();
      return r as CheckpointRow | undefined;
    },
  };
}
