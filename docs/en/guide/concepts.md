# Core Concepts: Plan → Verify → Execute

Petrify is a **verifiable Agent workflow runtime**. It does not author Agents and it does not run model inference. It sits between user intent and heterogeneous Agent executors, using a formal model (Petri nets) to make AI workflows **provably correct** — not merely runnable.

To understand Petrify, hold on to three things: **one lifecycle, one data model, one execution boundary.**

---

## 1. The Lifecycle: Plan → Verify → Execute

Every workflow in Petrify moves through three fixed stages. **Unverified workflows do not enter Execute** — unless the user explicitly overrides.

```
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │   Plan   │ ───▶ │  Verify  │ ───▶ │ Execute  │
   └──────────┘      └──────────┘      └──────────┘
        │                 │                  │
   edit / import      static analysis    scheduling / retry
   JSON Blueprint     Dry Run            Checkpoint
                                         Time Travel
```

### Plan — turn intent into a graph

- **Inputs:** natural language, JSON, templates, or a Blueprint produced by an external LLM via a **Prompt Template**.
- **Output:** a **Workflow Graph** — nodes are Transitions, slots are Places, resources and quotas are Tokens.
- **Key point:** **Petrify itself does not perform model inference.** An LLM only enters the runtime through an Adapter. The graph is a user-space artifact: it can be pasted, imported, or hand-edited.

### Verify — answer "can this graph actually run?" before it runs

Static verification answers four classes of question:

| Property | Intuition |
|---|---|
| **Deadlock** | Is there a node that can never acquire its preconditions or resources? |
| **Liveness** | Will every node eventually get a chance to fire? |
| **Reachability** | Is the terminal state actually reachable? |
| **Boundedness** | Do tokens stay bounded — or can a resource pool grow without limit? |
| **Termination** | Does every loop declare an exit condition? |

Plus **Dry Run**: simulate the graph with mock tokens — no real Adapter calls — to preview scheduling order, resource contention, and branch selection.

### Execute — run with observability built in

Execute is not "topological sort, then call each node." The runtime provides:

- **Scheduling** — DAG plus concurrent sync (AND-join) plus conditional branching (XOR-split).
- **Retry / Skip / Abort / Compensate** — node-level failure policies; Compensation is Saga-style.
- **Checkpoint & Resume** — persist state at node boundaries; resume from the failure point instead of re-running the whole graph.
- **Time Travel & Breakpoints** — return to any historical moment, set breakpoints, step through execution.
- **Event Stream** — OpenTelemetry-compatible traces, exportable to Langfuse / Tempo / Jaeger.

---

## 2. The Data Model: DAG + Petri-net Extensions

Petrify's graph is **not a pure DAG**. This is the fundamental difference from "DAG-first" frameworks like LangGraph or AutoGen.

| Petri-net concept | Petrify mapping |
|---|---|
| **Transition** | A node (an Agent invocation, a tool call) |
| **Place** | A variable slot or artifact slot (a node's input/output) |
| **Token** | A data value, a resource quota, a lock |
| **Arc** | An edge, tagged with `kind`: `control` / `data` / `resource` |

Why not collapse back to a pure DAG? Because the following semantics require the PN extensions to be expressed precisely:

- **Resource pools** — multiple nodes share a quota; resource arcs target `pool:<name>`.
- **AND-join** — a downstream node fires only when *all* upstreams have arrived. In a plain topological view this is just a node; without Tokens you cannot define "all arrived."
- **XOR-split** — a guard expression selects which branch fires.
- **Loops with exit conditions** — loops *must* declare an exit. Verification rejects them otherwise.

These semantics are what give verification real content. Strip them and verification degenerates to "is there a cycle?" — a trivial question.

> **Do not** draw Petri nets in the UI. PN is a **metadata substructure** of nodes; the frontend shows a React-Flow-style DAG view. This is deliberate cognitive-load management.

---

## 3. The Execution Boundary: AgentAdapter

Petrify does not know how to call Claude. It does not know how to run `claude-code-cli`. It does not know what the ACP protocol looks like. **All execution capability is injected through Adapters.**

```
        Runtime Engine
              │
              ▼
       ┌─────────────┐
       │ AgentAdapter│   ← the only boundary
       └─────────────┘
        │     │     │
        ▼     ▼     ▼
       ACP   CLI   Mock     openai-tools  …
```

The Adapter interface is four things:

- `manifest` — self-description (capabilities, checkpoint level, required env, etc.)
- `invoke` — execution function returning `AsyncIterable<RuntimeEvent>`
- `cancel` — interrupt execution
- `checkpoint / restore` — persist and restore, at the level declared in the manifest

### Checkpoint is *declared*, not *assumed*

Every Adapter must declare its checkpoint capability in the manifest:

| Level | Meaning |
|---|---|
| `none` | No checkpoint support — re-run the whole graph after a crash |
| `boundary-only` | Persist only at node boundaries — resume by re-running the failed node |
| `soft` | Coarse-grained internal breakpoints (e.g., between tool calls) |
| `full` | Fully resumable — continue at any instruction |

Petrify's own Runtime Checkpoint **must work even at `none`** (falling back to whole-graph rerun). **Never write resume logic that silently requires `soft` or `full`.**

> ACP, `claude-code-cli`, `openai-tools`, and `mock` are **peer** Adapters. **ACP is not a privileged protocol.** If you see code treating ACP specially, that is a bug — not a feature.

---

## 4. Runtime Context: Four Scopes

Execution-time state is partitioned into four scopes with **distinct lifecycles**:

| Scope | Lifetime | In Checkpoint? | In Artifact Store? | In Prompt Snapshot? |
|---|---|---|---|---|
| **Variables / Memory** | Entire workflow run | ✅ | ❌ | configurable |
| **Artifacts** | Immutable, long-lived | ✅ (by reference) | ✅ | usually ❌ |
| **Env** (incl. Secrets) | Process-injected, never persisted | ❌ | ❌ | **never** ❌ |
| **Prompt Snapshot** | Single node execution, trace entry | ✅ (as trace) | ❌ | — |

**Security invariant:** secrets resolved from Env **must never** enter a Prompt Snapshot or an Artifact. This is a hard constraint, not a guideline.

---

## 5. Failure Semantics Are Explicit

Many frameworks leave "what happens when things break" to user-space `try/catch`. Petrify puts it in the model.

**Node-level policy** (declared in the Node Schema's `on_failure`):

- `retry` — retry under a backoff policy
- `skip` — skip; downstream behaves as if the upstream produced nothing
- `abort` — terminate the whole graph
- `compensate` — trigger a Saga-style compensating transaction

**Graph-level policy:**

- `fail-fast` — any node failure aborts immediately
- `partial-continue` — isolate failed branches; other branches continue
- `branch-isolation` — failure does not propagate upward, but downstream nodes in the same branch are skipped

Time Travel, Resume, and Compensation all build on these explicit semantics. **Do not bypass them with ad-hoc try/catch.**

---

## 6. Non-goals

To keep the boundary sharp, Petrify explicitly **does not do** the following. Reject scope creep into these areas.

- ❌ Model training or fine-tuning
- ❌ Built-in RAG or vector store
- ❌ An Agent SDK (we don't compete with LangGraph / AutoGen on "how to write an Agent")
- ❌ Built-in LLM inference
- ❌ Multi-user collaboration in the MVP
- ❌ A managed cloud offering — self-host first

---

## Where to Read Next

- Want to run something: [Getting Started](./getting-started.md)
- Want the precise field-level definition of nodes and edges: [Workflow Schema](../reference/workflow-schema.md)
- Want to plug in your own executor: [AgentAdapter Overview](../adapters/overview.md)
- Want the formal semantics of the PN extensions: [Petri-net Model](../architecture/petri-net-model.md)
