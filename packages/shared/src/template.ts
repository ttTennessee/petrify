import { z } from "zod";
import { WorkflowGraphSchema } from "./workflow.js";

// Subset of project runtime_policy that is meaningful to ship with a template.
// Kept loose — we don't validate inner shape, just preserve user-defined keys.
export const TemplateRuntimePolicySchema = z.record(z.unknown());
export type TemplateRuntimePolicy = z.infer<typeof TemplateRuntimePolicySchema>;

// Override map keyed by node ref. Lets a template recommend a different adapter
// from the one currently embedded in the graph (e.g. swap "mock" → "acp" on import).
export const AdapterBindingSchema = z.object({
  adapter: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  runtime: z.record(z.unknown()).optional(),
});
export type AdapterBinding = z.infer<typeof AdapterBindingSchema>;

export const AdapterBindingsSchema = z.record(AdapterBindingSchema);
export type AdapterBindings = z.infer<typeof AdapterBindingsSchema>;

// Stored shape (row + parsed JSON fields).
export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  graph: WorkflowGraphSchema,
  runtime_policy: TemplateRuntimePolicySchema.nullable().optional(),
  adapter_bindings: AdapterBindingsSchema.nullable().optional(),
  source_workflow_id: z.string().nullable().optional(),
  origin: z.enum(["local", "imported"]).default("local"),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplateSummarySchema = TemplateSchema.pick({
  id: true,
  name: true,
  description: true,
  tags: true,
  origin: true,
  created_at: true,
  updated_at: true,
});
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

// File-on-disk shape: portable, versioned, includes only the user-meaningful fields.
export const TEMPLATE_EXPORT_VERSION = "1" as const;

export const TemplateExportSchema = z.object({
  petrify_template_version: z.literal(TEMPLATE_EXPORT_VERSION),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  graph: WorkflowGraphSchema,
  runtime_policy: TemplateRuntimePolicySchema.nullable().optional(),
  adapter_bindings: AdapterBindingsSchema.nullable().optional(),
});
export type TemplateExport = z.infer<typeof TemplateExportSchema>;
