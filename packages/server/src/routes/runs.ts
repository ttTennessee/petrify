import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { compile, CompileError } from "../runtime/compiler.js";
import {
  executeRun,
  requestCancel,
  isRunActive,
  signalContinue,
  listPausedNodes,
} from "../runtime/scheduler.js";
import { listEvents } from "../runtime/events.js";
import {
  listCheckpoints,
  getCheckpoint,
  getLatestCheckpoint,
} from "../runtime/checkpoints.js";

export const runsRouter = Router();

const insertRun = db.prepare(
  `INSERT INTO runs (id, workflow_id, status, started_at, resumed_from) VALUES (?, ?, 'running', ?, ?)`,
);

runsRouter.post("/workflows/:workflowId/runs", (req, res) => {
  const wf = db
    .prepare(`SELECT graph_json, last_verify_json FROM workflows WHERE id = ?`)
    .get(req.params.workflowId) as
    | { graph_json: string; last_verify_json: string | null }
    | undefined;
  if (!wf) return res.status(404).json({ error: "workflow not found" });

  // M3: require a passing verify (or explicit force) before running.
  const force = req.query.force === "true";
  if (!force) {
    if (!wf.last_verify_json) {
      return res
        .status(412)
        .json({
          error: "workflow has not been verified; POST /verify first or use ?force=true",
        });
    }
    const report = JSON.parse(wf.last_verify_json) as { status: "pass" | "warn" | "fail" };
    if (report.status === "fail") {
      return res
        .status(412)
        .json({
          error: "workflow verification failed; resolve issues or use ?force=true",
          report,
        });
    }
  }

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
  insertRun.run(runId, req.params.workflowId, Date.now(), null);
  void executeRun(runId, plan);
  res.status(201).json({ id: runId });
});

runsRouter.post("/runs/:id/resume", (req, res) => {
  const original = db
    .prepare(`SELECT id, workflow_id, status FROM runs WHERE id = ?`)
    .get(req.params.id) as { id: string; workflow_id: string; status: string } | undefined;
  if (!original) return res.status(404).json({ error: "run not found" });
  if (original.status === "running") {
    return res.status(409).json({ error: "run is still running; cancel first" });
  }
  const wf = db
    .prepare(`SELECT graph_json FROM workflows WHERE id = ?`)
    .get(original.workflow_id) as { graph_json: string } | undefined;
  if (!wf) return res.status(404).json({ error: "parent workflow missing" });

  const checkpointId = (req.body?.checkpoint_id as string | undefined) ?? null;
  const cp = checkpointId ? getCheckpoint(checkpointId) : getLatestCheckpoint(original.id);
  if (!cp) return res.status(400).json({ error: "no checkpoint available to resume from" });

  let plan;
  try {
    plan = compile(JSON.parse(wf.graph_json));
  } catch (err) {
    if (err instanceof CompileError) {
      return res.status(400).json({ error: err.message, issues: err.issues });
    }
    throw err;
  }

  const newRunId = nanoid();
  insertRun.run(newRunId, original.workflow_id, Date.now(), original.id);

  // The new run inherits the checkpoint blob as its starting state. We copy the
  // checkpoint row over so getLatestCheckpoint() on the resumed run works too.
  const insertCp = db.prepare(
    `INSERT INTO checkpoints (id, run_id, label, blob_json, created_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const newCpId = nanoid();
  insertCp.run(
    newCpId,
    newRunId,
    `resumed_from:${original.id}`,
    JSON.stringify({ ...cp.blob, run_id: newRunId }),
    Date.now(),
  );
  db.prepare(`UPDATE runs SET last_checkpoint_id = ? WHERE id = ?`).run(newCpId, newRunId);

  void executeRun(newRunId, plan, { resumeFromCheckpointId: newCpId });
  res.status(201).json({ id: newRunId, resumed_from: original.id });
});

runsRouter.post("/runs/:id/breakpoints/:nodeId/continue", (req, res) => {
  if (!isRunActive(req.params.id)) {
    return res.status(409).json({ error: "run is not active" });
  }
  const ok = signalContinue(req.params.id, req.params.nodeId);
  if (!ok) return res.status(404).json({ error: "node is not paused at a breakpoint" });
  res.json({ continued: true });
});

runsRouter.get("/runs/:id/paused-nodes", (req, res) => {
  res.json({ paused: listPausedNodes(req.params.id) });
});

runsRouter.post("/runs/:id/cancel", (req, res) => {
  if (!isRunActive(req.params.id)) {
    return res.status(409).json({ error: "run is not active" });
  }
  const ok = requestCancel(req.params.id);
  res.json({ cancelled: ok });
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

runsRouter.get("/runs/:id/checkpoints", (req, res) => {
  res.json(listCheckpoints(req.params.id));
});

runsRouter.get("/workflows/:workflowId/runs", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, status, started_at, finished_at, error, resumed_from
       FROM runs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT 50`,
    )
    .all(req.params.workflowId);
  res.json(rows);
});
