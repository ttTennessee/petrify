import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { Client, SessionNotification } from "@agentclientprotocol/sdk";

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

export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiters: Array<(v: IteratorResult<T>) => void> = [];
  private done = false;

  push(value: T): void {
    if (this.done) return;
    const w = this.waiters.shift();
    if (w) w({ value, done: false });
    else this.buffer.push(value);
  }

  close(): void {
    this.done = true;
    while (this.waiters.length) {
      const w = this.waiters.shift()!;
      w({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) =>
          this.waiters.push(resolve),
        );
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined as unknown as T, done: true });
      },
    };
  }
}
