import { describe, expect, it } from "vitest";
import { createMapper } from "./event-mapper.js";
import type { SessionUpdate } from "./protocol.js";

function update(sessionUpdate: string, extra: Record<string, unknown> = {}): SessionUpdate {
  return {
    sessionId: "s1",
    update: { sessionUpdate, ...extra } as SessionUpdate["update"],
  };
}

describe("acp event-mapper", () => {
  it("accumulates agent_message_chunk text and emits OutputGenerated on finalize", () => {
    const m = createMapper({ runId: "r1", nodeId: "n1" });
    expect(m.map(update("agent_message_chunk", { content: { type: "text", text: "foo " } }))).toHaveLength(0);
    expect(m.map(update("agent_message_chunk", { content: { type: "text", text: "bar" } }))).toHaveLength(0);
    const finals = m.finalize("end_turn");
    expect(finals.map((e) => e.type)).toEqual(["OutputGenerated", "NodeCompleted"]);
    expect((finals[0]!.payload.output as { text: string }).text).toBe("foo bar");
    expect((finals[0]!.payload.output as { stop_reason: string }).stop_reason).toBe("end_turn");
  });

  it("maps tool_call to ToolCalled with preserved metadata", () => {
    const m = createMapper({ runId: "r", nodeId: "n" });
    const evs = m.map(
      update("tool_call", {
        toolCallId: "tc1",
        kind: "edit",
        label: "Apply diff",
        status: "completed",
      }),
    );
    expect(evs).toHaveLength(1);
    expect(evs[0]!.type).toBe("ToolCalled");
    expect(evs[0]!.payload.tool_call_id).toBe("tc1");
    expect(evs[0]!.payload.kind).toBe("edit");
  });

  it("preserves unknown sessionUpdate kinds as ToolCalled with acp: prefix", () => {
    const m = createMapper({ runId: "r", nodeId: "n" });
    const evs = m.map(update("future_thing", { foo: "bar" }));
    expect(evs).toHaveLength(1);
    expect(evs[0]!.payload.kind).toBe("acp:future_thing");
  });

  it("fail() emits a single NodeFailed", () => {
    const m = createMapper({ runId: "r", nodeId: "n" });
    const evs = m.fail("boom");
    expect(evs).toHaveLength(1);
    expect(evs[0]!.type).toBe("NodeFailed");
    expect(evs[0]!.payload.reason).toBe("boom");
  });
});
