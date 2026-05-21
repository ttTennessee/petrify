// Runs Repo —— Drizzle 实现。
//
// 收编 server/src/routes/runs.ts、runtime/scheduler.ts、runtime/checkpoints.ts、
// runtime/test-helpers.ts 中针对 runs 表的 SQL。
//
// 注意:legacy server 里 routes/runs.ts 的 detail / list 查询用了
//   (SELECT c.id FROM checkpoints WHERE c.run_id=r.id ORDER BY c.created_at DESC LIMIT 1)
// AS last_checkpoint_id ——但 runs 表自身已经有 last_checkpoint_id 列
// (由 routes/runs.ts 和 runtime/checkpoints.ts 自己维护),所以这里直接读列。

import { desc, eq } from "drizzle-orm";
import type { RunRow, RunsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { runs } from "../schema.js";

export function createRunsRepo(d: DrizzleDb): RunsRepo {
  return {
    insert(row) {
      d.insert(runs)
        .values({
          id: row.id,
          workflow_id: row.workflow_id,
          status: row.status,
          started_at: row.started_at,
          resumed_from: row.resumed_from ?? null,
        })
        .run();
    },

    insertSingleNode(row) {
      d.insert(runs)
        .values({
          id: row.id,
          workflow_id: row.workflow_id,
          status: row.status,
          started_at: row.started_at,
          resumed_from: row.resumed_from ?? null,
          target_node_id: row.target_node_id,
        })
        .run();
    },

    insertMinimal(row) {
      d.insert(runs)
        .values({
          id: row.id,
          workflow_id: row.workflow_id,
          status: row.status,
          started_at: row.started_at,
        })
        .run();
    },

    listByWorkflow(workflowId, limit) {
      return d
        .select({
          id: runs.id,
          status: runs.status,
          started_at: runs.started_at,
          finished_at: runs.finished_at,
          error: runs.error,
          resumed_from: runs.resumed_from,
          target_node_id: runs.target_node_id,
          last_checkpoint_id: runs.last_checkpoint_id,
        })
        .from(runs)
        .where(eq(runs.workflow_id, workflowId))
        .orderBy(desc(runs.started_at))
        .limit(limit)
        .all();
    },

    getById(id) {
      const r = d.select().from(runs).where(eq(runs.id, id)).get();
      return r as RunRow | undefined;
    },

    getCore(id) {
      const r = d
        .select({
          id: runs.id,
          workflow_id: runs.workflow_id,
          status: runs.status,
        })
        .from(runs)
        .where(eq(runs.id, id))
        .get();
      return r ?? undefined;
    },

    getLatestByWorkflow(workflowId) {
      const r = d
        .select({ id: runs.id })
        .from(runs)
        .where(eq(runs.workflow_id, workflowId))
        .orderBy(desc(runs.started_at))
        .limit(1)
        .get();
      return r ?? undefined;
    },

    updateStatus(id, patch) {
      d.update(runs)
        .set({
          status: patch.status,
          finished_at: patch.finished_at,
          error: patch.error,
        })
        .where(eq(runs.id, id))
        .run();
    },

    updateLastCheckpoint(id, checkpointId) {
      d.update(runs)
        .set({ last_checkpoint_id: checkpointId })
        .where(eq(runs.id, id))
        .run();
    },

    getStatus(id) {
      const r = d
        .select({ status: runs.status })
        .from(runs)
        .where(eq(runs.id, id))
        .get();
      return r?.status;
    },
  };
}
