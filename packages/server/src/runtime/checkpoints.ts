import { nanoid } from "nanoid";
import type { CheckpointBlob } from "@petrify/shared";
import { dbContext } from "../db-context.js";

export interface SavedCheckpoint {
  id: string;
  run_id: string;
  label: string | null;
  blob: CheckpointBlob;
  created_at: number;
}

export function saveCheckpoint(
  runId: string,
  blob: CheckpointBlob,
  label?: string,
): SavedCheckpoint {
  const id = nanoid();
  const now = Date.now();
  dbContext.checkpoints.insert({
    id,
    run_id: runId,
    label: label ?? null,
    blob_json: JSON.stringify(blob),
    created_at: now,
  });
  dbContext.runs.updateLastCheckpoint(runId, id);
  return { id, run_id: runId, label: label ?? null, blob, created_at: now };
}

export function listCheckpoints(runId: string): SavedCheckpoint[] {
  return dbContext.checkpoints.listByRun(runId).map((r) => ({
    id: r.id,
    run_id: r.run_id,
    label: r.label,
    blob: JSON.parse(r.blob_json) as CheckpointBlob,
    created_at: r.created_at,
  }));
}

export function getCheckpoint(checkpointId: string): SavedCheckpoint | null {
  const row = dbContext.checkpoints.getById(checkpointId);
  if (!row) return null;
  return {
    id: row.id,
    run_id: row.run_id,
    label: row.label,
    blob: JSON.parse(row.blob_json) as CheckpointBlob,
    created_at: row.created_at,
  };
}

export function getLatestCheckpoint(runId: string): SavedCheckpoint | null {
  const run = dbContext.runs.getById(runId);
  if (!run) return null;
  if (run.last_checkpoint_id) {
    const cp = getCheckpoint(run.last_checkpoint_id);
    if (cp) return cp;
  }
  // fall back to most-recent if last_checkpoint_id is null or stale.
  const list = listCheckpoints(runId);
  return list[0] ?? null;
}
