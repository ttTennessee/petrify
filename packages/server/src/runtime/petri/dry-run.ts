import type { DryRunReport, WorkflowGraph, WorkflowNode } from "@petrify/shared";

// Heuristic dry-run: no real adapter calls, no Petri net simulation.
// Estimates duration as the longest control-path of estimated node durations,
// reports peak concurrent resource usage by simulating the schedule in topological
// passes, and surfaces failure hotspots from the workflow shape.

const DEFAULT_NODE_DURATION_MS = 1_000;

function nodeDuration(n: WorkflowNode): number {
  // Until adapters publish per-call estimates per node, fall back to the
  // node's runtime.timeout (clamped) or a constant default.
  const t = n.runtime?.timeout;
  if (typeof t === "number" && t > 0) return Math.min(t * 1000, 60_000);
  return DEFAULT_NODE_DURATION_MS;
}

export function dryRun(graph: WorkflowGraph): DryRunReport {
  const refToNode = new Map(graph.nodes.map((n) => [n.ref, n] as const));
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n] as const));

  // Build predecessor map (refs).
  const preds = new Map<string, string[]>();
  for (const n of graph.nodes) preds.set(n.ref, []);
  for (const n of graph.nodes) {
    for (const dep of n.dependencies) {
      preds.get(n.ref)!.push(dep);
    }
  }
  for (const e of graph.edges) {
    if (e.kind !== "control") continue;
    const from = idToNode.get(e.from)?.ref;
    const to = idToNode.get(e.to)?.ref;
    if (from && to) preds.get(to)?.push(from);
  }

  // Topological order via Kahn — derived from preds.
  const indeg = new Map<string, number>();
  for (const [ref, ps] of preds) indeg.set(ref, ps.length);
  const queue: string[] = [];
  for (const [ref, d] of indeg) if (d === 0) queue.push(ref);
  const topo: string[] = [];
  // successor map
  const succ = new Map<string, string[]>();
  for (const n of graph.nodes) succ.set(n.ref, []);
  for (const [ref, ps] of preds) {
    for (const p of ps) succ.get(p)?.push(ref);
  }
  while (queue.length > 0) {
    const r = queue.shift()!;
    topo.push(r);
    for (const s of succ.get(r) ?? []) {
      const d = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }

  // Longest-path finish times.
  const finishAt = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();
  for (const ref of topo) {
    const node = refToNode.get(ref)!;
    let predFinish = 0;
    let chosenPred: string | null = null;
    for (const p of preds.get(ref) ?? []) {
      const f = finishAt.get(p) ?? 0;
      if (f > predFinish) {
        predFinish = f;
        chosenPred = p;
      }
    }
    finishAt.set(ref, predFinish + nodeDuration(node));
    cameFrom.set(ref, chosenPred);
  }

  // Identify the terminal with the largest finish time — the critical path tail.
  let tail: string | null = null;
  let total = 0;
  for (const [ref, t] of finishAt) {
    if (t > total) {
      total = t;
      tail = ref;
    }
  }
  const critical: string[] = [];
  while (tail) {
    critical.unshift(tail);
    tail = cameFrom.get(tail) ?? null;
  }

  // Resource peaks: walk topologically and approximate concurrency as the count
  // of nodes "running" at the time of each node's start.
  const peaks: Record<string, number> = {};
  const pools = graph.runtime_policy?.pools ?? {};
  for (const poolName of Object.keys(pools)) peaks[poolName] = 0;

  type Interval = { start: number; end: number; claims: Array<{ name: string; amount: number }> };
  const intervals: Interval[] = [];
  for (const ref of topo) {
    const node = refToNode.get(ref)!;
    const end = finishAt.get(ref) ?? 0;
    const start = end - nodeDuration(node);
    intervals.push({
      start,
      end,
      claims: (node.resources ?? []).map((r) => ({ name: r.name, amount: r.amount })),
    });
  }
  // At each event boundary, compute pool occupancy.
  const events = new Set<number>();
  for (const iv of intervals) {
    events.add(iv.start);
    events.add(iv.end);
  }
  for (const t of [...events].sort((a, b) => a - b)) {
    const occ: Record<string, number> = {};
    for (const iv of intervals) {
      if (iv.start <= t && t < iv.end) {
        for (const c of iv.claims) occ[c.name] = (occ[c.name] ?? 0) + c.amount;
      }
    }
    for (const [name, amt] of Object.entries(occ)) {
      peaks[name] = Math.max(peaks[name] ?? 0, amt);
    }
  }

  // Failure hotspots: nodes with abort + no retries + long duration are riskiest.
  const hotspots: Array<{ node_ref: string; rationale: string }> = [];
  for (const n of graph.nodes) {
    const strat = n.on_failure?.strategy ?? "abort";
    const dur = nodeDuration(n);
    if (strat === "abort" && dur >= DEFAULT_NODE_DURATION_MS * 30) {
      hotspots.push({
        node_ref: n.ref,
        rationale: `long-running (≥${dur / 1000}s) with on_failure.strategy=abort; single failure halts the run`,
      });
    }
    if (n.loop && (!n.loop.exit_condition || n.loop.exit_condition.trim() === "")) {
      hotspots.push({
        node_ref: n.ref,
        rationale: `loop without exit_condition risks running to max_iterations every time`,
      });
    }
    if ((n.resources?.length ?? 0) > 1) {
      hotspots.push({
        node_ref: n.ref,
        rationale: `claims ${n.resources!.length} resources; cross-pool contention risk`,
      });
    }
  }

  return {
    estimated_duration_ms: total,
    critical_path: critical,
    resource_peaks: peaks,
    failure_hotspots: hotspots,
    generated_at: Date.now(),
  };
}
