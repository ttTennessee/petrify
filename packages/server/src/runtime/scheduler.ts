import { nanoid } from "nanoid";
import type { CheckpointBlob, RuntimeEvent, WorkflowNode } from "@petrify/shared";
import { db } from "../db.js";
import { getAdapter } from "../adapters/registry.js";
import { eventBus } from "./events.js";
import type { ExecutablePlan } from "./compiler.js";
import { saveCheckpoint, getLatestCheckpoint } from "./checkpoints.js";
import { tracer } from "../telemetry.js";

const updateRun = db.prepare(
  `UPDATE runs SET status = @status, finished_at = @finished_at, error = @error WHERE id = @id`,
);

interface RunStateInternal {
  completed: Set<string>;
  skipped: Set<string>;
  failed: Set<string>;
  outputs: Record<string, unknown>; // by node id
  variables: Record<string, unknown>;
  cancelRequested: boolean;
}

const activeRuns = new Map<string, RunStateInternal>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function backoffMs(node: WorkflowNode, attempt: number): number {
  const base = node.on_failure.backoff_ms ?? 200;
  return Math.min(base * Math.pow(2, attempt - 1), 30_000);
}

function publishEvent(ev: RuntimeEvent) {
  eventBus.publish(ev);
}

async function runNode(
  state: RunStateInternal,
  runId: string,
  node: WorkflowNode,
): Promise<"completed" | "skipped" | "failed"> {
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

  let lastOutput: unknown = null;
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
          for await (const ev of adapter.invoke({
            invocationId,
            runId,
            node,
            inputs: node.inputs as Record<string, unknown>,
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
      lastOutput = attemptOutput;
      state.outputs[node.id] = lastOutput;
      state.completed.add(node.id);
      return "completed";
    }
  }

  // All attempts exhausted (or cancelled). Apply on_failure strategy.
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
    // M2 publishes the boundary; full Saga execution is M2.1.
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
}

// M2 — DAG scheduler with parallel branches, retry/skip/abort, boundary checkpoints.
export async function executeRun(
  runId: string,
  plan: ExecutablePlan,
  options: ExecuteOptions = {},
): Promise<void> {
  const state: RunStateInternal = {
    completed: new Set(),
    skipped: new Set(),
    failed: new Set(),
    outputs: {},
    variables: {},
    cancelRequested: false,
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
    }
  }

  activeRuns.set(runId, state);

  await tracer.startActiveSpan(`run.${runId}`, async (rootSpan) => {
    try {
      // Ready queue: node ids whose predecessors are all done (completed or skipped).
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

      while (remaining.size > 0 && !aborted) {
        if (state.cancelRequested) break;
        // Launch every ready node up to its adapter's concurrency cap.
        for (const id of [...remaining]) {
          if (!isReady(id)) continue;
          const node = plan.nodesById[id]!;
          const cap = concurrencyCapFor(node);
          const inflight = adapterInFlight[node.adapter.name] ?? 0;
          if (inflight >= cap) continue;
          adapterInFlight[node.adapter.name] = inflight + 1;
          const p = (async () => {
            const outcome = await runNode(state, runId, node);
            adapterInFlight[node.adapter.name] = (adapterInFlight[node.adapter.name] ?? 1) - 1;
            inFlight.delete(id);
            remaining.delete(id);
            // boundary checkpoint after each terminal outcome
            const blob = makeCheckpoint(runId, state);
            const saved = saveCheckpoint(runId, blob);
            emitCheckpointSaved(runId, saved.id, blob);
            if (outcome === "failed") aborted = true;
          })();
          inFlight.set(id, p);
        }
        if (inFlight.size === 0) {
          // No node is currently runnable but remaining is non-empty -> blocked.
          break;
        }
        await Promise.race(inFlight.values());
      }

      // Wait for any still-running tasks to finish.
      await Promise.all(inFlight.values());

      if (state.cancelRequested) {
        updateRun.run({
          id: runId,
          status: "cancelled",
          finished_at: Date.now(),
          error: null,
        });
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
        updateRun.run({
          id: runId,
          status: "completed",
          finished_at: Date.now(),
          error: null,
        });
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
  return true;
}

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}
