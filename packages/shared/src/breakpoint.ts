import { z } from "zod";

export const BreakpointSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  node_id: z.string(),
  enabled: z.boolean(),
  created_at: z.number().int(),
});
export type Breakpoint = z.infer<typeof BreakpointSchema>;

export const BreakpointHitPayloadSchema = z.object({
  node_id: z.string(),
  workflow_id: z.string(),
  reason: z.enum(["user_breakpoint", "step_mode"]),
});
export type BreakpointHitPayload = z.infer<typeof BreakpointHitPayloadSchema>;
