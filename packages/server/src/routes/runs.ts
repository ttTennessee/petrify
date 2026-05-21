import { Router } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import { RunDetailSchema, RunSummarySchema } from "@petrify/shared";
import { dbContext } from "../db-context.js";
import { permissionBroker } from "../adapters/acp/permission-broker.js";
import { compile, CompileError } from "../runtime/compiler.js";
import { validateAdaptersForRun } from "../runtime/preflight.js";
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

runsRouter.post("/workflows/:workflowId/runs", async (req, res) => {
  const wf = dbContext.workflows.getGraphAndVerify(req.params.workflowId);
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

  const preflight = await validateAdaptersForRun(plan);
  if (!preflight.ok) {
    return res.status(412).json({
      error: "adapter preflight failed",
      failures: preflight.failures,
    });
  }

  const stepMode =
    req.query.step === "true" || (req.body && req.body.step_mode === true);

  const runId = nanoid();
  dbContext.runs.insert({
    id: runId,
    workflow_id: req.params.workflowId,
    status: "running",
    started_at: Date.now(),
    resumed_from: null,
  });
  void executeRun(runId, plan, { stepMode });
  res.status(201).json({ id: runId });
});

// === POST /workflows/:workflowId/nodes/:nodeId/run ==========================
// Single-node run. Requires that every predecessor has been completed in the
// latest checkpoint of the workflow's most recent run. Uses that checkpoint
// as the seed so the target node can reference upstream outputs/variables.
runsRouter.post("/workflows/:workflowId/nodes/:nodeId/run", async (req, res) => {
  const { workflowId, nodeId } = req.params;
  const wf = dbContext.workflows.getGraphById(workflowId);
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

  const target = plan.nodesById[nodeId];
  if (!target) return res.status(404).json({ error: "node not found" });

  const preds = plan.predecessors[nodeId] ?? [];

  // Find the latest run for this workflow + its latest checkpoint, if any.
  const latestRun = dbContext.runs.getLatestByWorkflow(workflowId);
  const seedCp = latestRun ? getLatestCheckpoint(latestRun.id) : null;
  const completedIds = new Set<string>(seedCp?.blob.completed_node_ids ?? []);

  const missing = preds
    .filter((p) => !completedIds.has(p))
    .map((p) => plan.nodesById[p]?.ref ?? p);
  if (missing.length > 0) {
    return res.status(412).json({
      error: `node "${target.ref}" has unsatisfied predecessors`,
      issues: missing,
      missing,
    });
  }

  // Build a trimmed plan that only schedules the target node. nodesById stays
  // intact so expression scope (outputsByRef) keeps working for upstream refs.
  const trimmedPlan = {
    ...plan,
    order: [nodeId],
    predecessors: { ...plan.predecessors, [nodeId]: [] as string[] },
    successors: { ...plan.successors, [nodeId]: [] as string[] },
  };

  const preflight = await validateAdaptersForRun(trimmedPlan);
  if (!preflight.ok) {
    return res.status(412).json({
      error: "adapter preflight failed",
      failures: preflight.failures,
    });
  }

  const newRunId = nanoid();
  dbContext.runs.insertSingleNode({
    id: newRunId,
    workflow_id: workflowId,
    status: "running",
    started_at: Date.now(),
    resumed_from: seedCp ? latestRun!.id : null,
    target_node_id: nodeId,
  });

  // Seed the new run with the predecessors' outputs by cloning the latest
  // checkpoint blob under the new run id. Mirrors the resume logic above.
  let resumeCpId: string | undefined;
  if (seedCp) {
    const newCpId = nanoid();
    dbContext.checkpoints.insert({
      id: newCpId,
      run_id: newRunId,
      label: `single_node_seed:${target.ref}`,
      blob_json: JSON.stringify({
        ...seedCp.blob,
        run_id: newRunId,
        // Don't pre-mark the target as completed even if it was previously.
        completed_node_ids: seedCp.blob.completed_node_ids.filter(
          (id) => id !== nodeId,
        ),
      }),
      created_at: Date.now(),
    });
    dbContext.runs.updateLastCheckpoint(newRunId, newCpId);
    resumeCpId = newCpId;
  }

  void executeRun(newRunId, trimmedPlan, { resumeFromCheckpointId: resumeCpId });
  res.status(201).json({ id: newRunId, target_node_id: nodeId });
});

runsRouter.post("/runs/:id/resume", async (req, res) => {
  const original = dbContext.runs.getCore(req.params.id);
  if (!original) return res.status(404).json({ error: "run not found" });
  if (original.status === "running") {
    return res.status(409).json({ error: "run is still running; cancel first" });
  }
  const wf = dbContext.workflows.getGraphById(original.workflow_id);
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

  const preflight = await validateAdaptersForRun(plan);
  if (!preflight.ok) {
    return res.status(412).json({
      error: "adapter preflight failed",
      failures: preflight.failures,
    });
  }

  const newRunId = nanoid();
  dbContext.runs.insert({
    id: newRunId,
    workflow_id: original.workflow_id,
    status: "running",
    started_at: Date.now(),
    resumed_from: original.id,
  });

  // The new run inherits the checkpoint blob as its starting state. We copy the
  // checkpoint row over so getLatestCheckpoint() on the resumed run works too.
  const newCpId = nanoid();
  dbContext.checkpoints.insert({
    id: newCpId,
    run_id: newRunId,
    label: `resumed_from:${original.id}`,
    blob_json: JSON.stringify({ ...cp.blob, run_id: newRunId }),
    created_at: Date.now(),
  });
  dbContext.runs.updateLastCheckpoint(newRunId, newCpId);

  const stepMode = req.body?.step_mode === true;
  void executeRun(newRunId, plan, {
    resumeFromCheckpointId: newCpId,
    stepMode,
  });
  res.status(201).json({ id: newRunId, resumed_from: original.id });
});

const PermissionRespondSchema = z.object({
  decision: z.enum([
    "allow_once",
    "allow_always",
    "reject_once",
    "reject_always",
    "cancelled",
  ]),
});

runsRouter.post(
  "/runs/:id/permissions/:requestId/respond",
  (req, res) => {
    const parsed = PermissionRespondSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid input",
        issues: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ),
      });
    }
    const ok = permissionBroker.resolve(
      req.params.requestId,
      parsed.data.decision,
    );
    if (!ok) {
      return res
        .status(404)
        .json({ error: "permission request not found or already resolved" });
    }
    res.json({ ok: true });
  },
);

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
  const row = dbContext.runs.getById(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(RunDetailSchema.parse(row));
});

runsRouter.get("/runs/:id/events", (req, res) => {
  const since = Number(req.query.since ?? 0);
  res.json(listEvents(req.params.id, Number.isFinite(since) ? since : 0));
});

runsRouter.get("/runs/:id/checkpoints", (req, res) => {
  res.json(listCheckpoints(req.params.id));
});

runsRouter.get("/workflows/:workflowId/runs", (req, res) => {
  const rows = dbContext.runs.listByWorkflow(req.params.workflowId, 50);
  res.json(z.array(RunSummarySchema).parse(rows));
});
