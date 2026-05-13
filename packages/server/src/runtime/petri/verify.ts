import type {
  Marking,
  VerificationIssue,
  VerificationReport,
  WorkflowGraph,
} from "@petrify/shared";
import { compilePetri } from "./compile.js";
import { exploreReachability } from "./reachability.js";

// Produce a VerificationReport for the workflow.
// Each check is implemented as a discrete inspection of the reachable markings.

export function verifyWorkflow(graph: WorkflowGraph): VerificationReport {
  const compiled = compilePetri(graph);
  const reach = exploreReachability(compiled.net, compiled.initialMarking);
  const issues: VerificationIssue[] = [];

  // ---- 1. unbounded places ----
  const unboundedPlaces: string[] = [];
  for (const place of compiled.net.places) {
    for (const m of reach.markings) {
      if (m[place.id] === "omega") {
        unboundedPlaces.push(place.id);
        break;
      }
    }
  }
  for (const placeId of unboundedPlaces) {
    const origin = compiled.placeIdMeta.get(placeId);
    if (origin?.kind === "control_edge" || origin?.kind === "data_edge") {
      issues.push({
        level: "warning",
        code: "unbounded_place",
        message: `edge ${origin.from} → ${origin.to} can accumulate unbounded tokens (a loop without a consumer?)`,
        affected_node_refs: [origin.from, origin.to],
      });
    } else if (origin?.kind === "pool") {
      // Pools growing without bound usually means more "release" arcs than "consume" arcs.
      issues.push({
        level: "warning",
        code: "unbounded_place",
        message: `resource pool "${origin.pool}" can grow unbounded (release without acquire?)`,
        affected_pools: [origin.pool],
      });
    }
  }

  // ---- 2. deadlock / resource-deadlock ----
  // A deadlock marking is reachable, non-terminal, and has no enabled transition.
  const terminalMarkings: Marking[] = [];
  for (const m of reach.markings) {
    let anyEnabled = false;
    for (const t of compiled.net.transitions) {
      let canFire = true;
      for (const arc of compiled.net.arcs) {
        if (arc.to !== t.id) continue;
        const have = m[arc.from] ?? 0;
        if (have === "omega") continue;
        if (have < arc.weight) {
          canFire = false;
          break;
        }
      }
      if (canFire) {
        anyEnabled = true;
        break;
      }
    }
    if (!anyEnabled) terminalMarkings.push(m);
  }

  // Determine which terminal markings are "good" (all node entry places consumed,
  // i.e. all transitions actually fired) vs "stuck" (some transitions never fired).
  const firedTransitions = new Set([...reach.enabledHistory.entries()].filter(([, v]) => v > 0).map(([k]) => k));
  const totalTransitions = compiled.net.transitions.length;
  if (firedTransitions.size < totalTransitions) {
    // Some node never fired — point at which one(s).
    const nonFired = compiled.net.transitions.filter((t) => !firedTransitions.has(t.id));
    for (const t of nonFired) {
      const ref = compiled.transitionIdToNodeRef.get(t.id);
      if (!ref) continue;
      issues.push({
        level: "error",
        code: "non_live_transition",
        message: `node "${ref}" can never fire under the initial marking (unreachable or starved)`,
        affected_node_refs: [ref],
      });
    }
  }

  // Resource-deadlock: a non-empty deadlock marking with at least one pool place still loaded.
  for (const m of terminalMarkings) {
    let isResourceDeadlock = false;
    const stuckRefs: string[] = [];
    const stuckPools: string[] = [];
    for (const place of compiled.net.places) {
      if (place.origin.kind === "pool" && (m[place.id] ?? 0) !== place.initial) {
        isResourceDeadlock = true;
        stuckPools.push(place.origin.pool);
      }
      if (place.origin.kind === "control_edge" && (m[place.id] ?? 0) !== 0) {
        stuckRefs.push(place.origin.to);
      }
    }
    if (isResourceDeadlock && stuckRefs.length > 0) {
      issues.push({
        level: "error",
        code: "resource_deadlock",
        message: `resource deadlock: nodes ${stuckRefs.join(", ")} cannot proceed because pools ${stuckPools.join(", ")} are partially held`,
        affected_node_refs: stuckRefs,
        affected_pools: stuckPools,
        witness_marking: m,
      });
    }
  }

  // ---- 3. non-terminating loops (boundedness implies termination for finite nets,
  //         but unbounded markings hint at runaway loops). ----
  // If we found unbounded places AND there's a cycle in the workflow dependency graph,
  // flag it. We approximate "cycle" as: a transition fires more than once in the
  // exploration history (this is a coarse signal under Karp-Miller acceleration).
  for (const [tid, count] of reach.enabledHistory) {
    if (count > 1) {
      const ref = compiled.transitionIdToNodeRef.get(tid);
      const node = ref ? graph.nodes.find((n) => n.ref === ref) : undefined;
      if (node?.loop && !node.loop.exit_condition) {
        issues.push({
          level: "error",
          code: "non_terminating_loop",
          message: `node "${ref}" loops without an exit_condition`,
          affected_node_refs: ref ? [ref] : [],
        });
      }
    }
  }

  // Derive overall status and risk.
  let status: VerificationReport["status"] = "pass";
  let risk: VerificationReport["risk"] = "low";
  if (issues.some((i) => i.level === "error")) {
    status = "fail";
    risk = "blocking";
  } else if (issues.some((i) => i.level === "warning")) {
    status = "warn";
    risk = "medium";
  }

  return {
    status,
    risk,
    issues,
    stats: {
      place_count: compiled.net.places.length,
      transition_count: compiled.net.transitions.length,
      explored_markings: reach.markings.length,
      truncated: reach.truncated,
    },
    verified_at: Date.now(),
  };
}
