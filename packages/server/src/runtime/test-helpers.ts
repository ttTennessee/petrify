import { nanoid } from "nanoid";
import { db } from "../db.js";

export function ensureWorkflow(graph: unknown): string {
  const projectId = nanoid();
  const workflowId = nanoid();
  db.prepare(
    `INSERT INTO projects (id, goal, created_at) VALUES (?, ?, ?)`,
  ).run(projectId, "test", Date.now());
  db.prepare(
    `INSERT INTO workflows (id, project_id, graph_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(workflowId, projectId, JSON.stringify(graph), Date.now());
  return workflowId;
}

export function createRun(workflowId: string): string {
  const runId = nanoid();
  db.prepare(
    `INSERT INTO runs (id, workflow_id, status, started_at) VALUES (?, ?, 'running', ?)`,
  ).run(runId, workflowId, Date.now());
  return runId;
}

export function getRunStatus(runId: string): string {
  const row = db.prepare(`SELECT status FROM runs WHERE id = ?`).get(runId) as
    | { status: string }
    | undefined;
  return row?.status ?? "missing";
}

export function listRunEvents(runId: string): Array<{ type: string; node_id: string | null }> {
  return db
    .prepare(`SELECT type, node_id FROM run_events WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as Array<{ type: string; node_id: string | null }>;
}
