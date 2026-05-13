import { z } from "zod";

export const CheckpointLevelSchema = z.enum([
  "none",
  "boundary-only",
  "soft",
  "full",
]);
export type CheckpointLevel = z.infer<typeof CheckpointLevelSchema>;

// PRD §6.6 — Adapter Manifest. `capabilities` carries free-form tokens; `checkpoint:<level>`
// is parsed out separately so the scheduler can reason about resume behavior.
export const AdapterManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  capabilities: z.array(z.string()).default([]),
  concurrency: z
    .object({
      max: z.number().int().positive().default(1),
    })
    .default({ max: 1 }),
  resources: z
    .object({
      token_per_call_est: z.number().int().nonnegative().optional(),
    })
    .optional(),
  sandbox: z
    .object({
      fs: z.enum(["none", "chroot", "container"]).optional(),
      net: z.enum(["none", "allowlist", "open"]).optional(),
    })
    .optional(),
});
export type AdapterManifest = z.infer<typeof AdapterManifestSchema>;

export function parseCheckpointLevel(m: AdapterManifest): CheckpointLevel {
  const tag = m.capabilities.find((c) => c.startsWith("checkpoint:"));
  if (!tag) return "none";
  const raw = tag.slice("checkpoint:".length);
  const parsed = CheckpointLevelSchema.safeParse(raw);
  return parsed.success ? parsed.data : "none";
}
