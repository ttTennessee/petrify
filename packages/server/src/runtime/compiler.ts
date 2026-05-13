import { WorkflowGraphSchema, type WorkflowGraph, type WorkflowNode } from "@petrify/shared";
import { getAdapter } from "../adapters/registry.js";

export interface ExecutablePlan {
  graph: WorkflowGraph;
  order: string[]; // node ids in topological order
  nodesById: Record<string, WorkflowNode>;
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

  // 3. build dependency graph (M1 uses node.dependencies + control edges)
  const indeg: Record<string, number> = {};
  const succ: Record<string, string[]> = {};
  for (const n of graph.nodes) {
    indeg[n.id] = 0;
    succ[n.id] = [];
  }
  const refToId = new Map(graph.nodes.map((n) => [n.ref, n.id]));

  const addDep = (fromId: string, toId: string) => {
    if (!(fromId in indeg) || !(toId in indeg)) {
      throw new CompileError(`edge references unknown node: ${fromId} -> ${toId}`);
    }
    succ[fromId]!.push(toId);
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
  return { graph, order, nodesById };
}
