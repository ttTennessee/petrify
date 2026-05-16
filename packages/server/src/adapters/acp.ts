import { nanoid } from "nanoid";
import * as acp from "@agentclientprotocol/sdk";
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { AdapterManifest, RuntimeEvent } from "@petrify/shared";
import type { AgentAdapter, InvokeRequest } from "./types.js";
import { probeAcp } from "./probe.js";
import type { ProbeResult } from "./probe.js";
import { createMapper } from "./acp/event-mapper.js";
import {
  AsyncEventQueue,
  closeSession,
  spawnAndInit,
  type OpenSession,
} from "./acp/transport.js";
import { createClient } from "./acp/client-impl.js";
import { buildPromptText } from "./acp/prompt.js";
import type { AcpCheckpointBlob } from "./acp/checkpoint.js";

export interface AcpAdapterConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  protocolVersion?: number;
  /** Absolute path passed as session/new.cwd. Defaults to process.cwd(). */
  defaultCwd?: string;
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

interface ActiveInvocation {
  session: OpenSession;
  sessionId: string;
  setQueue: (q: AsyncEventQueue<SessionNotification> | null) => void;
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
    };
  }

  async probe(): Promise<ProbeResult> {
    return probeAcp({
      command: this.cfg.command,
      args: this.cfg.args,
      env: this.cfg.env,
      cwd: this.cfg.defaultCwd,
    });
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

    // Build a Client wired to the broker (or the legacy deny). The
    // permission context is bound to *this* invocation so the broker can
    // attribute the request to a node/run/project.
    const { client, setQueue } = createClient({
      onPermission: this.cfg.onPermission
        ? (pReq) =>
            this.cfg.onPermission!({
              runId: req.runId,
              nodeId: req.node.id,
              projectId: req.projectId,
              nodePolicy: req.node.permission_policy,
              req: pReq,
            })
        : undefined,
    });

    let session: OpenSession;
    let sessionId: string;
    try {
      session = await spawnAndInit({
        command: this.cfg.command,
        args: this.cfg.args,
        env: this.cfg.env,
        cwd: this.resolvedCwd(),
        protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
        client,
      });
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
        payload: {
          reason: `ACP session failed to open: ${(err as Error).message}`,
        },
      };
      return;
    }

    const active: ActiveInvocation = {
      session,
      sessionId,
      setQueue,
      cancelled: false,
    };
    this.active.set(req.invocationId, active);

    const mapper = createMapper({ runId: req.runId, nodeId: req.node.id });
    const queue = new AsyncEventQueue<SessionNotification>();
    setQueue(queue);

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
      setQueue(null);
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
      await a.session.conn.cancel({ sessionId: a.sessionId });
    } catch {
      /* ignore */
    }
  }

  async checkpoint(invocationId: string): Promise<unknown> {
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
    const { client, setQueue } = createClient({});
    const session = await spawnAndInit({
      command: b.command ?? this.cfg.command,
      args: b.args ?? this.cfg.args,
      env: this.cfg.env,
      cwd: this.resolvedCwd(),
      protocolVersion: this.cfg.protocolVersion ?? PROTOCOL_VERSION_DEFAULT,
      client,
    });
    const newSess = await session.conn.newSession({
      cwd: this.resolvedCwd(),
      mcpServers: [],
    });
    const invocationId = nanoid();
    this.active.set(invocationId, {
      session,
      sessionId: newSess.sessionId,
      setQueue,
      cancelled: false,
    });
    return invocationId;
  }

  private resolvedCwd(): string {
    return this.cfg.defaultCwd ?? process.cwd();
  }
}
