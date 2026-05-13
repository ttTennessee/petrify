// Petri-net types used by both server (compile + verify) and web (display).
// A Marking is the multiset of tokens across all places.
// We model bounded values as numbers and unbounded as the symbol "omega".

export type TokenCount = number | "omega";

export interface Place {
  id: string;
  label: string;
  initial: number;
  // origin links the place back to the workflow element it was minted from,
  // so verification reports can point at concrete edges/pools/nodes.
  origin:
    | { kind: "control_edge"; from: string; to: string }
    | { kind: "data_edge"; from: string; to: string }
    | { kind: "pool"; pool: string }
    | { kind: "node_start"; node: string }
    | { kind: "node_end"; node: string };
}

export interface Arc {
  // place -> transition (input) consumes weight tokens
  // transition -> place (output) produces weight tokens
  from: string;
  to: string;
  weight: number;
}

export interface Transition {
  id: string;
  label: string;
  // links transition back to the workflow node it represents
  origin: { kind: "node"; node: string } | { kind: "synthetic" };
}

export interface PetriNet {
  places: Place[];
  transitions: Transition[];
  // arcs are directed; one end must be a place, the other a transition.
  // We don't statically distinguish input/output arcs at this layer.
  arcs: Arc[];
}

export type Marking = Record<string, TokenCount>; // place id -> token count

export type IssueLevel = "info" | "warning" | "error";

export interface VerificationIssue {
  level: IssueLevel;
  code:
    | "deadlock"
    | "unbounded_place"
    | "unreachable_terminal"
    | "non_live_transition"
    | "resource_deadlock"
    | "non_terminating_loop";
  message: string;
  // Affected workflow element refs (node refs or pool names) so the UI can highlight them.
  affected_node_refs?: string[];
  affected_pools?: string[];
  // The Petri marking that demonstrates the issue, if applicable.
  witness_marking?: Marking;
}

export interface VerificationReport {
  status: "pass" | "warn" | "fail";
  risk: "low" | "medium" | "high" | "blocking";
  issues: VerificationIssue[];
  stats: {
    place_count: number;
    transition_count: number;
    explored_markings: number;
    truncated: boolean;
  };
  verified_at: number;
}

export interface DryRunReport {
  estimated_duration_ms: number;
  critical_path: string[]; // sequence of node refs
  resource_peaks: Record<string, number>; // pool name -> peak concurrent usage
  // Top failure-prone nodes (M3 stub: derived from on_failure.strategy and node depth).
  failure_hotspots: Array<{ node_ref: string; rationale: string }>;
  generated_at: number;
}
