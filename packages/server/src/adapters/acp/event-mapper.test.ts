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
  it("streams agent_message_chunk as text_delta events and finalizes with full text", () => {
    const m = createMapper({ runId: "r1", nodeId: "n1" });
    const d1 = m.map(update("agent_message_chunk", { content: { type: "text", text: "foo " } }));
    const d2 = m.map(update("agent_message_chunk", { content: { type: "text", text: "bar" } }));
    expect(d1).toHaveLength(1);
    expect(d1[0]!.type).toBe("ToolCalled");
    expect(d1[0]!.payload.kind).toBe("text_delta");
    expect(d1[0]!.payload.delta).toBe("foo ");
    expect(d2[0]!.payload.delta).toBe("bar");
    const finals = m.finalize("end_turn");
    expect(finals.map((e) => e.type)).toEqual(["OutputGenerated", "NodeCompleted"]);
    expect((finals[0]!.payload.output as { text: string }).text).toBe("foo bar");
    expect((finals[0]!.payload.output as { stop_reason: string }).stop_reason).toBe("end_turn");
  });

  it("streams agent_thought_chunk as thought_delta events", () => {
    const m = createMapper({ runId: "r", nodeId: "n" });
    const d = m.map(
      update("agent_thought_chunk", { content: { type: "text", text: "let me think" } }),
    );
    expect(d).toHaveLength(1);
    expect(d[0]!.payload.kind).toBe("thought_delta");
    expect(d[0]!.payload.delta).toBe("let me think");
    // thought text must not contaminate the final assistant output
    const finals = m.finalize("end_turn");
    expect((finals[0]!.payload.output as { text: string }).text).toBe("");
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
