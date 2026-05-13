import { nanoid } from "nanoid";
import type { CheckpointBlob } from "@petrify/shared";
import { db } from "../db.js";

// runs.last_checkpoint_id is optional — older M1 schema may not have it.
// Run the ALTER *before* preparing statements that reference it.
try {
  const cols = db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "last_checkpoint_id")) {
    db.exec(`ALTER TABLE runs ADD COLUMN last_checkpoint_id TEXT`);
  }
} catch {
  /* ignore */
}

const insertCheckpoint = db.prepare(
  `INSERT INTO checkpoints (id, run_id, label, blob_json, created_at)
   VALUES (@id, @run_id, @label, @blob_json, @created_at)`,
);

const updateRunCheckpoint = db.prepare(
  `UPDATE runs SET last_checkpoint_id = @cid WHERE id = @run_id`,
);

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
  insertCheckpoint.run({
    id,
    run_id: runId,
    label: label ?? null,
    blob_json: JSON.stringify(blob),
    created_at: now,
  });
  updateRunCheckpoint.run({ cid: id, run_id: runId });
  return { id, run_id: runId, label: label ?? null, blob, created_at: now };
}

export function listCheckpoints(runId: string): SavedCheckpoint[] {
  const rows = db
    .prepare(
      `SELECT id, run_id, label, blob_json, created_at FROM checkpoints
       WHERE run_id = ? ORDER BY created_at DESC`,
    )
    .all(runId) as Array<{
    id: string;
    run_id: string;
    label: string | null;
    blob_json: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    run_id: r.run_id,
    label: r.label,
    blob: JSON.parse(r.blob_json) as CheckpointBlob,
    created_at: r.created_at,
  }));
}

export function getCheckpoint(checkpointId: string): SavedCheckpoint | null {
  const row = db
    .prepare(
      `SELECT id, run_id, label, blob_json, created_at FROM checkpoints WHERE id = ?`,
    )
    .get(checkpointId) as
    | {
        id: string;
        run_id: string;
        label: string | null;
        blob_json: string;
        created_at: number;
      }
    | undefined;
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
  const row = db
    .prepare(
      `SELECT id FROM runs WHERE id = ?`,
    )
    .get(runId) as { id: string; last_checkpoint_id?: string } | undefined;
  const lcid = (row as { last_checkpoint_id?: string } | undefined)?.last_checkpoint_id;
  if (lcid) return getCheckpoint(lcid);
  // fall back to most-recent if last_checkpoint_id is null
  const list = listCheckpoints(runId);
  return list[0] ?? null;
}
