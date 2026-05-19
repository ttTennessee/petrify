import type {
  AdapterManifest,
  McpServerSpec,
  RuntimeEvent,
  WorkflowNode,
} from "@petrify/shared";

/** Generic preflight/connectivity check result. Adapters that talk to an
 *  external process surface their handshake outcome here; in-process adapters
 *  (e.g. mock) omit `probe()` entirely. */
export interface ProbeOk {
  ok: true;
  protocolVersion?: number;
  capabilities?: unknown;
  durationMs: number;
}

export interface ProbeErr {
  ok: false;
  error: string;
}

export type ProbeResult = ProbeOk | ProbeErr;

export interface InvokeRequest {
  invocationId: string;
  runId: string;
  /** Project ID that owns this workflow — used by adapters for scoped state
   *  like permission grants. Null when the run is detached from a project. */
  projectId: string | null;
  node: WorkflowNode;
  inputs: Record<string, unknown>;
  /** Resolved MCP server specs to attach to this invocation's session. The
   *  scheduler resolves the names stored on `node.mcp_servers` (which refer
   *  to entries in the global mcp_servers pool) before calling `invoke()`.
   *  Adapters that don't speak ACP can ignore this. */
  mcpServers?: McpServerSpec[];
}

export interface AgentAdapter {
  manifest(): AdapterManifest;
  invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent>;
  cancel(invocationId: string): Promise<void>;
  checkpoint(invocationId: string): Promise<unknown>;
  restore(blob: unknown): Promise<string>;
  /** Optional connectivity check. Called by run preflight; adapters without
   *  external processes (e.g. mock) may omit this — preflight treats omission
   *  as "no probe needed, pass". */
  probe?(): Promise<ProbeResult>;
}
