import type { Marking, PetriNet, TokenCount } from "@petrify/shared";

// Karp-Miller coverability-tree style exploration.
// Returns the set of reachable / coverable markings (capped by maxMarkings),
// plus the list of transitions that ever fired (live set).

export interface ReachabilityResult {
  markings: Marking[];
  enabledHistory: Map<string, number>; // transition id -> fire count across exploration
  truncated: boolean;
}

const MAX_MARKINGS_DEFAULT = 5_000;

function addCount(a: TokenCount, b: TokenCount): TokenCount {
  if (a === "omega" || b === "omega") return "omega";
  return a + b;
}

function subCount(a: TokenCount, b: number): TokenCount {
  if (a === "omega") return "omega";
  return a - b;
}

function canFire(marking: Marking, net: PetriNet, transitionId: string): boolean {
  for (const arc of net.arcs) {
    if (arc.to !== transitionId) continue;
    const have = marking[arc.from] ?? 0;
    if (have === "omega") continue;
    if (have < arc.weight) return false;
  }
  return true;
}

function fire(marking: Marking, net: PetriNet, transitionId: string): Marking {
  const next: Marking = { ...marking };
  for (const arc of net.arcs) {
    if (arc.to === transitionId) {
      next[arc.from] = subCount(next[arc.from] ?? 0, arc.weight);
    }
  }
  for (const arc of net.arcs) {
    if (arc.from === transitionId) {
      next[arc.to] = addCount(next[arc.to] ?? 0, arc.weight);
    }
  }
  return next;
}

function markingKey(m: Marking, placeOrder: string[]): string {
  return placeOrder.map((p) => String(m[p] ?? 0)).join("|");
}

function isStrictlyGreater(a: Marking, b: Marking, placeOrder: string[]): boolean {
  let strict = false;
  for (const p of placeOrder) {
    const av = a[p] ?? 0;
    const bv = b[p] ?? 0;
    if (av === "omega" && bv !== "omega") {
      strict = true;
      continue;
    }
    if (av === "omega" && bv === "omega") continue;
    if (bv === "omega") return false;
    if (av === bv) continue;
    if (typeof av === "number" && typeof bv === "number") {
      if (av < bv) return false;
      if (av > bv) strict = true;
    }
  }
  return strict;
}

// Apply Karp-Miller "acceleration": if a newly-reached marking strictly dominates
// an ancestor on the same path, every dominating place becomes omega (unbounded).
function maybeAccelerate(
  marking: Marking,
  ancestors: Marking[],
  placeOrder: string[],
): Marking {
  const accelerated: Marking = { ...marking };
  for (const anc of ancestors) {
    if (isStrictlyGreater(marking, anc, placeOrder)) {
      for (const p of placeOrder) {
        const av = marking[p] ?? 0;
        const bv = anc[p] ?? 0;
        if (av === "omega") continue;
        if (bv === "omega") continue;
        if (typeof av === "number" && typeof bv === "number" && av > bv) {
          accelerated[p] = "omega";
        }
      }
    }
  }
  return accelerated;
}

export function exploreReachability(
  net: PetriNet,
  initial: Marking,
  options: { maxMarkings?: number } = {},
): ReachabilityResult {
  const max = options.maxMarkings ?? MAX_MARKINGS_DEFAULT;
  const placeOrder = net.places.map((p) => p.id).sort();
  const seen = new Map<string, Marking>();
  const enabledHistory = new Map<string, number>();
  let truncated = false;

  type StackEntry = { marking: Marking; ancestors: Marking[] };
  const stack: StackEntry[] = [{ marking: initial, ancestors: [] }];
  seen.set(markingKey(initial, placeOrder), initial);

  while (stack.length > 0) {
    if (seen.size > max) {
      truncated = true;
      break;
    }
    const { marking, ancestors } = stack.pop()!;
    for (const t of net.transitions) {
      if (!canFire(marking, net, t.id)) continue;
      enabledHistory.set(t.id, (enabledHistory.get(t.id) ?? 0) + 1);
      let next = fire(marking, net, t.id);
      next = maybeAccelerate(next, ancestors, placeOrder);
      const key = markingKey(next, placeOrder);
      if (seen.has(key)) continue;
      seen.set(key, next);
      stack.push({ marking: next, ancestors: [...ancestors, marking] });
    }
  }

  return {
    markings: [...seen.values()],
    enabledHistory,
    truncated,
  };
}
