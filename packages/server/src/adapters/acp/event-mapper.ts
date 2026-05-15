import { nanoid } from "nanoid";
import type { RuntimeEvent } from "@petrify/shared";
import type { SessionNotification, SessionUpdate } from "@agentclientprotocol/sdk";

interface MapContext {
  runId: string;
  nodeId: string;
}

interface MapState {
  textChunks: string[];
}

function chunkText(update: SessionUpdate): string | undefined {
  if (
    update.sessionUpdate !== "agent_message_chunk" &&
    update.sessionUpdate !== "agent_thought_chunk" &&
    update.sessionUpdate !== "user_message_chunk"
  ) {
    return undefined;
  }
  const content = update.content;
  if (!content) return undefined;
  if (content.type === "text") return content.text;
  return undefined;
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
    map(note: SessionNotification): RuntimeEvent[] {
      const update = note.update;
      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          const text = chunkText(update);
          if (!text) return [];
          state.textChunks.push(text);
          return [event("ToolCalled", { kind: "text_delta", delta: text })];
        }
        case "agent_thought_chunk": {
          // Same shape as agent_message_chunk: { content: { type, text } }.
          // Stream the thought text as its own delta channel so the UI can
          // render it in a separate "thinking" bubble that grows alongside
          // the agent reply, instead of one ToolCalled card per character.
          const text = chunkText(update);
          if (!text) return [];
          return [event("ToolCalled", { kind: "thought_delta", delta: text })];
        }
        case "tool_call":
        case "tool_call_update": {
          return [
            event("ToolCalled", {
              tool_call_id: update.toolCallId,
              kind: (update as { kind?: string }).kind,
              label: (update as { label?: string }).label,
              status: (update as { status?: string }).status,
              raw: update,
            }),
          ];
        }
        case "plan":
          return [event("ToolCalled", { kind: "plan", raw: update })];
        default:
          // Forward-compatible fallback: SDK may add new variants
          // (available_commands_update, current_mode_update, etc.). Record but
          // don't interpret — keeps the trace observable without coupling us
          // to every future protocol extension.
          return [
            event("ToolCalled", {
              kind: `acp:${(update as { sessionUpdate: string }).sessionUpdate}`,
              raw: update,
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
