import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { compile, CompileError } from "../runtime/compiler.js";
import { executeRun } from "../runtime/scheduler.js";
import { listEvents } from "../runtime/events.js";

export const runsRouter = Router();

const insertRun = db.prepare(
  `INSERT INTO runs (id, workflow_id, status, started_at) VALUES (?, ?, 'running', ?)`,
);

runsRouter.post("/workflows/:workflowId/runs", (req, res) => {
  const wf = db
    .prepare(`SELECT graph_json FROM workflows WHERE id = ?`)
    .get(req.params.workflowId) as { graph_json: string } | undefined;
  if (!wf) return res.status(404).json({ error: "workflow not found" });

  let plan;
  try {
    plan = compile(JSON.parse(wf.graph_json));
  } catch (err) {
    if (err instanceof CompileError) {
      return res.status(400).json({ error: err.message, issues: err.issues });
    }
    throw err;
  }

  const runId = nanoid();
  insertRun.run(runId, req.params.workflowId, Date.now());

  // fire and forget — scheduler emits events to bus + persists
  void executeRun(runId, plan);

  res.status(201).json({ id: runId });
});

runsRouter.get("/runs/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

runsRouter.get("/runs/:id/events", (req, res) => {
  const since = Number(req.query.since ?? 0);
  res.json(listEvents(req.params.id, Number.isFinite(since) ? since : 0));
});

runsRouter.get("/workflows/:workflowId/runs", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, status, started_at, finished_at, error
       FROM runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 50`,
    )
    .all(req.params.workflowId);
  res.json(rows);
});
