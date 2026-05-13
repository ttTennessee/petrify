import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getAdapter } from "../adapters/registry.js";
import { eventBus } from "./events.js";
import type { ExecutablePlan } from "./compiler.js";
import { tracer } from "../telemetry.js";

const updateRun = db.prepare(
  `UPDATE runs SET status = @status, finished_at = @finished_at, error = @error WHERE id = @id`,
);

// M1 — strictly sequential, fail-fast. No retry / skip / compensate (M2+).
export async function executeRun(runId: string, plan: ExecutablePlan): Promise<void> {
  await tracer.startActiveSpan(`run.${runId}`, async (rootSpan) => {
    try {
      for (const nodeId of plan.order) {
        const node = plan.nodesById[nodeId]!;
        const adapter = getAdapter(node.adapter.name);
        if (!adapter) throw new Error(`adapter missing at runtime: ${node.adapter.name}`);

        await tracer.startActiveSpan(`node.${node.ref}`, async (span) => {
          const invocationId = nanoid();
          try {
            for await (const ev of adapter.invoke({
              invocationId,
              runId,
              node,
              inputs: node.inputs,
            })) {
              span.addEvent(ev.type, { node_id: ev.node_id ?? "" });
              eventBus.publish(ev);
              if (ev.type === "NodeFailed") {
                throw new Error(
                  `node ${node.ref} failed: ${JSON.stringify(ev.payload)}`,
                );
              }
            }
          } finally {
            span.end();
          }
        });
      }
      updateRun.run({
        id: runId,
        status: "completed",
        finished_at: Date.now(),
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateRun.run({
        id: runId,
        status: "failed",
        finished_at: Date.now(),
        error: message,
      });
      eventBus.publish({
        event_id: nanoid(),
        run_id: runId,
        node_id: null,
        type: "NodeFailed",
        timestamp: Date.now(),
        payload: { message },
      });
    } finally {
      rootSpan.end();
    }
  });
}
