import type {
  AdapterManifest,
  RuntimeEvent,
  WorkflowNode,
} from "@petrify/shared";

export interface InvokeRequest {
  invocationId: string;
  runId: string;
  /** Project ID that owns this workflow — used by adapters for scoped state
   *  like permission grants. Null when the run is detached from a project. */
  projectId: string | null;
  node: WorkflowNode;
  inputs: Record<string, unknown>;
}

export interface AgentAdapter {
  manifest(): AdapterManifest;
  invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent>;
  cancel(invocationId: string): Promise<void>;
  checkpoint(invocationId: string): Promise<unknown>;
  restore(blob: unknown): Promise<string>;
}
