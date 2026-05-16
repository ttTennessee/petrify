# AgentAdapter Overview

> **Authoritative sources:**
> - Interface: `packages/server/src/adapters/types.ts`
> - Manifest schema: `packages/shared/src/adapter.ts`
> - Reference implementations: `packages/server/src/adapters/mock.ts`, `packages/server/src/adapters/acp.ts`

An **AgentAdapter** is the only way execution capability enters the Petrify runtime. The scheduler does not know how to call Claude, how to spawn `claude-code-cli`, or how to speak ACP. It knows how to call an Adapter. Everything else — model APIs, subprocesses, protocols — lives behind that interface.

This page is for Adapter authors and for anyone reading the runtime to understand the execution boundary. For the user-facing story (what Adapters do and why), see [Core Concepts §3](../guide/concepts.md#3-the-execution-boundary-agentadapter).

---

## 1. The Interface

```ts
interface AgentAdapter {
  manifest(): AdapterManifest
  invoke(req: InvokeRequest): AsyncIterable<RuntimeEvent>
  cancel(invocationId: string): Promise<void>
  checkpoint(invocationId: string): Promise<unknown>
  restore(blob: unknown): Promise<string>     // returns a resumed invocationId
  probe?(): Promise<ProbeResult>              // optional
}
```

Five required methods, one optional. None of them are negotiable; an object that does not implement all five is not an Adapter.

> **All Adapters are peers.** The ACP Adapter is not privileged. `mock`, `acp`, `claude-code-cli`, `openai-tools`, your own — same interface, same scheduling rules. If you find scheduler code that special-cases an Adapter by name, that is a bug.

---

## 2. `InvokeRequest`

```ts
interface InvokeRequest {
  invocationId: string                  // unique per invocation
  runId: string                         // the run this invocation belongs to
  projectId: string | null              // null when the run is detached
  node: WorkflowNode                    // full schema, see workflow-schema.md
  inputs: Record<string, unknown>       // resolved input values
}
```

- `invocationId` is the handle for `cancel()` and `checkpoint()`. The Adapter must track it.
- `inputs` is the resolved view — references like `"$.outputs.notes"` from `node.inputs` have already been dereferenced by the scheduler. The Adapter sees literal values.
- `projectId` exists for Adapters that need scoped state (e.g., per-project permission grants). Adapters without that requirement can ignore it.

---

## 3. `manifest()` — the Adapter Manifest

The Manifest is the Adapter's self-description. It is read at registration time and again before each run.

```ts
AdapterManifest = {
  name: string
  version: string
  capabilities: string[]                // free-form tokens, default []
  concurrency: { max: number }          // default { max: 1 }
  resources?: { token_per_call_est?: number }
  sandbox?: {
    fs?:  "none" | "chroot" | "container"
    net?: "none" | "allowlist" | "open"
  }
}
```

### 3.1 `name`, `version`

`name` is the lookup key. A workflow's `node.adapter.name` must match this exactly. `version` is informational today; future schema changes will use it for compatibility checks.

### 3.2 `capabilities`

A free-form array of string tokens. Two tokens have runtime meaning today:

| Token | Meaning |
|---|---|
| `checkpoint:<level>` | Declares the Adapter's checkpoint capability. `<level>` ∈ `none` / `boundary-only` / `soft` / `full`. Parsed by the scheduler at run preflight. See [Checkpoint Capability Levels](./checkpoint-levels.md). |
| (others — `streaming`, `tool_use`, etc.) | Currently informational. Surfaced in the catalog; not interpreted by the scheduler. |

If no `checkpoint:*` token is present, the scheduler treats the Adapter as `none` (whole-graph rerun on resume).

```ts
// Reference: packages/shared/src/adapter.ts
parseCheckpointLevel(manifest): CheckpointLevel
```

### 3.3 `concurrency.max`

The maximum number of concurrent `invoke()` calls the scheduler will make against this Adapter, summed across all nodes that bind to it. Defaults to `1`. The `mock` Adapter uses `8`; `acp` uses `4`. Setting this conservatively is fine — the scheduler will just queue.

### 3.4 `resources.token_per_call_est`

Optional estimate of model tokens consumed per call. Used by future resource-aware scheduling and by the catalog UI. Safe to omit.

### 3.5 `sandbox`

Documents the isolation guarantees the Adapter actually provides. Today these fields are surfaced in the catalog so users can see "this Adapter has no sandbox" before binding it. They are **declarative** — the runtime does not enforce them; the Adapter must implement whatever it claims.

---

## 4. `invoke()` — the Hot Path

`invoke()` returns an `AsyncIterable<RuntimeEvent>`. The Adapter yields events as they happen; the scheduler consumes them and persists each one.

### 4.1 Required event sequence

For a successful invocation:

```
NodeStarted → (any number of ToolCalled / OutputGenerated / Permission*) → OutputGenerated → NodeCompleted
```

For a failure:

```
NodeStarted → (...) → NodeFailed
```

Minimum conformance: every invocation must yield exactly one `NodeStarted` and exactly one terminal event (`NodeCompleted` or `NodeFailed`). `OutputGenerated` is required when the invocation produced an output the runtime should capture.

The full event-type reference, including payload shapes, is in [Runtime Events](../reference/runtime-events.md). The mock Adapter (`packages/server/src/adapters/mock.ts`) is a 100-line worked example.

### 4.2 Setting `event_id`, `run_id`, `node_id`, `timestamp`

The Adapter sets all of these on every event it emits:

```ts
yield {
  event_id: nanoid(),
  run_id:   req.runId,
  node_id:  req.node.id,    // never req.node.ref
  type:     "NodeStarted",
  timestamp: Date.now(),
  payload:  { ... },
}
```

`node_id` should be `req.node.id`, never `req.node.ref`. The scheduler reconciles events to nodes by `id`.

### 4.3 Variables patch (output convention)

If the Adapter wants to write into the run's `variables` scope — for example, to drive a downstream `condition` or `loop` — it puts a `variables_patch` object inside the output:

```json
{ "output": { "...": "...", "variables_patch": { "approved": true } } }
```

The scheduler merges `variables_patch` into `state.variables` on `NodeCompleted`. See [Runtime Context](../reference/runtime-context.md) for the scope rules.

### 4.4 Streaming

The runtime persists each event the moment it is yielded. Streaming Adapters (text deltas, tool-call updates) should yield small, frequent events — the IDE reads them straight off the WebSocket and renders incrementally.

The ACP Adapter (`packages/server/src/adapters/acp/event-mapper.ts`) is the reference for streaming: text deltas, thought deltas, tool-call updates, and a forward-compatible fallback for unknown protocol variants all flow through `ToolCalled` with a `kind` discriminator.

---

## 5. `cancel()`

```ts
cancel(invocationId: string): Promise<void>
```

Called by the scheduler when a run is cancelled or a `BreakpointHit` resolves with "abort". The Adapter should:

1. Stop emitting new events for this invocation as soon as possible.
2. Yield one final `NodeFailed` with `payload.reason = "cancelled"` if the invocation had already emitted `NodeStarted`.
3. Tear down any external resources (subprocesses, sockets, etc.).

`cancel()` must be idempotent: the scheduler may call it more than once.

---

## 6. `checkpoint()` and `restore()`

```ts
checkpoint(invocationId: string): Promise<unknown>
restore(blob: unknown):           Promise<string>   // returns new invocationId
```

Semantics depend entirely on the Adapter's declared `checkpoint:<level>`:

| Level | `checkpoint()` returns | `restore()` behaviour |
|---|---|---|
| `none` | `null` (or throw) | not called — scheduler reruns the whole node |
| `boundary-only` | `null` (or trivial state) | not called — scheduler skips already-completed nodes via Petrify's own CheckpointBlob |
| `soft` | An opaque blob the Adapter can use to resume at a coarse internal boundary | Adapter rebuilds invocation state from the blob and returns a new `invocationId` |
| `full` | An opaque blob sufficient for fine-grained resume | Same as `soft`, but at finer granularity |

> Important: **Petrify's own Runtime Checkpoint must work even at `none`**. The scheduler always persists its own `CheckpointBlob` (completed nodes, outputs, variables); on resume it skips completed nodes regardless of Adapter level. Adapter checkpoint is a *bonus* that lets a partially-executed node resume instead of restarting.

See [Checkpoint Capability Levels](./checkpoint-levels.md) for the full rules.

The mock Adapter is `boundary-only` and returns `null` from `checkpoint()`; it throws from `restore()` because the scheduler will never call it. The ACP Adapter is `soft` and serialises an `AcpCheckpointBlob`. Both are valid.

---

## 7. `probe()` — Optional Connectivity Check

```ts
probe?(): Promise<ProbeResult>
```

```ts
type ProbeResult =
  | { ok: true,  protocolVersion?: number, capabilities?: unknown, durationMs: number }
  | { ok: false, error: string }
```

The scheduler calls `probe()` before a run starts. Adapters that talk to external processes (`acp`, `claude-code-cli`) should implement it to give the user fast feedback on misconfigured commands. Adapters with no external dependencies (`mock`) omit it — preflight treats omission as a pass.

A failing probe aborts the run with a clear error before any node is scheduled.

---

## 8. Registration

```ts
import { registerAdapter } from "./adapters/registry.js";
import { MyAdapter } from "./my-adapter.js";

registerAdapter("my-adapter", new MyAdapter(), {
  kind: "builtin" | "spawn" | "connect",
  source: "builtin" | "env" | "db",
});
```

| Field | Notes |
|---|---|
| `name` (first arg) | Must equal `adapter.manifest().name`. The scheduler resolves by this key. |
| `kind` | A taxonomy hint for the catalog UI: in-process (`builtin`), launches a subprocess (`spawn`), or speaks to a remote endpoint (`connect`). |
| `source` | Where the registration came from: code (`builtin`), environment variables (`env`), or database/UI (`db`). |

Registration is process-local; restarting the server re-runs registration. Persistent Adapter configurations live in the database and are re-registered on boot — see `packages/server/src/adapters/persistence.ts`.

---

## 9. Conformance Checklist

A new Adapter is ready when all of the following hold:

- [ ] `manifest()` returns a valid `AdapterManifest` (zod parses it).
- [ ] `manifest().capabilities` declares an honest `checkpoint:<level>` token.
- [ ] `invoke()` yields exactly one `NodeStarted` and exactly one terminal event.
- [ ] `invoke()` sets `event_id`, `run_id`, `node_id`, `timestamp` on every event.
- [ ] `OutputGenerated` precedes `NodeCompleted`; both carry the same `output`.
- [ ] `cancel()` is idempotent and stops event emission promptly.
- [ ] `checkpoint()` / `restore()` match the declared level (return `null` when level is `none` or `boundary-only`).
- [ ] If the Adapter talks to an external process or service, `probe()` is implemented.
- [ ] No special-case branches in scheduler code reference the Adapter by name.

---

## 10. Out of Scope (pointers)

- Per-built-in Adapter usage (ACP, mock, future ones) → `adapters/built-in/`
- Checkpoint level semantics in detail → [Checkpoint Capability Levels](./checkpoint-levels.md)
- Event payload conventions per event type → [Runtime Events](../reference/runtime-events.md)
- Permission flow for interactive Adapters (`PermissionRequested` / `PermissionResolved`) → [Runtime Events §3.5](../reference/runtime-events.md#35-permission-flow-interactive-adapters)
- Writing tests for an Adapter → `adapters/testing.md` (TBD)

---

## Appendix A — Method index

| Method | Required? | Section |
|---|---|---|
| `manifest()` | yes | §3 |
| `invoke()` | yes | §4 |
| `cancel()` | yes | §5 |
| `checkpoint()` | yes | §6 |
| `restore()` | yes | §6 |
| `probe()` | no | §7 |
