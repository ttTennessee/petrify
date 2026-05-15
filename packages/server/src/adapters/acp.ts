import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { nanoid } from "nanoid";
import * as acp from "@agentclientprotocol/sdk";
import type {
  Client,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "./types.js";
import { createMapper } from "./acp/event-mapper.js";

export interface AcpAdapterConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  protocolVersion?: number;
  /** Absolute path passed as session/new.cwd. Defaults to process.cwd(). */
  defaultCwd?: string;
}

interface AcpCheckpointBlob {
  sessionId: string;
  protocolVersion: number;
  promptHistory: Array<{ role: string; text: string }>;
  inputsSnapshot: Record<string, unknown>;
  command: string;
  args?: string[];
}

interface OpenSession {
  child: ChildProcessWithoutNullStreams;
  conn: acp.ClientSideConnection;
  /** Pushes `session/update` notifications for the current sessionId. */
  pushUpdate: (n: SessionNotification) => void;
  /** Swap which queue the client impl writes into when a new invocation reuses
   * an already-open connection (we currently open a fresh child per invoke). */
  setQueue: (q: AsyncEventQueue<SessionNotification> | null) => void;
}

interface ActiveInvocation {
  session: OpenSession;
  sessionId: string;
  cancelled: boolean;
}

const PROTOCOL_VERSION_DEFAULT = acp.PROTOCOL_VERSION;

export class AcpAdapter implements AgentAdapter {
  private active = new Map<string, ActiveInvocation>();
  private lastBlobByNode = new Map<string, AcpCheckpointBlob>();

  constructor(private cfg: AcpAdapterConfig) {}

  manifest(): AdapterManifest {
    return {
      name: "acp",
      version: "0.1.0",
      capabilities: ["streaming", "tool_use", "checkpoint:soft"],
      concurrency: { max: 4 },
      resources: { token_per_call_est: 0 },
      // We do not impose sandboxing — the ACP server defines its own policy.
      // Omitting `sandbox` signals "delegated to underlying agent".
    };
  }

  async *invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent> {
    const base = { run_id: req.runId, node_id: req.node.id };
    yield {
      ...base,
      event_id: nanoid(),
      type: "NodeStarted",
      timestamp: Date.now(),
      payload: { ref: req.node.ref, title: req.node.title, adapter: "acp" },
    };

    const promptText = buildPromptText(req);
    let session: OpenSession;
    let sessionId: string;
    try {
      session = await this.spawnAndInit(this.cfg);
      const newSess = await session.conn.newSession({
        cwd: this.resolvedCwd(),
        mcpServers: [],
      });
      sessionId = newSess.sessionId;
    } catch (err) {
      yield {
        ...base,
        event_id: nanoid(),
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: { reason: `ACP session failed to open: ${(err as Error).message}` },
      };
      return;
    }

    const active: ActiveInvocation = { session, sessionId, cancelled: false };
    this.active.set(req.invocationId, active);

    const mapper = createMapper({ runId: req.runId, nodeId: req.node.id });
    const queue = new AsyncEventQueue<SessionNotification>();
    session.setQueue(queue);

    // Fire the prompt request and stream notifications concurrently.
    const promptPromise = session.conn
      .prompt({
        sessionId,
        prompt: [{ type: "text", text: promptText }],
      })
      .then(
        (res) => ({ ok: true as const, res }),
        (err: Error) => ({ ok: false as const, err }),
      )
      .finally(() => queue.close());

    try {
      for await (const note of queue) {
        if (active.cancelled) break;
        if (note.sessionId !== sessionId) continue;
        const evs = mapper.map(note);
        for (const ev of evs) yield ev;
      }
      const result = await promptPromise;
      if (active.cancelled) {
        yield {
          ...base,
          event_id: nanoid(),
          type: "NodeFailed",
          timestamp: Date.now(),
          payload: { reason: "cancelled" },
        };
      } else if (result.ok) {
        const finals = mapper.finalize(result.res.stopReason);
        for (const ev of finals) yield ev;
      } else {
        for (const ev of mapper.fail(result.err.message)) yield ev;
      }
    } finally {
      session.setQueue(null);
      this.lastBlobByNode.set(`${req.runId}:${req.node.id}`, {
        sessionId,
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        promptHistory: [{ role: "user", text: promptText }],
        inputsSnapshot: req.inputs,
        command: this.cfg.command,
        args: this.cfg.args,
      });
      this.active.delete(req.invocationId);
      closeSession(session);
    }
  }

  async cancel(invocationId: string): Promise<void> {
    const a = this.active.get(invocationId);
    if (!a) return;
    a.cancelled = true;
    try {
      // Fire-and-forget — the SDK turns this into a `session/cancel`
      // notification. The agent is then expected to wind down and respond
      // to the in-flight prompt with stopReason="cancelled".
      await a.session.conn.cancel({ sessionId: a.sessionId });
    } catch {
      /* ignore */
    }
  }

  async checkpoint(invocationId: string): Promise<unknown> {
    // We persist the soft blob via lastBlobByNode in `invoke()` so that a
    // post-mortem checkpoint after a failure still has something to return.
    // During an active invocation we expose the live session info.
    const a = this.active.get(invocationId);
    if (a) {
      return {
        sessionId: a.sessionId,
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        promptHistory: [],
        inputsSnapshot: {},
        command: this.cfg.command,
        args: this.cfg.args,
      } satisfies AcpCheckpointBlob;
    }
    return null;
  }

  async restore(blob: unknown): Promise<string> {
    const b = blob as AcpCheckpointBlob | null;
    if (!b || !b.sessionId) {
      throw new Error("invalid ACP checkpoint blob");
    }
    // Re-open transport + session. ACP doesn't standardize session resume yet,
    // so for `soft` we open a fresh session and replay user-side prompt history.
    const session = await this.spawnAndInit({
      command: b.command ?? this.cfg.command,
      args: b.args ?? this.cfg.args,
    });
    const newSess = await session.conn.newSession({
      cwd: this.resolvedCwd(),
      mcpServers: [],
    });
    const invocationId = nanoid();
    this.active.set(invocationId, {
      session,
      sessionId: newSess.sessionId,
      cancelled: false,
    });
    return invocationId;
  }

  private resolvedCwd(): string {
    return this.cfg.defaultCwd ?? process.cwd();
  }

  private async spawnAndInit(opts: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }): Promise<OpenSession> {
    // Anchor the spawned agent process to the SAME cwd we advertise via
    // session/new. Otherwise the agent sees a process cwd inherited from the
    // server (often packages/server when started via the workspace dev script)
    // while session.cwd points elsewhere — its file-write tools then resolve
    // relative paths inconsistently across concurrent invocations.
    const cwd = this.resolvedCwd();
    const child = spawn(opts.command, opts.args ?? [], {
      cwd,
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

    let queueRef: AsyncEventQueue<SessionNotification> | null = null;
    const clientImpl: Client = {
      async sessionUpdate(params: SessionNotification): Promise<void> {
        queueRef?.push(params);
      },
      async requestPermission(
        _params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> {
        // We advertise no fs/permission capabilities — agent shouldn't reach
        // here. If it does, deny by responding with a cancelled outcome.
        return { outcome: { outcome: "cancelled" } };
      },
      async readTextFile(
        _params: ReadTextFileRequest,
      ): Promise<ReadTextFileResponse> {
        throw new Error("fs.readTextFile not supported by Petrify ACP client");
      },
      async writeTextFile(
        _params: WriteTextFileRequest,
      ): Promise<WriteTextFileResponse> {
        throw new Error("fs.writeTextFile not supported by Petrify ACP client");
      },
    };

    const conn = new acp.ClientSideConnection(() => clientImpl, stream);

    await conn.initialize({
      protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
      },
    });

    return {
      child,
      conn,
      pushUpdate: (n) => queueRef?.push(n),
      setQueue: (q) => {
        queueRef = q;
      },
    };
  }
}

function closeSession(s: OpenSession): void {
  try {
    s.child.kill();
  } catch {
    /* ignore */
  }
}

function buildPromptText(req: InvokeRequest): string {
  const task = req.node.prompt?.task_prompt ?? "";
  const sys = req.node.prompt?.system_prompt;
  const inputsBlob = JSON.stringify(req.inputs, null, 2);
  const parts: string[] = [];
  if (sys) parts.push(`<system>\n${sys}\n</system>`);
  if (task) parts.push(task);
  parts.push(`<inputs>\n${inputsBlob}\n</inputs>`);
  return parts.join("\n\n");
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
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
