import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nanoid } from "nanoid";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "../adapters/types.js";
import { registerAdapter, unregisterAdapter } from "../adapters/registry.js";
import { generateWorkflowJson, GenerateError } from "./generate-workflow.js";

const validGraph = {
  nodes: [
    {
      id: "n1",
      ref: "fetch",
      title: "Fetch",
      adapter: { name: "stub", version: "0.0.0" },
      dependencies: [],
      inputs: {},
      outputs: {},
      resources: [],
      runtime: { timeout: 60, retries: 0, checkpoint: true },
      prompt: { task_prompt: "do it" },
      on_failure: { strategy: "abort" },
    },
  ],
  edges: [],
};

class StubAdapter implements AgentAdapter {
  public calls = 0;
  constructor(private replies: string[]) {}

  manifest(): AdapterManifest {
    return {
      name: "stub",
      version: "0.0.0",
      capabilities: ["streaming"],
      concurrency: { max: 1 },
      resources: { token_per_call_est: 0 },
    };
  }

  async *invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent> {
    const text = this.replies[this.calls] ?? this.replies[this.replies.length - 1] ?? "";
    this.calls++;
    const base = { run_id: req.runId, node_id: req.node.id };
    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeStarted",
      timestamp: Date.now(),
      payload: {},
    };
    yield {
      ...base,
      event_id: nanoid(),
      type: "OutputGenerated",
      timestamp: Date.now(),
      payload: { output: { text } },
    };
    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeCompleted",
      timestamp: Date.now(),
      payload: { output: { text } },
    };
  }
  async cancel() {}
  async checkpoint() {
    return null;
  }
  async restore() {
    return "";
  }
}

describe("generateWorkflowJson", () => {
  beforeEach(() => unregisterAdapter("stub"));
  afterEach(() => unregisterAdapter("stub"));

  it("happy path: parses a fenced JSON reply on first attempt", async () => {
    const stub = new StubAdapter([
      "Sure, here is the workflow:\n```json\n" + JSON.stringify(validGraph) + "\n```\nDone.",
    ]);
    registerAdapter("stub", stub);
    const res = await generateWorkflowJson({
      adapterName: "stub",
      goal: "test",
      description: null,
    });
    expect(res.attempts).toBe(1);
    expect(res.plan.graph.nodes).toHaveLength(1);
    expect(res.plan.order).toEqual(["n1"]);
  });

  it("retries once when first reply is unparseable and second is valid", async () => {
    const stub = new StubAdapter([
      "I cannot do that.",
      JSON.stringify(validGraph),
    ]);
    registerAdapter("stub", stub);
    const res = await generateWorkflowJson({
      adapterName: "stub",
      goal: "test",
      description: null,
    });
    expect(res.attempts).toBe(2);
    expect(stub.calls).toBe(2);
  });

  it("throws GenerateError when both attempts fail validation", async () => {
    const stub = new StubAdapter([
      '{"oops": 1}',
      '{"still": "bad"}',
    ]);
    registerAdapter("stub", stub);
    await expect(
      generateWorkflowJson({
        adapterName: "stub",
        goal: "test",
        description: null,
      }),
    ).rejects.toBeInstanceOf(GenerateError);
  });

  it("rejects when adapter is not registered", async () => {
    await expect(
      generateWorkflowJson({
        adapterName: "nonexistent",
        goal: "test",
        description: null,
      }),
    ).rejects.toMatchObject({ stage: "adapter" });
  });

  it("retries off: a single failure surfaces immediately", async () => {
    const stub = new StubAdapter(["not json at all"]);
    registerAdapter("stub", stub);
    await expect(
      generateWorkflowJson({
        adapterName: "stub",
        goal: "test",
        description: null,
        retryOnInvalid: false,
      }),
    ).rejects.toMatchObject({ stage: "parse", attempts: 1 });
    expect(stub.calls).toBe(1);
  });
});
