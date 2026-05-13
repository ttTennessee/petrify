import { Router } from "express";
import { nanoid } from "nanoid";
import { ProjectInputSchema } from "@petrify/shared";
import { db } from "../db.js";

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

function buildPromptTemplate(goal: string, description: string | null): string {
  return [
    "You are a workflow planner for Petrify (a Verifiable Agent Workflow Runtime).",
    "Produce a JSON workflow graph that conforms to the schema below.",
    "",
    `# Goal`,
    goal,
    "",
    description ? `# Notes\n${description}\n` : "",
    `# Schema (PRD §6.3 / §6.4)`,
    "```json",
    JSON.stringify(
      {
        nodes: [
          {
            id: "<uuid>",
            ref: "<unique slug>",
            title: "<human title>",
            adapter: { name: "mock", version: "^0.1" },
            dependencies: ["<ref of prerequisite>"],
            inputs: { key: "value or $.variables.x" },
            outputs: { name: "artifact://path or $.variables.x" },
            condition: null,
            loop: null,
            resources: [],
            runtime: { timeout: 300, retries: 0, checkpoint: true },
            prompt: { system_prompt: "...", task_prompt: "..." },
            on_failure: { strategy: "abort" },
          },
        ],
        edges: [
          { from: "<node_id>", to: "<node_id>", kind: "control" },
        ],
      },
      null,
      2,
    ),
    "```",
    "",
    "# Constraints",
    "- Use adapter.name = \"mock\" for every node (M1 only registers the mock adapter).",
    "- Keep the graph acyclic in `kind=control` edges.",
    "- Refs must be unique slugs (snake_case).",
    "- Emit ONLY the JSON object, no prose.",
  ]
    .filter(Boolean)
    .join("\n");
}
