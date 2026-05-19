import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { Client } from "@agentclientprotocol/sdk";

export interface SpawnOpts {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd: string;
  protocolVersion?: number;
  client: Client;
}

export interface OpenSession {
  child: ChildProcessWithoutNullStreams;
  conn: acp.ClientSideConnection;
}

export async function spawnAndInit(opts: SpawnOpts): Promise<OpenSession> {
  const child = spawn(opts.command, opts.args ?? [], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  // Surface ACP-server stderr to our server log — without this we're blind
  // when the agent rejects our handshake.
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    process.stderr.write(`[acp:${opts.command}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(
        `[acp:${opts.command}] exited code=${code} signal=${signal ?? "none"}\n`,
      );
    }
  });
  child.on("error", (err) => {
    process.stderr.write(`[acp:${opts.command}] spawn error: ${err.message}\n`);
  });

  const stream = acp.ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  );

  const conn = new acp.ClientSideConnection(() => opts.client, stream);

  await conn.initialize({
    protocolVersion: opts.protocolVersion ?? acp.PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
    },
  });

  return { child, conn };
}

export function closeSession(s: OpenSession): void {
  try {
    s.child.kill();
  } catch {
    /* ignore */
  }
}

// Re-exported for backward compatibility; the canonical home is util/async-queue.
export { AsyncEventQueue } from "../util/async-queue.js";
