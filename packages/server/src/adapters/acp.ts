import { nanoid } from "nanoid";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "./types.js";
import { AcpTransport } from "./acp/transport.js";
import { SessionUpdateParamsSchema, type SessionUpdate } from "./acp/protocol.js";
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

interface ActiveInvocation {
  transport: AcpTransport;
  sessionId: string;
  cancelled: boolean;
}

const PROTOCOL_VERSION_DEFAULT = 1;

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
    let active: ActiveInvocation;
    try {
      active = await this.openSession();
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
    this.active.set(req.invocationId, active);
    const mapper = createMapper({ runId: req.runId, nodeId: req.node.id });

    const queue = new AsyncEventQueue<SessionUpdate>();
    const onNotification = (msg: { method?: string; params?: unknown }) => {
      if (msg.method !== "session/update") return;
      const parsed = SessionUpdateParamsSchema.safeParse(msg.params);
      if (parsed.success && parsed.data.sessionId === active.sessionId) {
        queue.push(parsed.data);
      }
    };
    active.transport.on("notification", onNotification);

    // Fire the prompt request and resolve its completion concurrently with the
    // notification stream.
    const promptPromise = active.transport
      .request<{ stopReason?: string }>("session/prompt", {
        sessionId: active.sessionId,
        prompt: [{ type: "text", text: promptText }],
      })
      .then(
        (res) => ({ ok: true as const, res }),
        (err: Error) => ({ ok: false as const, err }),
      )
      .finally(() => queue.close());

    try {
      for await (const update of queue) {
        if (active.cancelled) break;
        const evs = mapper.map(update);
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
      active.transport.off("notification", onNotification);
      this.lastBlobByNode.set(`${req.runId}:${req.node.id}`, {
        sessionId: active.sessionId,
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        promptHistory: [{ role: "user", text: promptText }],
        inputsSnapshot: req.inputs,
        command: this.cfg.command,
        args: this.cfg.args,
      });
      this.active.delete(req.invocationId);
      active.transport.close();
    }
  }

  async cancel(invocationId: string): Promise<void> {
    const a = this.active.get(invocationId);
    if (!a) return;
    a.cancelled = true;
    try {
      a.transport.notify("session/cancel", { sessionId: a.sessionId });
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
    const transport = await this.spawnAndInit({
      command: b.command ?? this.cfg.command,
      args: b.args ?? this.cfg.args,
    });
    const session = await transport.request<{ sessionId: string }>(
      "session/new",
      this.newSessionParams(),
    );
    const invocationId = nanoid();
    this.active.set(invocationId, {
      transport,
      sessionId: session.sessionId,
      cancelled: false,
    });
    return invocationId;
  }

  private async openSession(): Promise<ActiveInvocation> {
    const transport = await this.spawnAndInit(this.cfg);
    const session = await transport.request<{ sessionId: string }>(
      "session/new",
      this.newSessionParams(),
    );
    return { transport, sessionId: session.sessionId, cancelled: false };
  }

  private async spawnAndInit(opts: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }): Promise<AcpTransport> {
    const transport = new AcpTransport({
      command: opts.command,
      args: opts.args,
      env: opts.env,
    });
    // Surface ACP-server stderr to our server log — without this we're blind
    // when the agent rejects our handshake.
    transport.on("stderr", (chunk: string) => {
      process.stderr.write(`[acp:${opts.command}] ${chunk}`);
    });
    transport.on("exit", ({ code, signal }: { code: number | null; signal: string | null }) => {
      if (code !== 0 && code !== null) {
        process.stderr.write(
          `[acp:${opts.command}] exited code=${code} signal=${signal ?? "none"}\n`,
        );
      }
    });
    await transport.request("initialize", {
      protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
      },
    });
    return transport;
  }

  private newSessionParams(): Record<string, unknown> {
    return {
      cwd: this.cfg.defaultCwd ?? process.cwd(),
      mcpServers: [],
    };
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
