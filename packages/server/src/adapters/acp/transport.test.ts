import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AcpTransport } from "./transport.js";

const fixture = resolve(
  fileURLToPath(import.meta.url),
  "../../../../test/fixtures/fake-acp-server.mjs",
);

describe("AcpTransport", () => {
  it("handles initialize + session/new + session/prompt with streamed updates", async () => {
    const t = new AcpTransport({ command: process.execPath, args: [fixture] });

    const updates: Array<{ method?: string; params?: unknown }> = [];
    t.on("notification", (msg) => updates.push(msg));

    const init = await t.request<{ protocolVersion: string }>("initialize", {
      protocolVersion: "0.1",
    });
    expect(init.protocolVersion).toBe("0.1");

    const session = await t.request<{ sessionId: string }>("session/new", {});
    expect(session.sessionId).toMatch(/^sess_/);

    const prompt = await t.request<{ stopReason: string }>("session/prompt", {
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "hi" }],
    });
    expect(prompt.stopReason).toBe("end_turn");

    // Notifications must have been delivered before the prompt response resolves.
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates.every((u) => u.method === "session/update")).toBe(true);

    t.close();
  });

  it("rejects pending requests when the server exits", async () => {
    const t = new AcpTransport({ command: process.execPath, args: [fixture] });
    const promise = t.request("never_handled_method", {});
    t.close();
    await expect(promise).rejects.toThrow();
  });
});
