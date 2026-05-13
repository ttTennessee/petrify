import { nanoid } from "nanoid";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockAdapter implements AgentAdapter {
  manifest(): AdapterManifest {
    return {
      name: "mock",
      version: "0.1.0",
      capabilities: ["tool_use", "streaming", "checkpoint:none"],
      concurrency: { max: 8 },
      resources: { token_per_call_est: 0 },
      sandbox: { fs: "none", net: "none" },
    };
  }

  async *invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent> {
    const base = {
      run_id: req.runId,
      node_id: req.node.id,
    };

    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeStarted",
      timestamp: Date.now(),
      payload: { ref: req.node.ref, title: req.node.title },
    };

    await sleep(200 + Math.floor(Math.random() * 400));

    yield {
      ...base,
      event_id: nanoid(),
      type: "ToolCalled",
      timestamp: Date.now(),
      payload: { tool: "mock_echo", args: req.inputs },
    };

    await sleep(150 + Math.floor(Math.random() * 300));

    const output = {
      echoed_inputs: req.inputs,
      generated_at: new Date().toISOString(),
    };

    yield {
      ...base,
      event_id: nanoid(),
      type: "OutputGenerated",
      timestamp: Date.now(),
      payload: { output },
    };

    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeCompleted",
      timestamp: Date.now(),
      payload: { output },
    };
  }

  async cancel(_invocationId: string): Promise<void> {
    // mock adapter cannot truly cancel mid-stream; M1 simply ignores
  }

  async checkpoint(_invocationId: string): Promise<unknown> {
    throw new Error("mock adapter declares checkpoint:none");
  }

  async restore(_blob: unknown): Promise<string> {
    throw new Error("mock adapter declares checkpoint:none");
  }
}
