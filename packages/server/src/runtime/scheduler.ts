import { nanoid } from "nanoid";
import type { CheckpointBlob, RuntimeEvent, WorkflowNode } from "@petrify/shared";
import { db } from "../db.js";
import { getAdapter } from "../adapters/registry.js";
import { permissionBroker } from "../adapters/acp/permission-broker.js";
import { resolveServers } from "../services/mcp-servers.js";
import { eventBus } from "./events.js";
import type { ExecutablePlan } from "./compiler.js";
import { saveCheckpoint, getLatestCheckpoint } from "./checkpoints.js";
import { tracer } from "../telemetry.js";
import { ResourcePool } from "./resources.js";
import { evaluateBoolean, evaluateExpression } from "./expr/evaluator.js";

const updateRun = db.prepare(
  `UPDATE runs SET status = @status, finished_at = @finished_at, error = @error WHERE id = @id`,
);

interface PauseHandle {
  resolve: () => void;
  cancel: () => void;
}

interface RunStateInternal {
  completed: Set<string>;
  skipped: Set<string>;
  failed: Set<string>;
  blocked: Set<string>; // waiting on resources
  outputs: Record<string, unknown>; // by node id
  outputsByRef: Record<string, unknown>; // by node ref — used for expression scope
  variables: Record<string, unknown>;
  iterationCounts: Record<string, number>; // node id -> times completed
  cancelRequested: boolean;
  resourcePool: ResourcePool;
  workflowId: string;
  projectId: string | null;
  pausedNodes: Map<string, PauseHandle>;
  stepMode: boolean;
  // Step-mode UX: the very first node should run immediately; the pause
  // happens at the END of that node, i.e. before the *next* node — which
  // is the same as pausing before every node except the first.
  stepModeAnyStarted: boolean;
}

const activeRuns = new Map<string, RunStateInternal>();

// ---- M4: breakpoints ----
const breakpointLookup = db.prepare(
  `SELECT 1 FROM breakpoints WHERE workflow_id = ? AND node_id = ? AND enabled = 1 LIMIT 1`,
);

function isBreakpointActive(workflowId: string, nodeId: string): boolean {
  // Forward-compatibility seam: a future workflow.step_mode flag would also be OR-ed here.
  return breakpointLookup.get(workflowId, nodeId) !== undefined;
}

function waitForContinue(state: RunStateInternal, nodeId: string): Promise<void> {
  if (state.cancelRequested) return Promise.resolve();
  return new Promise<void>((resolve) => {
    state.pausedNodes.set(nodeId, {
      resolve: () => {
        state.pausedNodes.delete(nodeId);
        resolve();
      },
      cancel: () => {
        state.pausedNodes.delete(nodeId);
        resolve();
      },
    });
  });
}

export function signalContinue(runId: string, nodeId: string): boolean {
  const s = activeRuns.get(runId);
  const handle = s?.pausedNodes.get(nodeId);
  if (!handle) return false;
  handle.resolve();
  return true;
}

export function listPausedNodes(runId: string): string[] {
  const s = activeRuns.get(runId);
  return s ? [...s.pausedNodes.keys()] : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(node: WorkflowNode, attempt: number): number {
  const base = node.on_failure.backoff_ms ?? 200;
  return Math.min(base * Math.pow(2, attempt - 1), 30_000);
}

function publishEvent(ev: RuntimeEvent) {
  eventBus.publish(ev);
}

/**
 * Walk node.inputs and evaluate any expression-shaped string values against
 * the current run scope. Without this, `inputs: { "x": "$.outputs.foo.text" }`
 * reaches the adapter as the literal string `"$.outputs.foo.text"` and the
 * downstream agent never sees upstream data.
 *
 * - Only strings starting with `$.` are treated as expressions; everything
 *   else is passed through (so configs with plain string/number/bool/object
 *   inputs keep working).
 * - Recurses into plain objects and arrays so nested input shapes resolve too.
 * - On evaluation failure we keep the original string and let the prompt show
 *   it — failing loudly later is better than swallowing a typo'd ref here.
 */
function resolveInputs(
  inputs: Record<string, unknown>,
  scope: { variables: Record<string, unknown>; outputs: Record<string, unknown>; env: Record<string, string> },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inputs)) {
    out[k] = resolveValue(v, scope);
  }
  return out;
}

function resolveValue(
  v: unknown,
  scope: { variables: Record<string, unknown>; outputs: Record<string, unknown>; env: Record<string, string> },
): unknown {
  if (typeof v === "string") {
    if (v.startsWith("$.")) {
      try {
        return evaluateExpression(v, scope);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((it) => resolveValue(it, scope));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
      out[k] = resolveValue(inner, scope);
    }
    return out;
  }
  return v;
}

function makeScope(state: RunStateInternal): {
  variables: Record<string, unknown>;
  outputs: Record<string, unknown>;
  env: Record<string, string>;
} {
  return {
    variables: state.variables,
    outputs: state.outputsByRef,
    env: { ...process.env } as Record<string, string>,
  };
}

async function runNode(
  state: RunStateInternal,
  runId: string,
  node: WorkflowNode,
): Promise<"completed" | "skipped" | "failed"> {
  // ---- M4: breakpoint pause (also triggered by step-mode auto-pause) ----
  // In step mode the first node runs without a pre-pause; pauses then fire
  // before every subsequent node (equivalent to "pause at end of previous").
  const stepPause = state.stepMode && state.stepModeAnyStarted;
  if (
    !state.cancelRequested &&
    (stepPause || isBreakpointActive(state.workflowId, node.id))
  ) {
    publishEvent({
      event_id: nanoid(),
      run_id: runId,
      node_id: node.id,
      type: "BreakpointHit",
      timestamp: Date.now(),
      payload: {
        node_id: node.id,
        workflow_id: state.workflowId,
        reason: "user_breakpoint",
      },
    });
    await waitForContinue(state, node.id);
    if (state.cancelRequested) {
      state.failed.add(node.id);
      return "failed";
    }
  }

  if (state.stepMode) state.stepModeAnyStarted = true;

  const adapter = getAdapter(node.adapter.name);
  if (!adapter) {
    publishEvent({
      event_id: nanoid(),
      run_id: runId,
      node_id: node.id,
      type: "NodeFailed",
      timestamp: Date.now(),
      payload: { reason: `adapter "${node.adapter.name}" not registered` },
    });
    return "failed";
  }

  const strategy = node.on_failure.strategy ?? "abort";
  const maxAttempts =
    strategy === "retry" ? Math.max(1, node.on_failure.max_attempts ?? 3) : 1;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (state.cancelRequested) break;
    if (attempt > 1) {
      const delay = backoffMs(node, attempt);
      publishEvent({
        event_id: nanoid(),
        run_id: runId,
        node_id: node.id,
        type: "RetryTriggered",
        timestamp: Date.now(),
        payload: { attempt, delay_ms: delay },
      });
      await sleep(delay);
    }

    const invocationId = nanoid();
    let nodeFailed = false;
    let attemptOutput: unknown = null;

    try {
      await tracer.startActiveSpan(`node.${node.ref}.attempt.${attempt}`, async (span) => {
        try {
          const resolvedInputs = resolveInputs(
            node.inputs as Record<string, unknown>,
            makeScope(state),
          );
          for await (const ev of adapter.invoke({
            invocationId,
            runId,
            projectId: state.projectId,
            node,
            inputs: resolvedInputs,
            mcpServers: resolveServers(node.mcp_servers ?? []),
          })) {
            span.addEvent(ev.type);
            publishEvent(ev);
            if (ev.type === "OutputGenerated") {
              attemptOutput = (ev.payload as { output?: unknown }).output ?? ev.payload;
            }
            if (ev.type === "NodeFailed") {
              nodeFailed = true;
              lastError = ev.payload;
            }
            if (state.cancelRequested) break;
          }
        } finally {
          span.end();
        }
      });
    } catch (err) {
      nodeFailed = true;
      lastError = (err as Error).message ?? String(err);
      publishEvent({
        event_id: nanoid(),
        run_id: runId,
        node_id: node.id,
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: { reason: lastError },
      });
    }

    if (!nodeFailed && !state.cancelRequested) {
      state.outputs[node.id] = attemptOutput;
      state.outputsByRef[node.ref] = attemptOutput;
      // If the adapter included a variables_patch object on the output, merge it
      // into the run's shared variables so downstream condition/loop expressions
      // can observe state changes. This is the M3 contract until a richer
      // RuntimeContext API arrives.
      if (
        attemptOutput &&
        typeof attemptOutput === "object" &&
        !Array.isArray(attemptOutput) &&
        "variables_patch" in (attemptOutput as Record<string, unknown>)
      ) {
        const patch = (attemptOutput as Record<string, unknown>).variables_patch;
        if (patch && typeof patch === "object" && !Array.isArray(patch)) {
          Object.assign(state.variables, patch as Record<string, unknown>);
        }
      }
      state.completed.add(node.id);
      return "completed";
    }
  }

  // All attempts exhausted (or cancelled).
  state.failed.add(node.id);
  if (state.cancelRequested) return "failed";

  if (strategy === "skip") {
    publishEvent({
      event_id: nanoid(),
      run_id: runId,
      node_id: node.id,
      type: "NodeSkipped",
      timestamp: Date.now(),
      payload: { reason: "on_failure.skip after exhausted attempts", lastError },
    });
    state.failed.delete(node.id);
    state.skipped.add(node.id);
    return "skipped";
  }

  if (strategy === "compensate") {
    publishEvent({
      event_id: nanoid(),
      run_id: runId,
      node_id: node.id,
      type: "CompensationTriggered",
      timestamp: Date.now(),
      payload: {
        reason: "compensation requested",
        compensate_ref: node.on_failure.compensate_ref ?? null,
        note: "compensation execution is M2.1; treating as abort",
      },
    });
  }

  return "failed";
}

function makeCheckpoint(runId: string, state: RunStateInternal): CheckpointBlob {
  return {
    run_id: runId,
    saved_at: Date.now(),
    completed_node_ids: [...state.completed],
    skipped_node_ids: [...state.skipped],
    node_outputs: { ...state.outputs },
    variables: { ...state.variables },
  };
}

function emitCheckpointSaved(runId: string, checkpointId: string, blob: CheckpointBlob) {
  publishEvent({
    event_id: nanoid(),
    run_id: runId,
    node_id: null,
    type: "CheckpointSaved",
    timestamp: blob.saved_at,
    payload: { checkpoint_id: checkpointId, completed: blob.completed_node_ids.length },
  });
}

export interface ExecuteOptions {
  resumeFromCheckpointId?: string;
  stepMode?: boolean;
}

// M3 — DAG scheduler with condition / loop / resources execution semantics.
export async function executeRun(
  runId: string,
  plan: ExecutablePlan,
  options: ExecuteOptions = {},
): Promise<void> {
  const runRow = db
    .prepare(`SELECT workflow_id FROM runs WHERE id = ?`)
    .get(runId) as { workflow_id: string } | undefined;
  const workflowId = runRow?.workflow_id ?? "";
  const wfRow = workflowId
    ? (db
        .prepare(`SELECT project_id FROM workflows WHERE id = ?`)
        .get(workflowId) as { project_id: string } | undefined)
    : undefined;
  const projectId: string | null = wfRow?.project_id ?? null;

  const state: RunStateInternal = {
    completed: new Set(),
    skipped: new Set(),
    failed: new Set(),
    blocked: new Set(),
    outputs: {},
    outputsByRef: {},
    variables: {},
    iterationCounts: {},
    cancelRequested: false,
    resourcePool: new ResourcePool(plan.pools ?? {}),
    workflowId,
    projectId,
    pausedNodes: new Map(),
    stepMode: options.stepMode === true,
    stepModeAnyStarted: false,
  };

  // If resuming, hydrate state from the chosen checkpoint (or the latest).
  if (options.resumeFromCheckpointId !== undefined) {
    const cp = options.resumeFromCheckpointId
      ? (await import("./checkpoints.js")).getCheckpoint(options.resumeFromCheckpointId)
      : getLatestCheckpoint(runId);
    if (cp) {
      for (const id of cp.blob.completed_node_ids) state.completed.add(id);
      for (const id of cp.blob.skipped_node_ids) state.skipped.add(id);
      state.outputs = { ...cp.blob.node_outputs };
      state.variables = { ...cp.blob.variables };
      // Rebuild outputsByRef from outputs + plan.
      for (const [nodeId, output] of Object.entries(state.outputs)) {
        const node = plan.nodesById[nodeId];
        if (node) state.outputsByRef[node.ref] = output;
      }
    }
  }

  activeRuns.set(runId, state);

  await tracer.startActiveSpan(`run.${runId}`, async (rootSpan) => {
    try {
      const remaining = new Set(
        plan.order.filter((id) => !state.completed.has(id) && !state.skipped.has(id)),
      );
      const inFlight = new Map<string, Promise<void>>();

      const isReady = (id: string) =>
        !inFlight.has(id) &&
        (plan.predecessors[id] ?? []).every(
          (p) => state.completed.has(p) || state.skipped.has(p),
        );

      const concurrencyCapFor = (node: WorkflowNode) => {
        const m = getAdapter(node.adapter.name)?.manifest();
        return m?.concurrency?.max ?? 1;
      };

      const adapterInFlight: Record<string, number> = {};

      let aborted = false;
      let progressedThisIteration = true;

      while (remaining.size > 0 && !aborted) {
        if (state.cancelRequested) break;
        progressedThisIteration = false;

        for (const id of [...remaining]) {
          if (!isReady(id)) continue;
          const node = plan.nodesById[id]!;

          // ---- condition guard ----
          if (node.condition) {
            let pass: boolean;
            try {
              pass = evaluateBoolean(node.condition, makeScope(state));
            } catch (err) {
              publishEvent({
                event_id: nanoid(),
                run_id: runId,
                node_id: node.id,
                type: "NodeFailed",
                timestamp: Date.now(),
                payload: {
                  reason: `condition evaluation failed: ${(err as Error).message}`,
                },
              });
              state.failed.add(id);
              remaining.delete(id);
              aborted = true;
              continue;
            }
            if (!pass) {
              publishEvent({
                event_id: nanoid(),
                run_id: runId,
                node_id: node.id,
                type: "NodeSkipped",
                timestamp: Date.now(),
                payload: { reason: "condition_false", condition: node.condition },
              });
              state.skipped.add(id);
              remaining.delete(id);
              progressedThisIteration = true;
              continue;
            }
          }

          // ---- resource acquisition ----
          const claims = (node.resources ?? []).map((r) => ({ name: r.name, amount: r.amount }));
          if (claims.length > 0) {
            const acq = state.resourcePool.tryAcquire(claims);
            if (!acq.acquired) {
              state.blocked.add(id);
              continue; // try again on next iteration
            }
            state.blocked.delete(id);
            for (const c of claims) {
              publishEvent({
                event_id: nanoid(),
                run_id: runId,
                node_id: node.id,
                type: "ResourceAcquired",
                timestamp: Date.now(),
                payload: { pool: c.name, amount: c.amount },
              });
            }
          }

          // ---- adapter concurrency cap ----
          const cap = concurrencyCapFor(node);
          const inflight = adapterInFlight[node.adapter.name] ?? 0;
          if (inflight >= cap) {
            // Release resources we just took, since we can't run.
            if (claims.length > 0) state.resourcePool.release(node.resources ?? []);
            continue;
          }
          adapterInFlight[node.adapter.name] = inflight + 1;

          const p = (async () => {
            const outcome = await runNode(state, runId, node);
            adapterInFlight[node.adapter.name] = (adapterInFlight[node.adapter.name] ?? 1) - 1;
            inFlight.delete(id);

            // Release resources (respect release:false).
            if (claims.length > 0) {
              state.resourcePool.release(node.resources ?? []);
              for (const c of node.resources ?? []) {
                if (c.release === false) continue;
                publishEvent({
                  event_id: nanoid(),
                  run_id: runId,
                  node_id: node.id,
                  type: "ResourceReleased",
                  timestamp: Date.now(),
                  payload: { pool: c.name, amount: c.amount },
                });
              }
            }

            // ---- loop handling: re-arm node if exit_condition is false ----
            if (outcome === "completed" && node.loop) {
              state.iterationCounts[id] = (state.iterationCounts[id] ?? 0) + 1;
              const exit = node.loop.exit_condition;
              let shouldExit = true;
              try {
                shouldExit = exit ? evaluateBoolean(exit, makeScope(state)) : true;
              } catch (err) {
                publishEvent({
                  event_id: nanoid(),
                  run_id: runId,
                  node_id: node.id,
                  type: "NodeFailed",
                  timestamp: Date.now(),
                  payload: {
                    reason: `loop exit_condition eval failed: ${(err as Error).message}`,
                  },
                });
                aborted = true;
                return;
              }
              if (!shouldExit) {
                if (state.iterationCounts[id]! >= node.loop.max_iterations) {
                  publishEvent({
                    event_id: nanoid(),
                    run_id: runId,
                    node_id: node.id,
                    type: "NodeFailed",
                    timestamp: Date.now(),
                    payload: {
                      reason: `loop reached max_iterations (${node.loop.max_iterations}) without exit`,
                    },
                  });
                  state.failed.add(id);
                  aborted = true;
                  return;
                }
                // Re-arm: pop back into remaining and clear completed.
                state.completed.delete(id);
                remaining.add(id);
              } else {
                remaining.delete(id);
              }
            } else {
              remaining.delete(id);
            }

            const blob = makeCheckpoint(runId, state);
            const saved = saveCheckpoint(runId, blob);
            emitCheckpointSaved(runId, saved.id, blob);
            if (outcome === "failed") aborted = true;
          })();
          inFlight.set(id, p);
          progressedThisIteration = true;
        }

        if (inFlight.size === 0) {
          if (state.blocked.size > 0 && !progressedThisIteration) {
            // Nothing in flight, some nodes blocked on resources — runtime deadlock.
            publishEvent({
              event_id: nanoid(),
              run_id: runId,
              node_id: null,
              type: "NodeFailed",
              timestamp: Date.now(),
              payload: {
                reason: `runtime resource deadlock: blocked = ${[...state.blocked].join(", ")}`,
              },
            });
            aborted = true;
            break;
          }
          if (remaining.size > 0 && !progressedThisIteration) break;
          if (remaining.size === 0) break;
          continue;
        }
        await Promise.race(inFlight.values());
      }

      await Promise.all(inFlight.values());

      if (state.cancelRequested) {
        updateRun.run({ id: runId, status: "cancelled", finished_at: Date.now(), error: null });
      } else if (state.failed.size > 0 || aborted) {
        updateRun.run({
          id: runId,
          status: "failed",
          finished_at: Date.now(),
          error: `node(s) failed: ${[...state.failed].join(", ")}`,
        });
      } else if (remaining.size > 0) {
        updateRun.run({
          id: runId,
          status: "failed",
          finished_at: Date.now(),
          error: `blocked: ${remaining.size} node(s) had unresolved predecessors`,
        });
      } else {
        updateRun.run({ id: runId, status: "completed", finished_at: Date.now(), error: null });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateRun.run({
        id: runId,
        status: "failed",
        finished_at: Date.now(),
        error: message,
      });
    } finally {
      activeRuns.delete(runId);
      rootSpan.end();
    }
  });
}

export function requestCancel(runId: string): boolean {
  const s = activeRuns.get(runId);
  if (!s) return false;
  s.cancelRequested = true;
  // Wake any paused nodes so they fall through to the cancel/abort path.
  for (const handle of s.pausedNodes.values()) handle.cancel();
  // Release any pending agent permission prompts — otherwise their Promise
  // would hang forever and the adapter cancel() couldn't progress.
  permissionBroker.cancelAllForRun(runId);
  return true;
}

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}
