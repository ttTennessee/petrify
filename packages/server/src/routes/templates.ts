import { Router } from "express";
import { nanoid } from "nanoid";
import {
  TemplateExportSchema,
  TEMPLATE_EXPORT_VERSION,
  type Template,
  type TemplateExport,
  type TemplateSummary,
  type WorkflowGraph,
} from "@petrify/shared";
import { db } from "../db.js";
import { compile, CompileError } from "../runtime/compiler.js";

export const templatesRouter = Router();

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  tags_json: string | null;
  graph_json: string;
  runtime_policy_json: string | null;
  adapter_bindings_json: string | null;
  source_workflow_id: string | null;
  origin: "local" | "imported";
  created_at: number;
  updated_at: number;
}

const insertTemplate = db.prepare(
  `INSERT INTO templates (
     id, name, description, tags_json, graph_json,
     runtime_policy_json, adapter_bindings_json,
     source_workflow_id, origin, created_at, updated_at
   ) VALUES (
     @id, @name, @description, @tags_json, @graph_json,
     @runtime_policy_json, @adapter_bindings_json,
     @source_workflow_id, @origin, @created_at, @updated_at
   )`,
);

const selectTemplate = db.prepare(`SELECT * FROM templates WHERE id = ?`);
const deleteTemplate = db.prepare(`DELETE FROM templates WHERE id = ?`);

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
    graph: JSON.parse(row.graph_json) as WorkflowGraph,
    runtime_policy: row.runtime_policy_json
      ? JSON.parse(row.runtime_policy_json)
      : null,
    adapter_bindings: row.adapter_bindings_json
      ? JSON.parse(row.adapter_bindings_json)
      : null,
    source_workflow_id: row.source_workflow_id,
    origin: row.origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToSummary(row: TemplateRow): TemplateSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags_json ? (JSON.parse(row.tags_json) as string[]) : [],
    origin: row.origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Save a current workflow as a template (snapshots graph + project runtime_policy).
templatesRouter.post("/", (req, res) => {
  const {
    workflowId,
    name,
    description,
    tags,
  } = req.body as {
    workflowId?: string;
    name?: string;
    description?: string;
    tags?: string[];
  };
  if (!workflowId || !name) {
    return res.status(400).json({ error: "workflowId and name are required" });
  }
  const wf = db
    .prepare(`SELECT id, project_id, graph_json FROM workflows WHERE id = ?`)
    .get(workflowId) as
    | { id: string; project_id: string; graph_json: string }
    | undefined;
  if (!wf) return res.status(404).json({ error: "workflow not found" });

  const project = db
    .prepare(`SELECT runtime_policy_json FROM projects WHERE id = ?`)
    .get(wf.project_id) as { runtime_policy_json: string | null } | undefined;

  const now = Date.now();
  const id = nanoid();
  insertTemplate.run({
    id,
    name,
    description: description ?? null,
    tags_json: JSON.stringify(tags ?? []),
    graph_json: wf.graph_json,
    runtime_policy_json: project?.runtime_policy_json ?? null,
    adapter_bindings_json: null,
    source_workflow_id: wf.id,
    origin: "local",
    created_at: now,
    updated_at: now,
  });
  res.status(201).json({ id });
});

// Save a fully-formed TemplateExport (used by import path and by callers that
// construct templates programmatically).
templatesRouter.post("/raw", (req, res) => {
  const parsed = TemplateExportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid template export", issues: parsed.error.issues });
  }
  const id = saveExport(parsed.data, "local");
  res.status(201).json({ id });
});

templatesRouter.post("/import", (req, res) => {
  const parsed = TemplateExportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "invalid template export", issues: parsed.error.issues });
  }
  const id = saveExport(parsed.data, "imported");
  res.status(201).json({ id });
});

templatesRouter.get("/", (req, res) => {
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  const tag = (req.query.tag as string | undefined)?.trim().toLowerCase();
  const rows = db
    .prepare(`SELECT * FROM templates ORDER BY updated_at DESC`)
    .all() as TemplateRow[];
  const summaries = rows
    .map(rowToSummary)
    .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
    .filter((t) =>
      tag ? t.tags.some((x) => x.toLowerCase() === tag) : true,
    );
  res.json(summaries);
});

templatesRouter.get("/:id", (req, res) => {
  const row = selectTemplate.get(req.params.id) as TemplateRow | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(rowToTemplate(row));
});

templatesRouter.get("/:id/export", (req, res) => {
  const row = selectTemplate.get(req.params.id) as TemplateRow | undefined;
  if (!row) return res.status(404).json({ error: "not found" });
  const t = rowToTemplate(row);
  const exportData: TemplateExport = {
    petrify_template_version: TEMPLATE_EXPORT_VERSION,
    name: t.name,
    description: t.description ?? null,
    tags: t.tags,
    graph: t.graph,
    runtime_policy: t.runtime_policy ?? null,
    adapter_bindings: t.adapter_bindings ?? null,
  };
  const fileName = `${t.name.replace(/[^a-zA-Z0-9_-]+/g, "_")}.petrify.json`;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(exportData, null, 2));
});

templatesRouter.post("/:id/instantiate", (req, res) => {
  const row = selectTemplate.get(req.params.id) as TemplateRow | undefined;
  if (!row) return res.status(404).json({ error: "template not found" });
  const projectId = (req.body as { projectId?: string })?.projectId;
  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }
  const project = db
    .prepare(`SELECT id FROM projects WHERE id = ?`)
    .get(projectId);
  if (!project) return res.status(404).json({ error: "project not found" });

  // Apply adapter_bindings overrides on top of the stored graph, then compile.
  const t = rowToTemplate(row);
  const graph = applyAdapterBindings(t.graph, t.adapter_bindings ?? null);

  let plan;
  try {
    plan = compile(graph);
  } catch (err) {
    if (err instanceof CompileError) {
      return res.status(400).json({ error: err.message, issues: err.issues });
    }
    throw err;
  }

  const workflowId = nanoid();
  db.prepare(
    `INSERT INTO workflows (id, project_id, graph_json, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(workflowId, projectId, JSON.stringify(plan.graph), Date.now());

  res.status(201).json({ workflowId, order: plan.order });
});

templatesRouter.delete("/:id", (req, res) => {
  const result = deleteTemplate.run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "not found" });
  }
  res.json({ deleted: true });
});

function saveExport(data: TemplateExport, origin: "local" | "imported"): string {
  const id = nanoid();
  const now = Date.now();
  insertTemplate.run({
    id,
    name: data.name,
    description: data.description ?? null,
    tags_json: JSON.stringify(data.tags ?? []),
    graph_json: JSON.stringify(data.graph),
    runtime_policy_json: data.runtime_policy
      ? JSON.stringify(data.runtime_policy)
      : null,
    adapter_bindings_json: data.adapter_bindings
      ? JSON.stringify(data.adapter_bindings)
      : null,
    source_workflow_id: null,
    origin,
    created_at: now,
    updated_at: now,
  });
  return id;
}

function applyAdapterBindings(
  graph: WorkflowGraph,
  bindings: Template["adapter_bindings"],
): WorkflowGraph {
  if (!bindings) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const b = bindings[n.ref];
      if (!b) return n;
      return {
        ...n,
        adapter: b.adapter,
        runtime: { ...n.runtime, ...(b.runtime ?? {}) },
      };
    }),
  };
}
