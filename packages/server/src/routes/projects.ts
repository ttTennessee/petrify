import { Router } from "express";
import { nanoid } from "nanoid";
import { ProjectInputSchema } from "@petrify/shared";
import { db } from "../db.js";
import { buildPromptTemplate } from "../services/prompt-template.js";
import { generateWorkflowJson, GenerateError } from "../services/generate-workflow.js";

export const projectsRouter = Router();

const insert = db.prepare(
  `INSERT INTO projects (id, goal, description, constraints_json, preferred_tools_json, runtime_policy_json, status, created_at)
   VALUES (@id, @goal, @description, @constraints_json, @preferred_tools_json, @runtime_policy_json, 'draft', @created_at)`,
);

projectsRouter.post("/", (req, res) => {
  const parsed = ProjectInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid input", issues: parsed.error.issues });
  }
  const id = nanoid();
  insert.run({
    id,
    goal: parsed.data.goal,
    description: parsed.data.description ?? null,
    constraints_json: JSON.stringify(parsed.data.constraints ?? null),
    preferred_tools_json: JSON.stringify(parsed.data.preferred_tools ?? null),
    runtime_policy_json: JSON.stringify(parsed.data.runtime_policy ?? null),
    created_at: Date.now(),
  });
  res.status(201).json({ id });
});

projectsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, goal, description, status, created_at FROM projects ORDER BY created_at DESC`,
    )
    .all();
  res.json(rows);
});

projectsRouter.get("/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    ...row,
    constraints: row.constraints_json ? JSON.parse(row.constraints_json as string) : null,
    preferred_tools: row.preferred_tools_json
      ? JSON.parse(row.preferred_tools_json as string)
      : null,
    runtime_policy: row.runtime_policy_json
      ? JSON.parse(row.runtime_policy_json as string)
      : null,
  });
});

projectsRouter.get("/:id/prompt-template", (req, res) => {
  const row = db.prepare(`SELECT goal, description FROM projects WHERE id = ?`).get(req.params.id) as
    | { goal: string; description: string | null }
    | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    template: buildPromptTemplate(row.goal, row.description),
  });
});

const insertWorkflow = db.prepare(
  `INSERT INTO workflows (id, project_id, graph_json, created_at)
   VALUES (@id, @project_id, @graph_json, @created_at)`,
);

projectsRouter.post("/:id/generate-workflow", async (req, res) => {
  const row = db
    .prepare(`SELECT goal, description FROM projects WHERE id = ?`)
    .get(req.params.id) as { goal: string; description: string | null } | undefined;
  if (!row) return res.status(404).json({ error: "project not found" });

  const adapterName = typeof req.body?.adapter === "string" ? req.body.adapter.trim() : "";
  if (!adapterName) {
    return res.status(400).json({ error: "body.adapter (string) is required" });
  }

  try {
    const result = await generateWorkflowJson({
      adapterName,
      goal: row.goal,
      description: row.description,
    });
    const workflowId = nanoid();
    insertWorkflow.run({
      id: workflowId,
      project_id: req.params.id,
      graph_json: JSON.stringify(result.plan.graph),
      created_at: Date.now(),
    });
    return res.status(201).json({
      workflowId,
      attempts: result.attempts,
      order: result.plan.order,
    });
  } catch (err) {
    if (err instanceof GenerateError) {
      return res.status(400).json({
        error: err.message,
        stage: err.stage,
        attempts: err.attempts,
        raw: err.raw,
        issues: err.issues,
      });
    }
    return res.status(500).json({ error: (err as Error).message });
  }
});
