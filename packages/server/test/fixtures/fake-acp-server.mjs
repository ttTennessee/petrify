#!/usr/bin/env node
// Minimal NDJSON JSON-RPC ACP-shaped server used by tests.
//
// Implements:
//   initialize          → returns { protocolVersion }
//   session/new         → returns { sessionId }
//   session/prompt      → emits two session/update notifications (one
//                         tool_call, one agent_message_chunk), then resolves
//                         with { stopReason: "end_turn" }
//   session/cancel      → notification, no response

import readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

let sessionCounter = 0;
const cancelled = new Set();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "0.1" } });
    return;
  }
  if (msg.method === "session/new") {
    const sid = `sess_${++sessionCounter}`;
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: sid } });
    return;
  }
  if (msg.method === "session/cancel") {
    cancelled.add(msg.params?.sessionId);
    return;
  }
  if (msg.method === "session/prompt") {
    const sid = msg.params?.sessionId;
    // Stream a tool_call + a text chunk, then complete.
    setTimeout(() => {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: sid,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tc_1",
            kind: "edit",
            label: "fake tool",
            status: "completed",
          },
        },
      });
    }, 20);
    setTimeout(() => {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello world" },
          },
        },
      });
    }, 40);
    setTimeout(() => {
      if (cancelled.has(sid)) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { stopReason: "cancelled" },
        });
      } else {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { stopReason: "end_turn" },
        });
      }
    }, 80);
    return;
  }
});
