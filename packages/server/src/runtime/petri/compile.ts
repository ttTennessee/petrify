import type {
  PetriNet,
  Place,
  Transition,
  Arc,
  WorkflowGraph,
} from "@petrify/shared";

// Mapping (see plan §"Petri 网映射规则"):
//   Node N           -> Transition t_N with auxiliary places p_<N>_start / p_<N>_end
//   Control edge A→B -> Place p_edge_<A>_<B>; t_A produces 1, t_B consumes 1
//   Data edge        -> same as control edge (M3 does not distinguish colors)
//   Resource pool X  -> Place p_pool_<X> with initial = capacity; node fires consume/release
//
// We split each node into a "start" transition and an "end" place so we can model
// "node holds a resource for its duration" — start fires once (consumes resource
// + control tokens), end fires once (releases resource + emits downstream control tokens).
// However for M3 we keep the simpler one-shot encoding: a single transition t_N
// that simultaneously consumes inputs and produces outputs. This is enough for
// boundedness / deadlock detection on the workflow class we support.

export interface PetriCompileResult {
  net: PetriNet;
  initialMarking: Record<string, number>;
  // Map workflow-level identifiers to Petri ids so callers can translate witness markings back.
  nodeRefToTransitionId: Map<string, string>;
  transitionIdToNodeRef: Map<string, string>;
  placeIdMeta: Map<string, Place["origin"]>;
}

export function compilePetri(graph: WorkflowGraph): PetriCompileResult {
  const places: Place[] = [];
  const transitions: Transition[] = [];
  const arcs: Arc[] = [];
  const initial: Record<string, number> = {};
  const nodeRefToTransitionId = new Map<string, string>();
  const transitionIdToNodeRef = new Map<string, string>();
  const placeIdMeta = new Map<string, Place["origin"]>();

  const addPlace = (place: Place) => {
    places.push(place);
    initial[place.id] = place.initial;
    placeIdMeta.set(place.id, place.origin);
  };

  const addTransition = (t: Transition) => {
    transitions.push(t);
  };

  // Transitions for each node.
  for (const n of graph.nodes) {
    const tid = `t_${n.ref}`;
    addTransition({ id: tid, label: n.title, origin: { kind: "node", node: n.ref } });
    nodeRefToTransitionId.set(n.ref, tid);
    transitionIdToNodeRef.set(tid, n.ref);

    // Each node has an entry place — a "go-ahead" token signalling it may fire.
    // The root nodes (no deps) start with 1 token; others get tokens from upstream edges.
    const startId = `p_${n.ref}_in`;
    addPlace({
      id: startId,
      label: `${n.ref}.in`,
      initial: 0,
      origin: { kind: "node_start", node: n.ref },
    });
  }

  // Root nodes (no deps + no incoming control edge) get an initial token in their entry place.
  const hasUpstream = new Set<string>();
  const refToId = new Map(graph.nodes.map((n) => [n.ref, n.id]));
  const idToRef = new Map(graph.nodes.map((n) => [n.id, n.ref]));
  for (const n of graph.nodes) {
    for (const dep of n.dependencies) {
      hasUpstream.add(n.ref);
      if (refToId.has(dep)) {
        // synthesize a control-edge place
        const placeId = `p_edge_${dep}_${n.ref}`;
        if (!placeIdMeta.has(placeId)) {
          addPlace({
            id: placeId,
            label: `${dep}→${n.ref}`,
            initial: 0,
            origin: { kind: "control_edge", from: dep, to: n.ref },
          });
        }
        arcs.push({ from: `t_${dep}`, to: placeId, weight: 1 });
        arcs.push({ from: placeId, to: `t_${n.ref}`, weight: 1 });
      }
    }
  }
  for (const e of graph.edges) {
    if (e.kind === "control" || e.kind === "data") {
      const fromRef = idToRef.get(e.from);
      const toRef = idToRef.get(e.to);
      if (!fromRef || !toRef) continue;
      hasUpstream.add(toRef);
      const placeId = `p_edge_${fromRef}_${toRef}`;
      if (!placeIdMeta.has(placeId)) {
        addPlace({
          id: placeId,
          label: `${fromRef}→${toRef}`,
          initial: 0,
          origin: { kind: e.kind === "control" ? "control_edge" : "data_edge", from: fromRef, to: toRef },
        });
      }
      arcs.push({ from: `t_${fromRef}`, to: placeId, weight: 1 });
      arcs.push({ from: placeId, to: `t_${toRef}`, weight: 1 });
    }
  }

  // Roots: prime the entry place with 1 token.
  for (const n of graph.nodes) {
    if (!hasUpstream.has(n.ref)) {
      const startId = `p_${n.ref}_in`;
      // Connect the entry place to the transition.
      arcs.push({ from: startId, to: `t_${n.ref}`, weight: 1 });
      initial[startId] = 1;
    } else {
      // Non-roots also get an entry place arc; the token arrives via upstream edges,
      // but the entry place itself isn't strictly necessary since edge-places feed t_N.
      // Keep the entry place for symmetry but leave it dry (initial 0, no arcs).
    }
  }

  // Resource pools.
  const pools = graph.runtime_policy?.pools ?? {};
  for (const [poolName, poolSpec] of Object.entries(pools)) {
    const placeId = `p_pool_${poolName}`;
    addPlace({
      id: placeId,
      label: `pool:${poolName}`,
      initial: poolSpec.capacity,
      origin: { kind: "pool", pool: poolName },
    });
  }

  for (const n of graph.nodes) {
    for (const claim of n.resources ?? []) {
      const placeId = `p_pool_${claim.name}`;
      if (!placeIdMeta.has(placeId)) {
        // Pool not declared — compiler check will fire separately; for the Petri compile
        // we still mint a place with capacity 0 so the resulting net is well-formed.
        addPlace({
          id: placeId,
          label: `pool:${claim.name}`,
          initial: 0,
          origin: { kind: "pool", pool: claim.name },
        });
      }
      arcs.push({ from: placeId, to: `t_${n.ref}`, weight: claim.amount });
      if (claim.release !== false) {
        arcs.push({ from: `t_${n.ref}`, to: placeId, weight: claim.amount });
      }
    }
  }

  return {
    net: { places, transitions, arcs },
    initialMarking: initial,
    nodeRefToTransitionId,
    transitionIdToNodeRef,
    placeIdMeta,
  };
}
