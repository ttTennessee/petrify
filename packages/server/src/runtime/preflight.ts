import { getAdapter } from "../adapters/registry.js";
import type { ExecutablePlan } from "./compiler.js";

export interface PreflightFailure {
  node_ref: string;
  node_id: string;
  adapter: string;
  reason: string;
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; failures: PreflightFailure[] };

/**
 * Validate that every adapter referenced by nodes in `plan.order` is:
 *   1. Registered in the in-memory adapter registry, and
 *   2. If the adapter implements `probe()`, currently reachable.
 *
 * Probes for the same adapter name are deduplicated; each unique adapter is
 * probed at most once. Failures are mapped back to every node that references
 * the failing adapter so the UI can highlight them all.
 */
export async function validateAdaptersForRun(
  plan: ExecutablePlan,
): Promise<PreflightResult> {
  const nodesByAdapter = new Map<string, Array<{ id: string; ref: string }>>();
  for (const nodeId of plan.order) {
    const node = plan.nodesById[nodeId];
    if (!node) continue;
    const name = node.adapter.name;
    const bucket = nodesByAdapter.get(name) ?? [];
    bucket.push({ id: node.id, ref: node.ref });
    nodesByAdapter.set(name, bucket);
  }

  const adapterNames = [...nodesByAdapter.keys()];

  const reasonsByAdapter = new Map<string, string>();
  await Promise.all(
    adapterNames.map(async (name) => {
      const adapter = getAdapter(name);
      if (!adapter) {
        reasonsByAdapter.set(name, "adapter not registered");
        return;
      }
      if (typeof adapter.probe !== "function") return;
      try {
        const result = await adapter.probe();
        if (!result.ok) reasonsByAdapter.set(name, result.error);
      } catch (err) {
        reasonsByAdapter.set(name, (err as Error).message);
      }
    }),
  );

  if (reasonsByAdapter.size === 0) return { ok: true };

  const failures: PreflightFailure[] = [];
  for (const [adapter, reason] of reasonsByAdapter.entries()) {
    for (const node of nodesByAdapter.get(adapter) ?? []) {
      failures.push({
        node_ref: node.ref,
        node_id: node.id,
        adapter,
        reason,
      });
    }
  }
  return { ok: false, failures };
}
