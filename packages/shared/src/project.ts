import { z } from "zod";

export const ProjectInputSchema = z.object({
  goal: z.string().min(1).max(2000),
  description: z.string().max(8000).optional(),
  constraints: z
    .object({
      max_tasks: z.number().int().positive().optional(),
      max_tokens: z.number().int().positive().optional(),
      budget_usd: z.number().nonnegative().optional(),
    })
    .partial()
    .passthrough()
    .optional(),
  preferred_tools: z.array(z.string()).optional(),
  runtime_policy: z.record(z.unknown()).optional(),
});

export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const ProjectSchema = ProjectInputSchema.extend({
  id: z.string(),
  status: z.enum(["draft", "ready", "running", "completed", "failed"]),
  created_at: z.number().int(),
});

export type Project = z.infer<typeof ProjectSchema>;
