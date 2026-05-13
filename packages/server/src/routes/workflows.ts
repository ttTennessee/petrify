import { Router } from "express";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { compile, CompileError } from "../runtime/compiler.js";

export const workflowsRouter = Router();

const insertWorkflow = db.prepare(
  `INSERT INTO workflows (id, project_id, graph_json, created_at)
   VALUES (@id, @project_id, @graph_json, @created_at)`,
);

workflowsRouter.post("/projects/:projectId/workflow", (req, res) => {
  const project = db
    .prepare(`SELECT id FROM projects WHERE id = ?`)
    .get(req.params.projectId);
  if (!project) return res.status(404).json({ error: "project not found" });

  try {
    const plan = compile(req.body);
    const id = nanoid();
    insertWorkflow.run({
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
  const rows = db
    .prepare(
      `SELECT id, created_at FROM workflows WHERE project_id = ? ORDER BY created_at DESC`,
    )
    .all(req.params.projectId);
  res.json(rows);
});

workflowsRouter.get("/workflows/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(req.params.id) as
    | { id: string; project_id: string; graph_json: string; created_at: number }
    | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    id: row.id,
    project_id: row.project_id,
    created_at: row.created_at,
    graph: JSON.parse(row.graph_json),
  });
});
