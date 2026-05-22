import { nanoid } from "nanoid";
import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type {
  AdapterManifest,
  McpServerSpec,
  RuntimeEvent,
} from "@petrify/shared";
import type {
  AgentAdapter,
  InvokeRequest,
  ProbeResult,
} from "../types.js";

/** Translate Petrify's wire-format MCP spec into the SDK's tagged-union shape.
 *  stdio servers are bare on the SDK side; http/sse carry a `type` discriminant. */
function toAcpMcpServers(specs: McpServerSpec[] | undefined): acp.McpServer[] {
  if (!specs || specs.length === 0) return [];
  return specs.map((s) => {
    if (s.transport === "stdio") {
      return {
        name: s.name,
        command: s.command,
        args: s.args,
        env: s.env,
      };
    }
    return {
      type: s.transport,
      name: s.name,
      url: s.url,
      headers: s.headers,
    };
  });
}
import { probeAcp } from "./probe.js";
import { createMapper } from "./event-mapper.js";
import {
  AsyncEventQueue,
  closeSession,
  spawnAndInit,
  type OpenSession,
} from "./transport.js";
import { createClient, type ClientRouter } from "./client-impl.js";
import { buildPromptText } from "./prompt.js";
import type { AcpCheckpointBlob } from "./checkpoint.js";

export interface AcpAdapterConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  protocolVersion?: number;
  /** Absolute path passed as session/new.cwd. Defaults to process.cwd(). */
  defaultCwd?: string;
  /** Registry/instance name. Surfaced through manifest().name so telemetry can
   *  distinguish multiple ACP instances (claude-code, codex, gemini, ...) that
   *  all share this adapter class. */
  instanceName?: string;
  /** If true, the server pre-spawns the persistent ACP child at enable/boot
   *  time via {@link AcpAdapter.prewarm} so the first invoke has no cold-start
   *  cost. The flag itself doesn't change runtime behavior — it's metadata the
   *  caller may inspect; the actual prewarm is driven by the route layer. */
  keepAlive?: boolean;
  /** Pluggable permission handler (PermissionBroker.request). When omitted
   *  the adapter denies all permission requests — the legacy behavior. */
  onPermission?: (
    req: PermissionContext,
  ) => Promise<RequestPermissionResponse>;
}

/** Context the adapter knows about a permission request — passed to the
 *  consumer (a broker) so it can apply node/project policy. */
export interface PermissionContext {
  runId: string;
  nodeId: string;
  projectId: string | null;
  nodePolicy: "ask" | "allow-all" | "deny-all" | undefined;
  req: RequestPermissionRequest;
}

/** Per-session permission context (no req — filled in at request time). */
interface SessionPermCtx {
  runId: string;
  nodeId: string;
  projectId: string | null;
  nodePolicy: "ask" | "allow-all" | "deny-all" | undefined;
}

interface ActiveInvocation {
  sessionId: string;
  cancelled: boolean;
}

interface SharedConnection {
  session: OpenSession;
  router: ClientRouter<SessionPermCtx>;
}

const PROTOCOL_VERSION_DEFAULT = acp.PROTOCOL_VERSION;

interface InflightSnapshot {
  promptText: string;
  inputs: Record<string, unknown>;
  startedAt: number;
  mcpServers: McpServerSpec[];
}

export class AcpAdapter implements AgentAdapter {
  protected active = new Map<string, ActiveInvocation>();
  protected lastBlobByNode = new Map<string, AcpCheckpointBlob>();
  /** Per-invocation snapshot of the running prompt, used to fill checkpoint()
   *  while the prompt is still in flight (checkpoint:soft semantics). */
  protected inflight = new Map<string, InflightSnapshot>();

  /** Shared, lazily-spawned ACP server connection. Lives for the lifetime of
   *  the adapter instance; recreated only after a crash. */
  protected shared: SharedConnection | null = null;
  /** De-duplicates concurrent spawn attempts. */
  protected starting: Promise<SharedConnection> | null = null;

  constructor(protected cfg: AcpAdapterConfig) {}

  manifest(): AdapterManifest {
    return {
      name: this.cfg.instanceName ?? "acp",
      version: "0.1.0",
      capabilities: ["streaming", "tool_use", "checkpoint:soft"],
      concurrency: { max: 4 },
      resources: { token_per_call_est: 0 },
    };
  }

  /** Eagerly bring up the shared ACP child so the first invoke is hot.
   *  Idempotent — delegates to ensureStarted's dedupe + lifecycle handling. */
  async prewarm(): Promise<void> {
    await this.ensureStarted();
  }

  /** Whether the shared ACP child is currently up. Used by the route layer
   *  to decide if disabling keep-alive needs an explicit dispose. */
  hasShared(): boolean {
    return this.shared !== null;
  }

  async probe(): Promise<ProbeResult> {
    return probeAcp({
      command: this.cfg.command,
      args: this.cfg.args,
      env: this.cfg.env,
      cwd: this.cfg.defaultCwd,
    });
  }

  /** Get the shared ACP server connection, spawning it on first use. */
  private async ensureStarted(): Promise<SharedConnection> {
    if (this.shared) return this.shared;
    if (this.starting) return this.starting;

    const cfgOnPermission = this.cfg.onPermission;
    const router = createClient<SessionPermCtx>({
      onPermission: cfgOnPermission
        ? (permCtx, pReq) =>
            cfgOnPermission({
              runId: permCtx.runId,
              nodeId: permCtx.nodeId,
              projectId: permCtx.projectId,
              nodePolicy: permCtx.nodePolicy,
              req: pReq,
            })
        : undefined,
    });

    this.starting = (async () => {
      const session = await spawnAndInit({
        command: this.cfg.command,
        args: this.cfg.args,
        env: this.cfg.env,
        cwd: this.resolvedCwd(),
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        client: router.client,
      });
      const shared: SharedConnection = { session, router };
      // When the child dies, fail every in-flight session and clear state so
      // the next invoke spawns a fresh process.
      const onDie = (label: string) => () => {
        if (this.shared !== shared) return;
        for (const a of this.active.values()) a.cancelled = true;
        router.failAll(label);
        this.shared = null;
      };
      session.child.on("exit", onDie("ACP server exited"));
      session.child.on("error", onDie("ACP server error"));
      this.shared = shared;
      return shared;
    })();

    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
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

    let shared: SharedConnection;
    let sessionId: string;
    try {
      shared = await this.ensureStarted();
      const newSess = await shared.session.conn.newSession({
        cwd: this.resolvedCwd(),
        mcpServers: toAcpMcpServers(req.mcpServers),
      });
      sessionId = newSess.sessionId;
    } catch (err) {
      yield {
        ...base,
        event_id: nanoid(),
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: {
          reason: `ACP session failed to open: ${(err as Error).message}`,
        },
      };
      return;
    }

    const queue = new AsyncEventQueue<SessionNotification>();
    shared.router.register(sessionId, {
      queue,
      permCtx: {
        runId: req.runId,
        nodeId: req.node.id,
        projectId: req.projectId,
        nodePolicy: req.node.permission_policy,
      },
    });

    const active: ActiveInvocation = { sessionId, cancelled: false };
    this.active.set(req.invocationId, active);
    this.inflight.set(req.invocationId, {
      promptText,
      inputs: req.inputs,
      startedAt: Date.now(),
      mcpServers: req.mcpServers ?? [],
    });

    const mapper = createMapper({ runId: req.runId, nodeId: req.node.id });

    const promptPromise = shared.session.conn
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
        // Router already demuxes by sessionId; keep this as a defensive
        // second filter in case a stray notification slips through.
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
      shared.router.unregister(sessionId);
      this.lastBlobByNode.set(`${req.runId}:${req.node.id}`, {
        sessionId,
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        promptHistory: [{ role: "user", text: promptText }],
        inputsSnapshot: req.inputs,
        command: this.cfg.command,
        args: this.cfg.args,
        mcpServers: req.mcpServers ?? [],
      });
      this.active.delete(req.invocationId);
      this.inflight.delete(req.invocationId);
    }
  }

  async cancel(invocationId: string): Promise<void> {
    const a = this.active.get(invocationId);
    if (!a) return;
    a.cancelled = true;
    const shared = this.shared;
    if (!shared) return;
    try {
      await shared.session.conn.cancel({ sessionId: a.sessionId });
    } catch {
      /* ignore */
    }
  }

  async checkpoint(invocationId: string): Promise<unknown> {
    const a = this.active.get(invocationId);
    if (a) {
      // checkpoint:soft — capture the *intent* (prompt + inputs) of the in-flight
      // invocation. ACP itself has no portable session/save, so restore() will
      // open a fresh session; the blob's role is to let the runtime re-issue an
      // equivalent prompt rather than truly resume mid-stream.
      const snap = this.inflight.get(invocationId);
      return {
        sessionId: a.sessionId,
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        promptHistory: snap
          ? [{ role: "user", text: snap.promptText }]
          : [],
        inputsSnapshot: snap?.inputs ?? {},
        command: this.cfg.command,
        args: this.cfg.args,
        mcpServers: snap?.mcpServers ?? [],
      } satisfies AcpCheckpointBlob;
    }
    return null;
  }

  async restore(blob: unknown): Promise<string> {
    const b = blob as AcpCheckpointBlob | null;
    if (!b || !b.sessionId) {
      throw new Error("invalid ACP checkpoint blob");
    }
    // The ACP protocol doesn't expose a portable session/load, so restore
    // still creates a brand-new session — but now on the shared connection
    // instead of spawning a fresh subprocess.
    const shared = await this.ensureStarted();
    const newSess = await shared.session.conn.newSession({
      cwd: this.resolvedCwd(),
      mcpServers: toAcpMcpServers(b.mcpServers ?? []),
    });
    const invocationId = nanoid();
    this.active.set(invocationId, {
      sessionId: newSess.sessionId,
      cancelled: false,
    });
    return invocationId;
  }

  /** Tear down the shared connection. Intended for tests / graceful shutdown.
   *  Production relies on the child dying alongside the parent process. */
  async dispose(): Promise<void> {
    const shared = this.shared;
    this.shared = null;
    if (shared) {
      shared.router.failAll("adapter disposed");
      closeSession(shared.session);
    }
  }

  private resolvedCwd(): string {
    return this.cfg.defaultCwd ?? process.cwd();
  }
}
