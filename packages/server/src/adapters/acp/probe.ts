import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { ProbeResult } from "../types.js";

export interface ProbeOpts {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
}

export async function probeAcp(opts: ProbeOpts): Promise<ProbeResult> {
  const started = Date.now();
  let child: ReturnType<typeof spawn> | null = null;
  const stderrChunks: string[] = [];
  try {
    child = spawn(opts.command, opts.args ?? [], {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      if (stderrChunks.length < 16) stderrChunks.push(chunk);
    });
    child.on("error", () => {});
    child.on("exit", () => {});

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const conn = new acp.ClientSideConnection(
      () => ({
        async sessionUpdate() {},
        async requestPermission() {
          return { outcome: { outcome: "cancelled" as const } };
        },
      }),
      stream,
    );

    const handshake = conn.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
    const timeoutMs = opts.timeoutMs ?? 8000;
    const res = await Promise.race([
      handshake,
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error(`initialize timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    return {
      ok: true,
      protocolVersion: res.protocolVersion,
      capabilities: res.agentCapabilities,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const stderr = stderrChunks.join("").trim();
    const msg = (err as Error).message;
    return {
      ok: false,
      error: stderr ? `${msg}\nstderr: ${stderr.slice(0, 500)}` : msg,
    };
  } finally {
    try {
      child?.kill();
    } catch {
      /* ignore */
    }
  }
}
