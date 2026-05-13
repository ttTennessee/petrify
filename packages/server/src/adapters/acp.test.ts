import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeEvent, WorkflowNode } from "@petrify/shared";
import { AcpAdapter } from "./acp.js";

const fixture = resolve(
  fileURLToPath(import.meta.url),
  "../../../test/fixtures/fake-acp-server.mjs",
);

function makeNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id: "n1",
    ref: "node_one",
    title: "node one",
    adapter: { name: "acp" },
    dependencies: [],
    inputs: {},
    outputs: {},
    condition: null,
    loop: null,
    resources: [],
    runtime: {},
    prompt: { task_prompt: "do the thing" },
    on_failure: { strategy: "abort" },
    status: "idle",
    ...overrides,
  } as WorkflowNode;
}

describe("AcpAdapter", () => {
  it("emits NodeStarted → ToolCalled → OutputGenerated → NodeCompleted for a full prompt cycle", async () => {
    const adapter = new AcpAdapter({ command: process.execPath, args: [fixture] });
    const events: RuntimeEvent[] = [];
    for await (const ev of adapter.invoke({
      invocationId: "inv1",
      runId: "run1",
      node: makeNode(),
      inputs: { hello: "world" },
    })) {
      events.push(ev);
    }
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("NodeStarted");
    expect(types).toContain("ToolCalled");
    expect(types).toContain("OutputGenerated");
    expect(types[types.length - 1]).toBe("NodeCompleted");

    const final = events.find((e) => e.type === "OutputGenerated")!;
    expect((final.payload.output as { text: string }).text).toBe("hello world");
    expect((final.payload.output as { stop_reason: string }).stop_reason).toBe(
      "end_turn",
    );
  });

  it("declares checkpoint:soft in its manifest", () => {
    const adapter = new AcpAdapter({ command: process.execPath, args: [fixture] });
    const m = adapter.manifest();
    expect(m.capabilities).toContain("checkpoint:soft");
    expect(m.capabilities).toContain("streaming");
  });
});
