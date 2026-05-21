import { Router } from "express";
import { nanoid } from "nanoid";
import { ProjectInputSchema } from "@petrify/shared";
import { dbContext } from "../db-context.js";
import { buildPromptTemplate } from "../services/prompt-template.js";
import { generateWorkflowJson, GenerateError } from "../services/generate-workflow.js";

export const projectsRouter = Router();

projectsRouter.post("/", (req, res) => {
  const parsed = ProjectInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid input", issues: parsed.error.issues });
  }
  const id = nanoid();
  dbContext.projects.insert({
    id,
    goal: parsed.data.goal,
    description: parsed.data.description ?? null,
    constraints_json: JSON.stringify(parsed.data.constraints ?? null),
    preferred_tools_json: JSON.stringify(parsed.data.preferred_tools ?? null),
    runtime_policy_json: JSON.stringify(parsed.data.runtime_policy ?? null),
    status: "draft",
    created_at: Date.now(),
  });
  res.status(201).json({ id });
});

projectsRouter.get("/", (_req, res) => {
  res.json(dbContext.projects.list());
});

projectsRouter.get("/:id", (req, res) => {
  const row = dbContext.projects.getById(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    ...row,
    constraints: row.constraints_json ? JSON.parse(row.constraints_json) : null,
    preferred_tools: row.preferred_tools_json
      ? JSON.parse(row.preferred_tools_json)
      : null,
    runtime_policy: row.runtime_policy_json
      ? JSON.parse(row.runtime_policy_json)
      : null,
  });
});

projectsRouter.get("/:id/prompt-template", (req, res) => {
  const row = dbContext.projects.getGoalAndDescription(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json({
    template: buildPromptTemplate(row.goal, row.description),
  });
});

projectsRouter.post("/:id/generate-workflow", async (req, res) => {
  const row = dbContext.projects.getGoalAndDescription(req.params.id);
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
    await dbContext.workflows.insert({
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
