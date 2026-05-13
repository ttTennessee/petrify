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
  "paused",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

// Petrify-native checkpoint blob (adapter-side blobs are opaque to us).
// Captures *what was already done* so resume can skip completed nodes and
// rehydrate downstream inputs without rerunning them.
export const CheckpointBlobSchema = z.object({
  run_id: z.string(),
  saved_at: z.number().int(),
  completed_node_ids: z.array(z.string()),
  skipped_node_ids: z.array(z.string()),
  node_outputs: z.record(z.unknown()), // nodeId -> last OutputGenerated payload
  variables: z.record(z.unknown()),
  // Adapter-declared blobs by node id, opaque payload.
  adapter_blobs: z.record(z.unknown()).optional(),
});
export type CheckpointBlob = z.infer<typeof CheckpointBlobSchema>;
