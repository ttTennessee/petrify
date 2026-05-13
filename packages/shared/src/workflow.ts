import { z } from "zod";

export const NodeStatusSchema = z.enum([
  "idle",
  "pending",
  "running",
  "completed",
  "failed",
  "blocked",
  "skipped",
  "compensating",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const ResourceClaimSchema = z.object({
  name: z.string(),
  amount: z.number().int().positive().default(1),
  // If false, the node holds the resource for the remainder of the run.
  release: z.boolean().default(true),
});
export type ResourceClaim = z.infer<typeof ResourceClaimSchema>;

export const ResourcePoolSchema = z.object({
  capacity: z.number().int().positive(),
});
export type ResourcePool = z.infer<typeof ResourcePoolSchema>;

export const RuntimePolicyDeclSchema = z
  .object({
    pools: z.record(ResourcePoolSchema).default({}),
  })
  .partial();
export type RuntimePolicyDecl = z.infer<typeof RuntimePolicyDeclSchema>;

export const LoopSpecSchema = z.object({
  max_iterations: z.number().int().positive(),
  exit_condition: z.string(),
});

export const RuntimePolicySchema = z
  .object({
    timeout: z.number().int().positive().default(300),
    retries: z.number().int().nonnegative().default(0),
    checkpoint: z.boolean().default(true),
  })
  .partial();

export const OnFailureSchema = z.object({
  strategy: z.enum(["retry", "skip", "abort", "compensate"]).default("abort"),
  max_attempts: z.number().int().positive().optional(),
  backoff_ms: z.number().int().nonnegative().optional(),
  compensate_ref: z.string().optional(),
});

export const PromptSpecSchema = z.object({
  system_prompt: z.string().optional(),
  task_prompt: z.string(),
});

// PRD §6.3 — node schema is complete; M1 only consumes dependencies/inputs/outputs.
// condition/loop/resources fields are validated but NOT interpreted by the scheduler.
export const WorkflowNodeSchema = z.object({
  id: z.string(),
  ref: z.string().min(1),
  title: z.string(),
  adapter: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  dependencies: z.array(z.string()).default([]),
  inputs: z.record(z.unknown()).default({}),
  outputs: z.record(z.string()).default({}),
  condition: z.string().nullable().optional(),
  loop: LoopSpecSchema.nullable().optional(),
  resources: z.array(ResourceClaimSchema).default([]),
  runtime: RuntimePolicySchema.default({}),
  prompt: PromptSpecSchema.optional(),
  schema: z
    .object({
      input: z.record(z.unknown()).optional(),
      output: z.record(z.unknown()).optional(),
    })
    .optional(),
  on_failure: OnFailureSchema.default({ strategy: "abort" }),
  status: NodeStatusSchema.default("idle"),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

// PRD §6.4 — three edge kinds.
export const WorkflowEdgeSchema = z.discriminatedUnion("kind", [
  z.object({
    from: z.string(),
    to: z.string(),
    kind: z.literal("control"),
  }),
  z.object({
    from: z.string(),
    to: z.string(),
    kind: z.literal("data"),
    binding: z.string(),
  }),
  z.object({
    from: z.string(),
    to: z.string(), // expected form: "pool:<name>" for resource arcs
    kind: z.literal("resource"),
    amount: z.number().int().positive().default(1),
  }),
]);
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).min(1),
  edges: z.array(WorkflowEdgeSchema).default([]),
  runtime_policy: RuntimePolicyDeclSchema.optional(),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
