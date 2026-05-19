import type { McpServerSpec } from "@petrify/shared";

export interface AcpCheckpointBlob {
  sessionId: string;
  protocolVersion: number;
  promptHistory: Array<{ role: string; text: string }>;
  inputsSnapshot: Record<string, unknown>;
  command: string;
  args?: string[];
  /** MCP servers that were active for the original session — restore replays
   *  them so the resumed session has the same tool surface. */
  mcpServers?: McpServerSpec[];
}
