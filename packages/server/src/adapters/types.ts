import type {
  AdapterManifest,
  RuntimeEvent,
  WorkflowNode,
} from "@petrify/shared";

export interface InvokeRequest {
  invocationId: string;
  runId: string;
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
