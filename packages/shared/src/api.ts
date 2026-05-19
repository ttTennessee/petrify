import { z } from "zod";

// Generic error body returned by all routes on non-2xx.
export const ApiErrorBodySchema = z.object({
  error: z.string().optional(),
  issues: z.array(z.string()).optional(),
  failures: z.array(z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const PreflightFailureSchema = z.object({
  node_ref: z.string(),
  node_id: z.string(),
  adapter: z.string(),
  reason: z.string(),
});
export type PreflightFailure = z.infer<typeof PreflightFailureSchema>;

// ---- Projects ----

export const ProjectSummarySchema = z.object({
  id: z.string(),
  goal: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  created_at: z.number().int(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

// ---- Workflows ----

export const WorkflowSummarySchema = z.object({
  id: z.string(),
  created_at: z.number().int(),
});
export type WorkflowSummary = z.infer<typeof WorkflowSummarySchema>;

// ---- Runs ----

// Run-level status (not the per-node status — that's NodeStatus in workflow.ts,
// and RunStatus in events.ts is for runtime event payloads).
export const ApiRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled",
  "paused",
]);
export type ApiRunStatus = z.infer<typeof ApiRunStatusSchema>;

// Summary returned by GET /workflows/:id/runs.
// Includes last_checkpoint_id (derived via subquery on the server) — fixes
// the drift where the web client typed it but the SQL never selected it.
export const RunSummarySchema = z.object({
  id: z.string(),
  status: ApiRunStatusSchema,
  started_at: z.number().int(),
  finished_at: z.number().int().nullable(),
  error: z.string().nullable(),
  resumed_from: z.string().nullable().optional(),
  last_checkpoint_id: z.string().nullable().optional(),
  target_node_id: z.string().nullable().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

// Detail returned by GET /runs/:id. workflow_id is required — fixes the
// drift where the web client cast it in but the raw SELECT * happened to
// include it implicitly.
export const RunDetailSchema = RunSummarySchema.extend({
  workflow_id: z.string(),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

// ---- Checkpoints ----

export const CheckpointSummarySchema = z.object({
  id: z.string(),
  run_id: z.string(),
  label: z.string().nullable(),
  created_at: z.number().int(),
  blob: z.object({
    completed_node_ids: z.array(z.string()),
    skipped_node_ids: z.array(z.string()),
  }),
});
export type CheckpointSummary = z.infer<typeof CheckpointSummarySchema>;

// ---- Generate Workflow ----

export const GenerateWorkflowResultSchema = z.object({
  workflowId: z.string(),
  attempts: z.number().int(),
  order: z.array(z.string()),
});
export type GenerateWorkflowResult = z.infer<typeof GenerateWorkflowResultSchema>;

// ---- Adapters (catalog + instances + probe) ----

export const CatalogCategorySchema = z.enum(["acp", "other"]);
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

export const CatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  category: CatalogCategorySchema,
  defaultKind: z.enum(["spawn", "connect"]),
  defaultCommand: z.string().optional(),
  defaultArgs: z.array(z.string()).optional(),
  homepage: z.string().optional(),
  icon: z.string().optional(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const AdapterKindSchema = z.enum(["spawn", "connect", "builtin"]);
export type AdapterKind = z.infer<typeof AdapterKindSchema>;

export const AdapterInstanceSchema = z.object({
  name: z.string(),
  catalog_id: z.string().nullable(),
  kind: AdapterKindSchema,
  enabled: z.union([z.literal(0), z.literal(1)]),
  command: z.string().nullable(),
  args: z.array(z.string()),
  env: z.record(z.string()),
  default_cwd: z.string().nullable(),
  endpoint: z.string().nullable(),
  status: z.enum(["ok", "error", "unknown"]),
  status_detail: z.string().nullable(),
  last_probed_at: z.number().int().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
  live: z.boolean(),
  // Server-added flag for builtin/read-only entries — fixes the drift where
  // server returns this but the web type omitted it.
  read_only: z.boolean().optional(),
});
export type AdapterInstance = z.infer<typeof AdapterInstanceSchema>;

export const ProbeResultSchema = z.object({
  ok: z.boolean(),
  protocolVersion: z.number().optional(),
  capabilities: z.unknown().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
});
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const AdapterInputSchema = z.object({
  name: z.string(),
  catalog_id: z.string().nullable().optional(),
  kind: z.enum(["spawn", "connect"]),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  default_cwd: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
});
export type AdapterInput = z.infer<typeof AdapterInputSchema>;

// ---- Global config ----

export const GlobalConfigSchema = z.object({
  auto_run: z.boolean(),
  permission_default_policy: z.enum(["ask", "deny-all"]),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

// ---- Permissions ----

export const PermissionDecisionSchema = z.enum([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
  "cancelled",
]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;
