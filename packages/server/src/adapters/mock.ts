import { nanoid } from "nanoid";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// In-process counter so a single mock can fail N times before succeeding on retry.
// Keyed by `${runId}:${nodeRef}` so each (run, node) gets its own counter.
const attemptCounter = new Map<string, number>();
const cancelled = new Set<string>();

export class MockAdapter implements AgentAdapter {
  manifest(): AdapterManifest {
    return {
      name: "mock",
      version: "0.2.0",
      capabilities: ["tool_use", "streaming", "checkpoint:boundary-only"],
      concurrency: { max: 8 },
      resources: { token_per_call_est: 0 },
      sandbox: { fs: "none", net: "none" },
    };
  }

  async *invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent> {
    const base = { run_id: req.runId, node_id: req.node.id };
    const failKey = `${req.runId}:${req.node.ref}`;
    const failUntil = Number(
      (req.node.inputs as Record<string, unknown>)?.fail_until_attempt ?? 0,
    );
    const currentAttempt = (attemptCounter.get(failKey) ?? 0) + 1;
    attemptCounter.set(failKey, currentAttempt);

    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeStarted",
      timestamp: Date.now(),
      payload: { ref: req.node.ref, title: req.node.title, attempt: currentAttempt },
    };

    await sleep(80 + Math.floor(Math.random() * 200));
    if (cancelled.has(req.invocationId)) {
      cancelled.delete(req.invocationId);
      yield {
        ...base,
        event_id: nanoid(),
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: { reason: "cancelled" },
      };
      return;
    }

    yield {
      ...base,
      event_id: nanoid(),
      type: "ToolCalled",
      timestamp: Date.now(),
      payload: { tool: "mock_echo", args: req.inputs, attempt: currentAttempt },
    };

    await sleep(80 + Math.floor(Math.random() * 200));

    if (currentAttempt <= failUntil) {
      yield {
        ...base,
        event_id: nanoid(),
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: {
          reason: `synthetic failure (attempt ${currentAttempt} of >${failUntil})`,
          attempt: currentAttempt,
        },
      };
      return;
    }

    const output = {
      echoed_inputs: req.inputs,
      generated_at: new Date().toISOString(),
      attempt: currentAttempt,
      // Forward an optional inputs.emit_variables map as a variables_patch so
      // workflow authors can drive condition/loop expressions in tests.
      variables_patch:
        (req.inputs as Record<string, unknown>)?.emit_variables ?? undefined,
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

  async cancel(invocationId: string): Promise<void> {
    cancelled.add(invocationId);
  }

  async checkpoint(_invocationId: string): Promise<unknown> {
    // boundary-only adapter: nothing useful to snapshot mid-invocation.
    return null;
  }

  async restore(_blob: unknown): Promise<string> {
    // boundary-only: scheduler skips this node entirely if it was already completed.
    throw new Error("mock adapter is boundary-only; no mid-invocation restore");
  }
}

// Test helpers — exposed so unit tests can reset state between cases.
export function _resetMockState() {
  attemptCounter.clear();
  cancelled.clear();
}
