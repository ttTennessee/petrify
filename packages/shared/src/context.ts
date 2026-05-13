import { z } from "zod";

// PRD §4.5 — four scopes, distinct lifecycles.
// Variables  : global, project-life, RW,  checkpointed
// Memory     : global / per-node, project-life, append-only, checkpointed
// Artifacts  : global, project-life, immutable, artifact store
// Env        : global, run-life, RO, NEVER persisted (secrets live here)
// Prompt Snapshot : per-node-exec, RO, lives in Trace
//
// Secrets resolved through Env MUST NOT enter Prompt Snapshots or Artifacts.
export const ArtifactKindSchema = z.enum([
  "markdown",
  "json",
  "code",
  "image",
  "directory",
  "log",
  "binary",
]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactRefSchema = z.object({
  uri: z.string(), // artifact://...
  kind: ArtifactKindSchema,
  produced_by: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const RuntimeContextSchema = z.object({
  variables: z.record(z.unknown()).default({}),
  memory: z
    .object({
      global: z.record(z.unknown()).default({}),
      per_node: z.record(z.array(z.unknown())).default({}),
    })
    .default({ global: {}, per_node: {} }),
  artifacts: z.array(ArtifactRefSchema).default([]),
  env: z.record(z.string()).default({}),
  prompt_snapshots: z.record(z.unknown()).default({}),
});
export type RuntimeContext = z.infer<typeof RuntimeContextSchema>;
