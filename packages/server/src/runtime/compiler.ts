import { WorkflowGraphSchema, type WorkflowGraph, type WorkflowNode } from "@petrify/shared";
import { getAdapter } from "../adapters/registry.js";

export interface ExecutablePlan {
  graph: WorkflowGraph;
  order: string[]; // node ids in topological order
  nodesById: Record<string, WorkflowNode>;
  predecessors: Record<string, string[]>; // node id -> upstream node ids
  successors: Record<string, string[]>; // node id -> downstream node ids
  pools: Record<string, number>; // pool name -> capacity (M3+)
}

export class CompileError extends Error {
  constructor(message: string, public readonly issues: string[] = []) {
    super(message);
  }
}

export function compile(raw: unknown): ExecutablePlan {
  const parsed = WorkflowGraphSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CompileError(
      "Workflow graph failed schema validation",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const graph = parsed.data;

  // 1. unique ids & refs
  const ids = new Set<string>();
  const refs = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) throw new CompileError(`duplicate node id: ${n.id}`);
    if (refs.has(n.ref)) throw new CompileError(`duplicate node ref: ${n.ref}`);
    ids.add(n.id);
    refs.add(n.ref);
  }

  // 2. adapter availability
  for (const n of graph.nodes) {
    if (!getAdapter(n.adapter.name)) {
      throw new CompileError(
        `node "${n.ref}" references unregistered adapter "${n.adapter.name}"`,
      );
    }
  }

  // 3. build dependency graph (M1+M2 uses node.dependencies + control edges)
  const indeg: Record<string, number> = {};
  const succ: Record<string, string[]> = {};
  const pred: Record<string, string[]> = {};
  for (const n of graph.nodes) {
    indeg[n.id] = 0;
    succ[n.id] = [];
    pred[n.id] = [];
  }
  const refToId = new Map(graph.nodes.map((n) => [n.ref, n.id]));

  const addDep = (fromId: string, toId: string) => {
    if (!(fromId in indeg) || !(toId in indeg)) {
      throw new CompileError(`edge references unknown node: ${fromId} -> ${toId}`);
    }
    succ[fromId]!.push(toId);
    pred[toId]!.push(fromId);
    indeg[toId]! += 1;
  };

  for (const n of graph.nodes) {
    for (const depRef of n.dependencies) {
      const depId = refToId.get(depRef);
      if (!depId) throw new CompileError(`node "${n.ref}" depends on unknown ref "${depRef}"`);
      addDep(depId, n.id);
    }
  }
  for (const e of graph.edges) {
    if (e.kind !== "control") continue; // M1: only control edges shape execution
    addDep(e.from, e.to);
  }

  // 4. Kahn topo sort
  const queue: string[] = [];
  for (const [id, d] of Object.entries(indeg)) if (d === 0) queue.push(id);
  const order: string[] = [];
  const indegMut = { ...indeg };
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succ[id] ?? []) {
      indegMut[s] = (indegMut[s] ?? 0) - 1;
      if (indegMut[s] === 0) queue.push(s);
    }
  }
  if (order.length !== graph.nodes.length) {
    throw new CompileError("workflow contains a cycle (control-edge DAG violation)");
  }

  const nodesById = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  // 5. Pools: every claimed pool must be declared in runtime_policy.pools.
  const declared = graph.runtime_policy?.pools ?? {};
  const pools: Record<string, number> = {};
  for (const [name, spec] of Object.entries(declared)) {
    pools[name] = spec.capacity;
  }
  const claimedPools = new Set<string>();
  for (const n of graph.nodes) {
    for (const claim of n.resources ?? []) claimedPools.add(claim.name);
  }
  const missing: string[] = [];
  for (const name of claimedPools) {
    if (!(name in pools)) missing.push(name);
  }
  if (missing.length > 0) {
    throw new CompileError(
      `pool(s) ${missing.map((m) => `"${m}"`).join(", ")} are claimed by nodes but not declared in runtime_policy.pools`,
      missing.map((m) => `runtime_policy.pools.${m}: missing`),
    );
  }

  return { graph, order, nodesById, predecessors: pred, successors: succ, pools };
}
