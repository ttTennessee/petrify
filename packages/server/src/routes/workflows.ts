import { Router } from "express";
import { nanoid } from "nanoid";
import { dbContext } from "../db-context.js";
import { compile, CompileError } from "../runtime/compiler.js";
import type { WorkflowGraph } from "@petrify/shared";

export const workflowsRouter = Router();

// Fields a user can edit on an existing node. id/ref/dependencies/status
// affect the workflow topology and dataflow references, so changing them
// must go through a full re-import for now.
const EDITABLE_NODE_FIELDS = new Set([
  "title",
  "adapter",
  "inputs",
  "outputs",
  "condition",
  "loop",
  "resources",
  "runtime",
  "prompt",
  "schema",
  "on_failure",
  "mcp_servers",
  "permission_policy",
]);

workflowsRouter.post("/projects/:projectId/workflow", async (req, res) => {
  if (!dbContext.projects.existsById(req.params.projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

  try {
    const plan = compile(req.body);
    const id = nanoid();
    await dbContext.workflows.insert({
      id,
      project_id: req.params.projectId,
      graph_json: JSON.stringify(plan.graph),
      created_at: Date.now(),
    });
    return res.status(201).json({ id, order: plan.order });
  } catch (err) {
    if (err instanceof CompileError) {
      return res.status(400).json({ error: err.message, issues: err.issues });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});

workflowsRouter.get("/projects/:projectId/workflows", (req, res) => {
  const rows = dbContext.workflows.listByProject(req.params.projectId);
  res.json(rows);
});

workflowsRouter.get("/workflows/:id", (req, res) => {
  const row = dbContext.workflows.getById(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    id: row.id,
    project_id: row.project_id,
    created_at: row.created_at,
    graph: JSON.parse(row.graph_json),
  });
});

workflowsRouter.patch("/workflows/:id/nodes/:nodeId", async (req, res) => {
  const row = dbContext.workflows.getGraphById(req.params.id);
  if (!row) return res.status(404).json({ error: "workflow not found" });

  const patch = req.body as Record<string, unknown> | null | undefined;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return res.status(400).json({ error: "patch body must be a JSON object" });
  }
  const forbidden = Object.keys(patch).filter((k) => !EDITABLE_NODE_FIELDS.has(k));
  if (forbidden.length > 0) {
    return res.status(400).json({
      error: `field(s) not editable: ${forbidden.join(", ")}`,
      issues: forbidden.map((k) => `${k}: not editable (immutable in M1)`),
    });
  }

  const graph = JSON.parse(row.graph_json) as WorkflowGraph;
  const idx = graph.nodes.findIndex((n) => n.id === req.params.nodeId);
  if (idx === -1) return res.status(404).json({ error: "node not found" });
  const merged = { ...graph.nodes[idx]!, ...patch };
  const nextGraph: WorkflowGraph = {
    ...graph,
    nodes: graph.nodes.map((n, i) => (i === idx ? merged : n)),
  };

  try {
    const plan = compile(nextGraph);
    await dbContext.workflows.updateGraph(row.id, JSON.stringify(plan.graph));
    return res.json({ id: row.id, graph: plan.graph });
  } catch (err) {
    if (err instanceof CompileError) {
      return res.status(400).json({ error: err.message, issues: err.issues });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});
