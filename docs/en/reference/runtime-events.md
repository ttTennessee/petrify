# Runtime Events

> **Authoritative source:** `packages/shared/src/events.ts`.
> Emission sites live in `packages/server/src/runtime/scheduler.ts` and individual Adapters under `packages/server/src/adapters/`.

A `RuntimeEvent` is the single unit observed during execution. Every state change you can see in the IDE, every trace span the runtime emits, and every byte streamed over WebSocket comes through this one schema. If you are building a UI, an Adapter, a custom observer, or just trying to debug a failing run — this page is what you read.

For the conceptual lifecycle that produces these events, see [Core Concepts](../guide/concepts.md). For the node `status` values that events drive, see [Workflow Schema §5](./workflow-schema.md#5-node-status-state-machine).

---

## 1. Envelope

Every event has the same outer shape:

```ts
RuntimeEvent = {
  event_id: string              // unique per event
  run_id: string                // the execution this event belongs to
  node_id: string | null        // node id, or null for graph-level events
  type: RuntimeEventType        // see §2
  timestamp: number             // ms since epoch (integer)
  payload: Record<string, unknown>   // type-dependent, default {}
}
```

A few invariants worth internalising:

- **`node_id` is nullable.** Graph-level events (`CheckpointSaved`) carry `node_id = null`. Node-level events always carry the node's `id`, not its `ref`.
- **`payload` is type-dependent and weakly typed.** The envelope schema validates only that it is a record; each event type has its own conventional shape (§3). Adapters may add fields; consumers must tolerate unknown keys.
- **Events are append-only.** They are persisted in emission order; their `event_id` is used by the API for incremental polling (`?sinceId=…`).

---

## 2. Event Types

The full enum, in the order it appears in `events.ts`:

| Type | Emitter | `node_id` | Lifecycle phase |
|---|---|---|---|
| `NodeStarted` | Adapter | node | inside a node invocation |
| `ToolCalled` | Adapter | node | inside a node invocation |
| `OutputGenerated` | Adapter | node | inside a node invocation |
| `RetryTriggered` | Scheduler | node | between retry attempts |
| `DependencyResolved` | *(reserved — not yet emitted)* | node | scheduling |
| `ResourceAcquired` | Scheduler | node | scheduling |
| `ResourceReleased` | Scheduler | node | scheduling |
| `CheckpointSaved` | Scheduler | **null** | scheduling |
| `BreakpointHit` | Scheduler | node | debugger |
| `CompensationTriggered` | Scheduler | node | failure handling |
| `NodeCompleted` | Adapter | node | end of node |
| `NodeFailed` | Adapter / Scheduler | node | end of node |
| `NodeSkipped` | Scheduler | node | end of node |
| `PermissionRequested` | Adapter (interactive) | node | inside a node invocation |
| `PermissionResolved` | Adapter (interactive) | node | inside a node invocation |

The "Emitter" column is a soft guide, not a guarantee: `NodeFailed`, for instance, can come from an Adapter that errored, *or* from the scheduler when no Adapter is registered, *or* from a condition that failed to evaluate. Consumers should not assume a single source.

`DependencyResolved` is declared in the schema but not yet emitted by the runtime — treat it as a forward-compatible reservation. Subscribers should ignore it gracefully if it ever appears.

---

## 3. Payload Conventions by Type

The schema does not constrain payload shapes; the table below records what the bundled runtime and Adapters emit today. Custom Adapters are free to add keys, but should not rename or drop the documented ones.

### 3.1 Node lifecycle

#### `NodeStarted`
Emitted once per attempt by the Adapter when invocation begins.

```json
{ "ref": "research", "title": "Research Topic", "attempt": 1 }
```

#### `NodeCompleted`
Emitted by the Adapter on success. The `output` here is the same object captured into the run's `node_outputs` state.

```json
{ "output": { "text": "...", "stop_reason": "end_turn" } }
```

#### `NodeFailed`
Emitted on a terminal failure. The shape varies by source:

```json
// adapter not registered (scheduler)
{ "reason": "adapter \"foo\" not registered" }

// condition evaluation failed (scheduler)
{ "reason": "condition evaluation failed: <message>" }

// adapter-side failure (mock example)
{ "reason": "synthetic failure (attempt 1 of >2)", "attempt": 1 }
```

#### `NodeSkipped`
A terminal "did not run" signal.

```json
// skipped because condition guard was false
{ "reason": "condition_false", "condition": "$.variables.feature_flag" }

// skipped via on_failure.skip after retries exhausted
{ "reason": "on_failure.skip after exhausted attempts", "lastError": "..." }
```

### 3.2 Inside a node

#### `ToolCalled`
A catch-all stream of in-flight progress signals. For the mock Adapter, this looks like a single envelope per tool invocation:

```json
{ "tool": "mock_echo", "args": { "topic": "..." }, "attempt": 1 }
```

For ACP Adapters, `ToolCalled` is the streaming channel for *everything* the agent emits — text deltas, thoughts, plans, tool-call updates — distinguished by a `kind` discriminator:

```json
{ "kind": "text_delta",    "delta": "Hello" }
{ "kind": "thought_delta", "delta": "Considering options..." }
{ "kind": "plan",          "raw":   { ... } }
{ "tool_call_id": "tc_1", "kind": "edit", "label": "Edit file", "status": "pending", "raw": { ... } }
```

A forward-compatible fallback captures any future ACP `sessionUpdate` variant as `kind: "acp:<sessionUpdate>"` with the raw payload — so unknown protocol extensions still show up in the trace.

#### `OutputGenerated`
Emitted by the Adapter once the final structured output is known, just before `NodeCompleted`. The runtime extracts `payload.output` to populate downstream inputs.

```json
{ "output": { "echoed_inputs": { ... }, "generated_at": "...", "attempt": 1 } }
```

A special convention: if `output.variables_patch` is an object, the scheduler merges it into the run's `variables` scope. This is the supported way for a node to drive `condition` / `loop` expressions in downstream nodes.

#### `RetryTriggered`
Emitted by the scheduler before each retry attempt after the first.

```json
{ "attempt": 2, "delay_ms": 2000 }
```

### 3.3 Resources & scheduling

#### `ResourceAcquired` · `ResourceReleased`
Paired around a node that claimed a resource pool. One event per claim, so a node claiming two pools emits two `ResourceAcquired` events.

```json
{ "pool": "llm_quota", "amount": 1 }
```

`ResourceReleased` is **not** emitted for claims declared with `release: false` — those are held until the run terminates.

#### `DependencyResolved`
Reserved for future use; not emitted today. Intended to signal that a node's upstreams have all reached `completed` and the node is now eligible to fire.

### 3.4 Control flow & debugger

#### `CheckpointSaved`
Graph-level event — `node_id` is `null`.

```json
{ "checkpoint_id": "cp_8XaB...", "completed": 4 }
```

`completed` is a count of completed nodes captured in the checkpoint; the full blob is stored separately and can be retrieved via the checkpoint API.

#### `BreakpointHit`
Emitted before a node starts when either a user breakpoint is set on it, or the runtime is in step mode and the previous node just finished.

```json
{ "node_id": "n_outline", "workflow_id": "wf_...", "reason": "user_breakpoint" }
```

After this event the run pauses until a continue/step API call is received.

#### `CompensationTriggered`
Emitted when a node's `on_failure.strategy = "compensate"` fires.

```json
{ "reason": "compensation requested", "compensate_ref": "n_rollback" }
```

> The Adapter-driven execution of the compensation node itself produces its own normal lifecycle events under its own `node_id`. This event marks only the *handoff* into compensation.

### 3.5 Permission flow (interactive Adapters)

These two are emitted by Adapters that proxy a permission boundary — the ACP Adapter being the canonical example. They let the IDE render an approval dialog while the Adapter blocks waiting for the user.

#### `PermissionRequested`

```json
{
  "request_id": "req_...",
  "tool_call": {
    "id": "tc_1",
    "kind": "write",
    "title": "Write src/index.ts",
    "raw_input": { ... }
  },
  "options": [
    { "id": "allow_once",   "name": "Allow once",   "kind": "allow_once" },
    { "id": "allow_always", "name": "Always allow", "kind": "allow_always" },
    { "id": "deny",         "name": "Deny",         "kind": "deny" }
  ]
}
```

#### `PermissionResolved`

```json
{ "request_id": "req_...", "decision": "allow", "option_id": "allow_once" }
```

`decision` is one of `allow` / `deny` / `cancel`. `option_id` is `null` when the resolution did not match any specific option (e.g., on cancellation).

---

## 4. Ordering Guarantees

Within a single `run_id`, the runtime emits events in causally consistent order:

- For one node: `NodeStarted` → (any number of `ToolCalled` / `OutputGenerated` / `RetryTriggered` / `Permission*`) → exactly one terminal event from `{NodeCompleted, NodeFailed, NodeSkipped}`.
- `OutputGenerated` always precedes `NodeCompleted` from the same Adapter.
- `ResourceAcquired` precedes the node's `NodeStarted`; `ResourceReleased` follows its terminal event (when applicable).
- `CheckpointSaved` may interleave with any node activity — it is emitted from the scheduler tick, not from a node boundary.

No cross-node ordering is guaranteed for parallel nodes; consumers must reconcile by `(node_id, timestamp)` if they want a per-node timeline.

---

## 5. Subscribing to Events

Two transports are exposed:

- **WebSocket** — push stream for live UIs. Filter by `run_id`.
- **HTTP polling** — `GET /runs/:run_id/events?sinceId=<event_id>` for catch-up and tools that prefer pull.

Both serve the same canonical envelope. The exact paths and message framing are documented in the HTTP/WS API reference (TBD). For most consumers, the recommended pattern is:

1. Open a WebSocket subscription as soon as the run starts.
2. On reconnect, replay missed events via the HTTP polling endpoint using the last `event_id` you processed.

---

## 6. Persistence & Replay

Events are stored in the run record and survive process restarts. This is what makes [Time Travel](../guide/concepts.md#execute--run-with-observability-built-in) possible: replaying the event stream up to a chosen `event_id` reconstructs the run's observable state at that moment.

The `CheckpointBlob` is a separate persistence path (see [Runtime Context](./runtime-context.md)) that captures *what was already done* — completed nodes, node outputs, variables — so a resume can skip them rather than replay every event.

---

## 7. Out of Scope (pointers)

- The `CheckpointBlob` schema and Variables/Artifacts/Env/Prompt Snapshot scopes → [Runtime Context](./runtime-context.md)
- What an Adapter must emit to be considered conformant → [AgentAdapter Overview](../adapters/overview.md)
- How events map to OpenTelemetry spans → `architecture/observability.md` (TBD)
- The WebSocket framing and HTTP polling cursors → `reference/http-api.md` (TBD)

---

## Appendix A — Event type index

| Type | Section | Terminal? |
|---|---|---|
| `NodeStarted` | §3.1 | no |
| `NodeCompleted` | §3.1 | yes |
| `NodeFailed` | §3.1 | yes |
| `NodeSkipped` | §3.1 | yes |
| `ToolCalled` | §3.2 | no |
| `OutputGenerated` | §3.2 | no |
| `RetryTriggered` | §3.2 | no |
| `ResourceAcquired` | §3.3 | no |
| `ResourceReleased` | §3.3 | no |
| `DependencyResolved` | §3.3 | n/a (reserved) |
| `CheckpointSaved` | §3.4 | no (graph-level) |
| `BreakpointHit` | §3.4 | no |
| `CompensationTriggered` | §3.4 | no |
| `PermissionRequested` | §3.5 | no |
| `PermissionResolved` | §3.5 | no |
