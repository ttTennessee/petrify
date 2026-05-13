import { z } from "zod";

export const RuntimeEventTypeSchema = z.enum([
  "NodeStarted",
  "ToolCalled",
  "OutputGenerated",
  "RetryTriggered",
  "DependencyResolved",
  "ResourceAcquired",
  "ResourceReleased",
  "CheckpointSaved",
  "BreakpointHit",
  "CompensationTriggered",
  "NodeCompleted",
  "NodeFailed",
  "NodeSkipped",
]);
export type RuntimeEventType = z.infer<typeof RuntimeEventTypeSchema>;

export const RuntimeEventSchema = z.object({
  event_id: z.string(),
  node_id: z.string().nullable(),
  run_id: z.string(),
  type: RuntimeEventTypeSchema,
  timestamp: z.number().int(),
  payload: z.record(z.unknown()).default({}),
});
export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;
