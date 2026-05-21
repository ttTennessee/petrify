import { describe, expect, it, beforeEach } from "vitest";
import type {
  PermissionOption,
  RequestPermissionRequest,
} from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@petrify/shared";
import { dbContext } from "../../db-context.js";
import { eventBus } from "../../runtime/events.js";
import { ensureWorkflow, createRun } from "../../runtime/test-helpers.js";
import { permissionBroker } from "./permission-broker.js";

const ALL_OPTIONS: PermissionOption[] = [
  { optionId: "ao", name: "Allow once", kind: "allow_once" },
  { optionId: "aa", name: "Allow always", kind: "allow_always" },
  { optionId: "ro", name: "Reject once", kind: "reject_once" },
  { optionId: "ra", name: "Reject always", kind: "reject_always" },
];

function makeReq(kind = "edit"): RequestPermissionRequest {
  return {
    sessionId: "sess-1",
    options: ALL_OPTIONS,
    toolCall: {
      toolCallId: "tc-1",
      kind: kind as RequestPermissionRequest["toolCall"]["kind"],
      title: "Apply patch",
    },
  };
}

function captureEvents(runId: string): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  eventBus.subscribe(runId, (ev) => events.push(ev));
  return events;
}

let RUN = "";
const NODE = "node-test";
let PROJ = "";

beforeEach(() => {
  permissionBroker._reset();
  dbContext.permissionGrants.deleteAll();
  dbContext.globalConfig.deleteByKey("permission_default_policy");
  // run_events has a FK to runs(id); we need a real run row to publish events.
  const wfId = ensureWorkflow({ nodes: [], edges: [] });
  const wf = dbContext.workflows.getProjectId(wfId);
  PROJ = wf!.project_id;
  RUN = createRun(wfId);
});

describe("PermissionBroker", () => {
  it("deny-all node policy short-circuits to cancelled without prompting", async () => {
    const events = captureEvents(RUN);
    const res = await permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "deny-all",
      req: makeReq(),
    });
    expect(res.outcome.outcome).toBe("cancelled");
    expect(events.find((e) => e.type === "PermissionRequested")).toBeUndefined();
  });

  it("allow-all node policy auto-selects first allow option", async () => {
    const res = await permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "allow-all",
      req: makeReq(),
    });
    expect(res.outcome).toEqual({ outcome: "selected", optionId: "ao" });
  });

  it("ask policy emits PermissionRequested and pends until resolve", async () => {
    const events = captureEvents(RUN);
    const promise = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq(),
    });
    // Event must arrive synchronously after request() before resolve().
    const reqEv = events.find((e) => e.type === "PermissionRequested");
    expect(reqEv).toBeTruthy();
    const requestId = (reqEv!.payload as { request_id: string }).request_id;

    const ok = permissionBroker.resolve(requestId, "allow_once");
    expect(ok).toBe(true);

    const res = await promise;
    expect(res.outcome).toEqual({ outcome: "selected", optionId: "ao" });
    expect(events.find((e) => e.type === "PermissionResolved")).toBeTruthy();
  });

  it("allow_always persists a grant for (project, node, tool_kind)", async () => {
    const promise1 = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("edit"),
    });
    // Pick up the requestId from the bus.
    let firstRequestId = "";
    eventBus.subscribe(RUN, (ev) => {
      if (!firstRequestId && ev.type === "PermissionRequested") {
        firstRequestId = (ev.payload as { request_id: string }).request_id;
      }
    });
    // Yield a tick so the subscribe-then-publish ordering doesn't matter
    await Promise.resolve();
    // Fetch from DB-less path: scan pending by tool kind via resolve flow —
    // we already got the requestId from the immediate publish. But the
    // subscribe above runs only AFTER request() emits, so emit happened
    // before subscribe. We instead re-request and use captureEvents.
    permissionBroker._reset();
    const events = captureEvents(RUN);
    const promise2 = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("edit"),
    });
    const reqEv = events.find((e) => e.type === "PermissionRequested")!;
    const rid = (reqEv.payload as { request_id: string }).request_id;
    permissionBroker.resolve(rid, "allow_always");
    const r = await promise2;
    expect(r.outcome).toEqual({ outcome: "selected", optionId: "aa" });
    // Silence the unused promise1 — it will reject when the test ends; flush.
    void promise1.catch(() => {});

    // Second request for the same (project, node, edit) should short-circuit
    // — no new PermissionRequested event published.
    const events2 = captureEvents(RUN);
    const r2 = await permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("edit"),
    });
    expect(r2.outcome).toEqual({ outcome: "selected", optionId: "ao" });
    expect(events2.find((e) => e.type === "PermissionRequested")).toBeUndefined();
  });

  it("reject_always caches a deny grant", async () => {
    const events = captureEvents(RUN);
    const p = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("execute"),
    });
    const rid = (events.find((e) => e.type === "PermissionRequested")!
      .payload as { request_id: string }).request_id;
    permissionBroker.resolve(rid, "reject_always");
    // ACP: reject_* is also "selected" — the agent reads the option kind to
    // know it was rejected. Only the cached-grant short-circuit returns plain
    // "cancelled" since by then there's no option list to point at.
    expect((await p).outcome).toEqual({ outcome: "selected", optionId: "ra" });

    const r2 = await permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("execute"),
    });
    expect(r2.outcome.outcome).toBe("cancelled");
  });

  it("cancelAllForRun resolves every pending request as cancelled", async () => {
    const events = captureEvents(RUN);
    const p1 = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("edit"),
    });
    const p2 = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: "ask",
      req: makeReq("execute"),
    });
    expect(events.filter((e) => e.type === "PermissionRequested")).toHaveLength(2);

    permissionBroker.cancelAllForRun(RUN);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.outcome.outcome).toBe("cancelled");
    expect(r2.outcome.outcome).toBe("cancelled");
  });

  it("global deny-all default applies when node has no policy", async () => {
    // Simulate Settings = deny-all by writing global_config directly.
    dbContext.globalConfig.upsert(
      "permission_default_policy",
      JSON.stringify("deny-all"),
      Date.now(),
    );

    const r = await permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: PROJ,
      nodePolicy: undefined,
      req: makeReq(),
    });
    expect(r.outcome.outcome).toBe("cancelled");
  });

  it("null projectId disables grant caching but still prompts and resolves", async () => {
    const events = captureEvents(RUN);
    const p = permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: null,
      nodePolicy: "ask",
      req: makeReq(),
    });
    const rid = (events.find((e) => e.type === "PermissionRequested")!
      .payload as { request_id: string }).request_id;
    permissionBroker.resolve(rid, "allow_always");
    expect((await p).outcome).toEqual({
      outcome: "selected",
      optionId: "aa",
    });

    // Next request must NOT be auto-allowed since grant wasn't persisted.
    const events2 = captureEvents(RUN);
    void permissionBroker.request({
      runId: RUN,
      nodeId: NODE,
      projectId: null,
      nodePolicy: "ask",
      req: makeReq(),
    });
    expect(events2.find((e) => e.type === "PermissionRequested")).toBeTruthy();
    permissionBroker.cancelAllForRun(RUN);
  });
});
