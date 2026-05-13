import { nanoid } from "nanoid";
import type { RuntimeEvent } from "@petrify/shared";
import type { SessionUpdate } from "./protocol.js";

interface MapContext {
  runId: string;
  nodeId: string;
}

interface MapState {
  textChunks: string[];
}

export function createMapper(ctx: MapContext) {
  const state: MapState = { textChunks: [] };

  function event(
    type: RuntimeEvent["type"],
    payload: Record<string, unknown>,
  ): RuntimeEvent {
    return {
      event_id: nanoid(),
      run_id: ctx.runId,
      node_id: ctx.nodeId,
      type,
      timestamp: Date.now(),
      payload,
    };
  }

  return {
    /**
     * Map a single `session/update` notification to zero or more RuntimeEvents.
     * Unknown variants are surfaced as ToolCalled with raw payload so the trace
     * is never silently lossy.
     */
    map(update: SessionUpdate): RuntimeEvent[] {
      const kind = update.update.sessionUpdate;
      switch (kind) {
        case "agent_message_chunk": {
          const content = (update.update as { content?: { text?: string } })
            .content;
          if (!content?.text) return [];
          state.textChunks.push(content.text);
          return [
            event("ToolCalled", {
              kind: "text_delta",
              delta: content.text,
            }),
          ];
        }
        case "tool_call":
        case "tool_call_update": {
          return [
            event("ToolCalled", {
              tool_call_id: (update.update as { toolCallId?: string }).toolCallId,
              kind: (update.update as { kind?: string }).kind,
              label: (update.update as { label?: string }).label,
              status: (update.update as { status?: string }).status,
              raw: update.update,
            }),
          ];
        }
        case "plan":
        case "agent_thought_chunk":
          // Internal-thought variants — keep them out of the user-visible trace
          // but don't drop entirely; surface as ToolCalled with kind="thought".
          return [
            event("ToolCalled", {
              kind: "thought",
              raw: update.update,
            }),
          ];
        default:
          return [
            event("ToolCalled", {
              kind: `acp:${kind}`,
              raw: update.update,
            }),
          ];
      }
    },

    /** Called once the `session/prompt` response arrives. */
    finalize(stopReason: string | undefined): RuntimeEvent[] {
      const text = state.textChunks.join("");
      const output = {
        text,
        stop_reason: stopReason ?? "end_turn",
      };
      return [
        event("OutputGenerated", { output }),
        event("NodeCompleted", { output }),
      ];
    },

    /** Called when the prompt errors out or the transport dies mid-stream. */
    fail(reason: string): RuntimeEvent[] {
      return [event("NodeFailed", { reason })];
    },
  };
}
