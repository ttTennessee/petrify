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
import type { TemplateRow } from "@petrify/db-core";
import { dbContext } from "../db-context.js";
import { compile, CompileError } from "../runtime/compiler.js";

export const templatesRouter = Router();

// 用 db-core 的 TemplateRow:列字段一致(origin 是 string,不是 "local"|"imported"
// 联合类型 —— 在 rowToTemplate / rowToSummary 内部 narrow)。
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
    origin: row.origin as "local" | "imported",
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
    origin: row.origin as "local" | "imported",
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
  const wf = dbContext.workflows.getForTemplate(workflowId);
  if (!wf) return res.status(404).json({ error: "workflow not found" });

  const project = dbContext.projects.getRuntimePolicy(wf.project_id);

  const now = Date.now();
  const id = nanoid();
  dbContext.templates.insert({
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
  const rows = dbContext.templates.list();
  const summaries = rows
    .map(rowToSummary)
    .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
    .filter((t) =>
      tag ? t.tags.some((x) => x.toLowerCase() === tag) : true,
    );
  res.json(summaries);
});

templatesRouter.get("/:id", (req, res) => {
  const row = dbContext.templates.getById(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(rowToTemplate(row));
});

templatesRouter.get("/:id/export", (req, res) => {
  const row = dbContext.templates.getById(req.params.id);
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

templatesRouter.post("/:id/instantiate", async (req, res) => {
  const row = dbContext.templates.getById(req.params.id);
  if (!row) return res.status(404).json({ error: "template not found" });
  const projectId = (req.body as { projectId?: string })?.projectId;
  if (!projectId) {
    return res.status(400).json({ error: "projectId is required" });
  }
  if (!dbContext.projects.existsById(projectId)) {
    return res.status(404).json({ error: "project not found" });
  }

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
  await dbContext.workflows.insert({
    id: workflowId,
    project_id: projectId,
    graph_json: JSON.stringify(plan.graph),
    created_at: Date.now(),
  });

  res.status(201).json({ workflowId, order: plan.order });
});

templatesRouter.delete("/:id", (req, res) => {
  const result = dbContext.templates.deleteById(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "not found" });
  }
  res.json({ deleted: true });
});

function saveExport(data: TemplateExport, origin: "local" | "imported"): string {
  const id = nanoid();
  const now = Date.now();
  dbContext.templates.insert({
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
