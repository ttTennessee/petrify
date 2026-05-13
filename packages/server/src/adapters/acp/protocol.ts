import { z } from "zod";

// ACP wire types — defined only as loosely as we need. The official spec is
// still evolving, so each schema below is `.passthrough()` to tolerate unknown
// extra fields. We only validate the discriminator + the fields we actually
// consume; everything else flows through opaquely.

export const InitializeRequestSchema = z.object({
  protocolVersion: z.string(),
  clientCapabilities: z.record(z.unknown()).optional(),
});
export const InitializeResponseSchema = z
  .object({
    protocolVersion: z.string(),
    agentCapabilities: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const SessionNewRequestSchema = z.object({
  cwd: z.string().optional(),
  mcpServers: z.array(z.unknown()).optional(),
});
export const SessionNewResponseSchema = z
  .object({ sessionId: z.string() })
  .passthrough();

export const ContentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
  })
  .passthrough();

export const SessionPromptRequestSchema = z.object({
  sessionId: z.string(),
  prompt: z.array(ContentBlockSchema),
});
export const SessionPromptResponseSchema = z
  .object({
    stopReason: z.string().optional(),
  })
  .passthrough();

// session/update is a *notification* from the agent. The discriminator lives at
// params.update.sessionUpdate.
export const SessionUpdateParamsSchema = z
  .object({
    sessionId: z.string(),
    update: z
      .object({
        sessionUpdate: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

export type SessionUpdate = z.infer<typeof SessionUpdateParamsSchema>;
