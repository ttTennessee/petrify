import { nanoid } from "nanoid";
import type {
  PermissionOption,
  PermissionOptionId,
  PermissionOptionKind,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@petrify/shared";
import { dbContext } from "../../db-context.js";
import { eventBus } from "../../runtime/events.js";
import { getConfig } from "../../routes/config.js";

export type NodePolicy = "ask" | "allow-all" | "deny-all" | undefined;

export interface PermissionRequestContext {
  runId: string;
  nodeId: string;
  projectId: string | null;
  nodePolicy: NodePolicy;
  req: RequestPermissionRequest;
}

export type ResolveDecision = PermissionOptionKind | "cancelled";

interface PendingEntry {
  runId: string;
  nodeId: string;
  projectId: string | null;
  toolKind: string;
  options: PermissionOption[];
  resolve: (r: RequestPermissionResponse) => void;
}

// Single in-process registry. Server is single-node by design (CLAUDE.md).
const pending = new Map<string, PendingEntry>();

function lookupGrant(
  projectId: string | null,
  nodeId: string,
  toolKind: string,
): "allow" | "deny" | null {
  // Grants are keyed by project. Without a project we treat the run as
  // unscoped — no cached decisions apply, every request asks fresh.
  if (!projectId) return null;
  const d = dbContext.permissionGrants.getDecision(projectId, nodeId, toolKind);
  return (d as "allow" | "deny" | undefined) ?? null;
}

function rememberGrant(
  projectId: string | null,
  nodeId: string,
  toolKind: string,
  decision: "allow" | "deny",
): void {
  if (!projectId) return;
  dbContext.permissionGrants.upsert({
    project_id: projectId,
    node_id: nodeId,
    tool_kind: toolKind,
    decision,
    created_at: Date.now(),
  });
}

function pickFirstByKind(
  options: PermissionOption[],
  kinds: PermissionOptionKind[],
): PermissionOption | undefined {
  for (const k of kinds) {
    const hit = options.find((o) => o.kind === k);
    if (hit) return hit;
  }
  return undefined;
}

function publishRequestedEvent(
  ctx: PermissionRequestContext,
  requestId: string,
  toolKind: string,
): void {
  const tc = ctx.req.toolCall;
  const ev: RuntimeEvent = {
    event_id: nanoid(),
    run_id: ctx.runId,
    node_id: ctx.nodeId,
    type: "PermissionRequested",
    timestamp: Date.now(),
    payload: {
      request_id: requestId,
      tool_call: {
        id: tc.toolCallId,
        kind: toolKind,
        title: tc.title ?? null,
        raw_input: tc.rawInput ?? null,
      },
      options: ctx.req.options.map((o) => ({
        id: o.optionId,
        name: o.name,
        kind: o.kind,
      })),
    },
  };
  eventBus.publish(ev);
}

function publishResolvedEvent(
  entry: PendingEntry,
  requestId: string,
  decision: ResolveDecision,
  optionId?: PermissionOptionId,
): void {
  const ev: RuntimeEvent = {
    event_id: nanoid(),
    run_id: entry.runId,
    node_id: entry.nodeId,
    type: "PermissionResolved",
    timestamp: Date.now(),
    payload: {
      request_id: requestId,
      decision,
      option_id: optionId ?? null,
    },
  };
  eventBus.publish(ev);
}

function effectivePolicy(node: NodePolicy): "ask" | "allow-all" | "deny-all" {
  if (node) return node;
  const cfg = getConfig();
  // Global setting only switches between ask and hard-deny. allow-all global
  // would be too dangerous; users must opt in per-node.
  return cfg.permission_default_policy === "deny-all" ? "deny-all" : "ask";
}

/** Synchronous resolution paths that short-circuit before involving the user. */
function tryShortCircuit(
  ctx: PermissionRequestContext,
  toolKind: string,
): RequestPermissionResponse | null {
  const policy = effectivePolicy(ctx.nodePolicy);

  if (policy === "deny-all") {
    return { outcome: { outcome: "cancelled" } };
  }
  if (policy === "allow-all") {
    const opt = pickFirstByKind(ctx.req.options, ["allow_once", "allow_always"]);
    if (opt) return { outcome: { outcome: "selected", optionId: opt.optionId } };
    return { outcome: { outcome: "cancelled" } };
  }

  // policy === "ask": check the cached grant first.
  const grant = lookupGrant(ctx.projectId, ctx.nodeId, toolKind);
  if (grant === "deny") return { outcome: { outcome: "cancelled" } };
  if (grant === "allow") {
    const opt = pickFirstByKind(ctx.req.options, ["allow_once"]);
    if (opt) return { outcome: { outcome: "selected", optionId: opt.optionId } };
    return { outcome: { outcome: "cancelled" } };
  }
  return null;
}

export interface PermissionBroker {
  request(ctx: PermissionRequestContext): Promise<RequestPermissionResponse>;
  resolve(requestId: string, decision: ResolveDecision): boolean;
  cancelAllForRun(runId: string): void;
  /** Test-only: drop all pending entries. */
  _reset(): void;
}

export const permissionBroker: PermissionBroker = {
  async request(ctx) {
    const toolKind = ctx.req.toolCall.kind ?? "other";
    const short = tryShortCircuit(ctx, toolKind);
    if (short) return short;

    const requestId = nanoid();
    const promise = new Promise<RequestPermissionResponse>((resolve) => {
      pending.set(requestId, {
        runId: ctx.runId,
        nodeId: ctx.nodeId,
        projectId: ctx.projectId,
        toolKind,
        options: ctx.req.options,
        resolve,
      });
    });
    publishRequestedEvent(ctx, requestId, toolKind);
    return promise;
  },

  resolve(requestId, decision) {
    const entry = pending.get(requestId);
    if (!entry) return false;
    pending.delete(requestId);

    let response: RequestPermissionResponse;
    let chosenOptionId: PermissionOptionId | undefined;

    if (decision === "cancelled") {
      response = { outcome: { outcome: "cancelled" } };
    } else {
      const opt = entry.options.find((o) => o.kind === decision);
      if (!opt) {
        // Agent didn't offer the kind the UI sent (e.g. no allow_always). Fall
        // back to cancelled rather than silently picking a different option.
        response = { outcome: { outcome: "cancelled" } };
      } else {
        chosenOptionId = opt.optionId;
        response = { outcome: { outcome: "selected", optionId: opt.optionId } };
        if (decision === "allow_always") {
          rememberGrant(entry.projectId, entry.nodeId, entry.toolKind, "allow");
        } else if (decision === "reject_always") {
          rememberGrant(entry.projectId, entry.nodeId, entry.toolKind, "deny");
        }
      }
    }

    publishResolvedEvent(
      entry,
      requestId,
      decision,
      chosenOptionId,
    );
    entry.resolve(response);
    return true;
  },

  cancelAllForRun(runId) {
    for (const [requestId, entry] of pending) {
      if (entry.runId !== runId) continue;
      pending.delete(requestId);
      publishResolvedEvent(entry, requestId, "cancelled");
      entry.resolve({ outcome: { outcome: "cancelled" } });
    }
  },

  _reset() {
    pending.clear();
  },
};
