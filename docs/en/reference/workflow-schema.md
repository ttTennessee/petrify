# Workflow Schema: Node, Edge, Status

> **Authoritative source:** `packages/shared/src/workflow.ts`.
> If this document disagrees with the code, the code wins — please open an issue.

This page is the wire-format reference for the JSON Blueprint exchanged between the IDE, the server, Adapters, and import/export tooling. Every consumer validates against the same `zod` schemas; if a field is not listed here, it does not exist.

For the conceptual model behind this schema (why it is DAG + Petri-net extensions rather than a plain DAG), see [Core Concepts](../guide/concepts.md).

---

## 1. Orientation

### Who this is for

- Adapter authors deciding what fields their Adapter must respect.
- Frontend / tooling developers parsing or producing Blueprints.
- Anyone hand-editing a workflow JSON.

### Field status conventions

Petrify's node schema is complete, but not every field is interpreted by the runtime yet. Each field below is annotated:

| Tag | Meaning |
|---|---|
| *(no tag)* | **Active.** Read and acted on by the runtime today. |
| `Declared, not yet enforced` | The schema accepts and persists the field; the runtime currently ignores it. Set it and your workflow will validate, but it will not change behaviour until the corresponding runtime support ships. |

### The shortest valid graph

```json
{
  "nodes": [
    {
      "id": "n_hello",
      "ref": "hello",
      "title": "Say Hello",
      "adapter": { "name": "mock" }
    }
  ]
}
```

That is enough to compile, verify, and execute. Everything else fills in detail.

### Not covered here

This page deliberately stops at the wire format. For neighbouring topics:

- Runtime event payloads → [Runtime Events](./runtime-events.md)
- Variables / Artifacts / Env / Prompt Snapshot → [Runtime Context](./runtime-context.md)
- Adapter `capabilities` and checkpoint levels → [AgentAdapter Overview](../adapters/overview.md)
- Formal motivation for the three edge kinds → [Petri-net Model](../architecture/petri-net-model.md)

---

## 2. WorkflowGraph (top-level envelope)

```ts
WorkflowGraph = {
  nodes: WorkflowNode[]   // at least one
  edges: WorkflowEdge[]   // default []
  runtime_policy?: { pools?: Record<string, { capacity: int>0 }> }
}
```

| Field | Required | Notes |
|---|---|---|
| `nodes` | yes | At least one node. Order is not significant; identity is by `id` and `ref`. |
| `edges` | no | Three kinds — see §4. Edges and `node.dependencies` may both express the same control relation; pick one. |
| `runtime_policy.pools` | no | Graph-level declaration of resource pools and their capacities. Every pool claimed by any node must be declared here, or compilation fails. |

The Blueprint does **not** carry the workflow's `id`, `name`, or `version` — those belong to the storage record that wraps the graph, not to the wire format. A graph is identifiable by the `ref` values of its nodes, which are stable across edits.

---

## 3. Node

```ts
WorkflowNode = {
  id: string
  ref: string                            // min length 1, unique within graph
  title: string
  adapter: { name: string, version?: string }
  dependencies: string[]                 // refs of upstream nodes, default []
  inputs: Record<string, unknown>        // default {}
  outputs: Record<string, string>        // default {}
  condition?: string | null              // Declared, not yet enforced
  loop?: { max_iterations: int>0, exit_condition: string } | null
                                         // Declared, not yet enforced
  resources: ResourceClaim[]             // Declared, not yet enforced; default []
  runtime: { timeout?: int, retries?: int, checkpoint?: bool }
  prompt?: { system_prompt?: string, task_prompt: string }
  schema?: { input?: object, output?: object }
  on_failure: { strategy: "retry"|"skip"|"abort"|"compensate",
                max_attempts?: int, backoff_ms?: int, compensate_ref?: string }
  status: NodeStatus                     // default "idle"; runtime-managed
}
```

### 3.1 Identity: `id`, `ref`, `title`

| Field | Notes |
|---|---|
| `id` | Unique within the graph. Used by edges (`from` / `to`) and as the runtime key. |
| `ref` | Stable identity across edits, unique within the graph (min length 1). **`dependencies` references other nodes by `ref`, not by `id`** — this is the most-missed detail in the schema. |
| `title` | Human-readable label surfaced in the IDE. Not used for resolution. |

The split exists because `id` is convenient for tools (often a `nanoid`) while `ref` is convenient for humans (slug-like, survives renaming an underlying record).

### 3.2 Adapter binding

```json
"adapter": { "name": "acp", "version": "0.2.0" }
```

`name` is required and must match a registered Adapter; an unknown adapter name fails compilation. `version` is optional — when omitted the registry returns its default registration. See [AgentAdapter Overview](../adapters/overview.md) for resolution rules.

### 3.3 Wiring: `dependencies`, `inputs`, `outputs`

| Field | Type | Notes |
|---|---|---|
| `dependencies` | `string[]` of refs | Control-flow upstreams. Equivalent in effect to incoming `control` edges (§4.1) — choose one form, not both. |
| `inputs` | `Record<string, unknown>` | Place slots. Values are either literals or JSONPath-style references such as `"$.outputs.notes"` pointing at an upstream node's output. |
| `outputs` | `Record<string, string>` | Map from output name to a Place identifier. Artifact-style identifiers like `"artifact://draft.md"` are conventional; the schema only requires strings. |

**Important.** `dependencies` is the only place where node references use `ref`. Everywhere else (`edges.from`, `edges.to`, runtime APIs) uses `id`. Mixing them is the most common authoring error.

### 3.4 Control-flow extensions

| Field | Status | Notes |
|---|---|---|
| `condition` | `Declared, not yet enforced` | XOR-split guard expression. When evaluated false, the node and its downstream branch will be skipped. |
| `loop` | `Declared, not yet enforced` | `{ max_iterations, exit_condition }`. `exit_condition` is **mandatory** — a loop without a declared exit is a schema error, not a runtime concern. |

These fields are validated and persisted today. The scheduler currently ignores them. Setting them will not break anything; it simply will not yet change runtime behaviour.

### 3.5 Resources

```json
"resources": [
  { "name": "llm_quota", "amount": 1, "release": true }
]
```

- `name` — must match a pool declared in `runtime_policy.pools`. **This is checked at compile time** even though the scheduler does not yet enforce the claim.
- `amount` — positive integer, default `1`.
- `release` — when `true` (default), the node releases the resource on completion. When `false`, the node holds the resource for the remainder of the run. This is the right knob for "lock-style" resources that should not be reclaimed.

Status: `Declared, not yet enforced` at the scheduler level (pool declaration is enforced; quota arithmetic is not).

### 3.6 Per-node runtime policy

```json
"runtime": { "timeout": 180, "retries": 1, "checkpoint": true }
```

All fields optional, with defaults:

| Field | Default | Notes |
|---|---|---|
| `timeout` | `300` (seconds) | Per-invocation timeout passed to the Adapter. |
| `retries` | `0` | Number of automatic retries on failure, independent of `on_failure.max_attempts`. |
| `checkpoint` | `true` | Whether the runtime persists state at this node's boundary. Set `false` for nodes whose output is cheap to recompute. |

### 3.7 Prompt

```json
"prompt": {
  "system_prompt": "You are a technical content researcher.",
  "task_prompt": "Gather 5-8 key arguments around the topic."
}
```

`task_prompt` is required; `system_prompt` is optional. The prompt is passed verbatim to the Adapter; it is the Adapter's responsibility to map it onto the underlying model's message structure.

### 3.8 Schema hints

```json
"schema": {
  "input":  { "topic": "string" },
  "output": { "notes": "string" }
}
```

Free-form input/output descriptors intended for downstream validation and for tooling that wants to generate forms. Not currently strict-validated by the runtime.

### 3.9 Failure policy

```json
"on_failure": {
  "strategy": "retry",
  "max_attempts": 3,
  "backoff_ms": 2000,
  "compensate_ref": "n_rollback"
}
```

| Field | Notes |
|---|---|
| `strategy` | One of `retry` / `skip` / `abort` / `compensate`. Default `abort`. |
| `max_attempts` | Used when `strategy = "retry"`. |
| `backoff_ms` | Used when `strategy = "retry"`. |
| `compensate_ref` | Required when `strategy = "compensate"`; refers to the node `ref` that runs the compensating transaction. |

See [Core Concepts §5](../guide/concepts.md#5-failure-semantics-are-explicit) for how node-level and graph-level failure policies compose.

### 3.10 `status`

Runtime-managed. Authors should leave this absent or set to the default `"idle"`. Any value written by the IDE or import path is overwritten on first execution. See §5.

---

## 4. Edge

`WorkflowEdge` is a discriminated union on `kind`. The three kinds carry different semantics and different fields; do not treat them as variants of a single concept.

> **Do not mix kinds.** A `data` edge does *not* imply control ordering, and a `control` edge does *not* imply data flow. If a node both depends on an upstream's completion *and* consumes its output, you need both edges (see §6 examples).

### 4.1 `control` edge

```json
{ "from": "n_research", "to": "n_outline", "kind": "control" }
```

Pure firing order: `to` may not start before `from` reaches `completed`. Equivalent in effect to listing the upstream node's `ref` in `to.dependencies`. **Pick one form** — declaring both is redundant and noisy.

### 4.2 `data` edge

```json
{ "from": "n_research", "to": "n_outline", "kind": "data",
  "binding": "$.outputs.notes" }
```

A value flows from `from`'s output Place into `to`'s input slot. `binding` is a JSONPath-style expression naming the source slot on `from`. The runtime resolves the value at the moment `to` is dispatched.

A `data` edge does **not** by itself enforce ordering. If `to` should wait for `from`, also add a `control` edge or a `dependencies` entry.

### 4.3 `resource` edge

```json
{ "from": "n_draft", "to": "pool:llm_quota", "kind": "resource", "amount": 1 }
```

`to` must have the form `pool:<name>`, where `<name>` is declared in `runtime_policy.pools`. `amount` is a positive integer (default `1`). Status: `Declared, not yet enforced` at the scheduler level.

In practice, today, resource claims are more commonly expressed via the `node.resources` array (§3.5). The resource-edge form is reserved for use cases that want to encode pool topology on the graph explicitly.

---

## 5. Node Status state machine

```
              ┌─────────────────────────────────────┐
              │                                     │
              ▼                                     │
   idle → pending → running ─┬→ completed           │
                             │                      │
                             ├→ failed ─────────────┘  (retry → pending)
                             ├→ blocked
                             ├→ skipped               (terminal)
                             └→ compensating → completed | failed
```

| State | Entry condition | Emitting event | Terminal? |
|---|---|---|---|
| `idle` | Initial state; never executed in this run. | — | no |
| `pending` | All upstream dependencies resolved, awaiting dispatch. | `DependencyResolved` | no |
| `running` | Adapter invocation in progress. | `NodeStarted` | no |
| `completed` | Adapter returned success and outputs validated. | `NodeCompleted` | yes (this run) |
| `failed` | Adapter errored or timed out, and retry budget exhausted (or `on_failure.strategy != retry`). | `NodeFailed` | yes, unless retry returns it to `pending` |
| `blocked` | A precondition or resource is unavailable. May leave back to `pending` when the condition clears. | (no dedicated event; tracked via `ResourceAcquired/Released`) | no |
| `skipped` | `condition` evaluated false, or graph-level policy isolated the branch. | `NodeSkipped` | yes |
| `compensating` | A `compensate` strategy is running the compensation transaction. | `CompensationTriggered` | transitions to `completed` or `failed` |

Authors never write `status` directly. Tools that display node state should read it from runtime events, not from the Blueprint.

---

## 6. Worked Examples

These examples are derived from the bundled templates under `examples/`. They are paste-runnable through the Import API.

### 6.1 Minimal sequential — two nodes, one edge

```json
{
  "nodes": [
    {
      "id": "n_a", "ref": "a", "title": "Step A",
      "adapter": { "name": "mock" }
    },
    {
      "id": "n_b", "ref": "b", "title": "Step B",
      "adapter": { "name": "mock" },
      "dependencies": ["a"]
    }
  ]
}
```

No explicit edges — the dependency relation alone is enough.

### 6.2 Parallel + AND-join (with data flow)

```json
{
  "nodes": [
    { "id": "n_research", "ref": "research", "title": "Research",
      "adapter": { "name": "mock" },
      "outputs": { "notes": "artifact://notes.md" } },
    { "id": "n_lint", "ref": "lint", "title": "Lint Sources",
      "adapter": { "name": "mock" },
      "outputs": { "report": "artifact://lint.json" } },
    { "id": "n_outline", "ref": "outline", "title": "Outline",
      "adapter": { "name": "mock" },
      "dependencies": ["research", "lint"],
      "inputs": {
        "notes_ref":  "$.outputs.notes",
        "lint_ref":   "$.outputs.report"
      } }
  ],
  "edges": [
    { "from": "n_research", "to": "n_outline", "kind": "data",
      "binding": "$.outputs.notes" },
    { "from": "n_lint",     "to": "n_outline", "kind": "data",
      "binding": "$.outputs.report" }
  ]
}
```

`outline` will not run until both `research` and `lint` complete (AND-join). Data edges carry the actual values; the AND-join itself is expressed via `dependencies`.

### 6.3 Compensation on failure

```json
{
  "nodes": [
    { "id": "n_charge", "ref": "charge", "title": "Charge Card",
      "adapter": { "name": "mock" },
      "on_failure": {
        "strategy": "compensate",
        "compensate_ref": "refund"
      } },
    { "id": "n_refund", "ref": "refund", "title": "Refund Card",
      "adapter": { "name": "mock" } }
  ]
}
```

If `charge` fails, the runtime invokes the `refund` node as a Saga-style compensation rather than aborting the graph.

> The conditional-branch (`condition`) and loop (`loop`) examples are deferred until those fields are enforced at the runtime level. Authoring them today validates, but does not change execution.

---

## 7. Validation & Common Errors

Validation runs in two stages and both produce structured errors.

**Stage 1 — `zod` schema parse.** Returns `error.issues[]`, each with `path` and `message`. Exposed on the API as:

```json
{ "error": "Workflow graph failed schema validation",
  "issues": ["nodes.0.adapter.name: Required",
             "edges.2.binding: Required"] }
```

**Stage 2 — compile.** Returns a single `message` plus an `issues[]` array for follow-up. The most common failures:

| Error | Cause | Fix |
|---|---|---|
| `duplicate node id: <id>` | Two nodes share an `id`. | Rename one. |
| `duplicate node ref: <ref>` | Two nodes share a `ref`. | Rename one. |
| `node "<ref>" references unregistered adapter "<name>"` | `adapter.name` is not in the registry. | Register the adapter, or change the name. |
| `node "<ref>" depends on unknown ref "<ref>"` | `dependencies` points at a non-existent node. Most often: someone used an `id` instead of a `ref`. | Use the upstream node's `ref`. |
| `edge references unknown node: <id> -> <id>` | `edges.from` or `edges.to` is not a node `id`. | Check the `id` vs. `ref` confusion. |
| `workflow contains a cycle (control-edge DAG violation)` | A cycle exists in the control flow. | Either break the cycle, or once loops are enforced, declare a `loop` with an `exit_condition`. |
| `pool(s) "<name>" are claimed by nodes but not declared in runtime_policy.pools` | A `resources[].name` does not appear in `runtime_policy.pools`. | Declare the pool with a capacity. |

Schema-level violations of `condition` / `loop` / `resources` are reported even though those fields are not yet runtime-enforced — they fail at parse time, not at execution.

---

## 8. Versioning & Compatibility

The Blueprint format itself is unversioned at the graph level today. Identity is by node `ref`, which is intended to survive renames of the surrounding storage record.

Compatibility policy:

- **Additive** changes (new optional fields with defaults) are non-breaking and may appear in any release.
- **Breaking** changes (renaming, removing, or changing the type of a field) will be called out in the changelog and given a deprecation window. The Blueprint will, at that point, gain a graph-level `version` field.
- The `Adapter Manifest` and `RuntimeEvent` enum evolve under separate versioning — see their respective references.

---

## Appendix A — Field index

| Field | Section |
|---|---|
| `nodes` | §2 |
| `edges` | §2, §4 |
| `runtime_policy.pools` | §2 |
| `node.id` / `node.ref` / `node.title` | §3.1 |
| `node.adapter.name` / `node.adapter.version` | §3.2 |
| `node.dependencies` | §3.3 |
| `node.inputs` / `node.outputs` | §3.3 |
| `node.condition` | §3.4 |
| `node.loop.max_iterations` / `node.loop.exit_condition` | §3.4 |
| `node.resources[].name` / `.amount` / `.release` | §3.5 |
| `node.runtime.timeout` / `.retries` / `.checkpoint` | §3.6 |
| `node.prompt.system_prompt` / `.task_prompt` | §3.7 |
| `node.schema.input` / `.output` | §3.8 |
| `node.on_failure.strategy` / `.max_attempts` / `.backoff_ms` / `.compensate_ref` | §3.9 |
| `node.status` | §3.10, §5 |
| `edge.kind` (`control` / `data` / `resource`) | §4 |
| `edge.binding` | §4.2 |
| `edge.amount` | §4.3 |
