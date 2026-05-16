# Checkpoint Capability Levels

> **Authoritative sources:**
> - Level enum & parser: `packages/shared/src/adapter.ts`
> - Petrify's own checkpoint blob: `packages/shared/src/events.ts` (`CheckpointBlobSchema`)
> - Scheduler resume logic: `packages/server/src/runtime/scheduler.ts`
> - Checkpoint persistence: `packages/server/src/runtime/checkpoints.ts`

Every Adapter declares one of four checkpoint levels: `none`, `boundary-only`, `soft`, or `full`. The level is a *contract* with the scheduler about what kinds of resume the Adapter can survive. This page documents what each level means, what the runtime does for each, and how to pick one for a new Adapter.

For the surrounding interface (where `checkpoint()` and `restore()` fit in the Adapter contract), see [AgentAdapter Overview §6](./overview.md#6-checkpoint-and-restore).

---

## 1. The Two Checkpoints

Petrify maintains **two independent persistence layers** during a run. Confusing them is the most common source of resume bugs.

| Layer | Owner | Shape | Always present? |
|---|---|---|---|
| **Runtime Checkpoint** | Scheduler | `CheckpointBlob` — completed node ids, skipped node ids, node outputs, variables | **Yes** — regardless of Adapter level |
| **Adapter Checkpoint** | Adapter | Opaque `unknown` — Adapter's internal state mid-invocation | Only when the Adapter supports `soft` or `full` |

The Runtime Checkpoint is what makes "skip already-completed nodes on resume" work. It is captured by the scheduler at node boundaries and persisted to the `checkpoints` table. It works **regardless of Adapter level**.

The Adapter Checkpoint exists for the harder case: a node that was *mid-invocation* when the run stopped. The scheduler asks the Adapter for an opaque blob, stores it, and hands it back on resume so the Adapter can rebuild its internal state without restarting the call.

```
                ┌─────────────────────┐
   resume ─────▶│ CheckpointBlob      │  ← always available
                │  completed_node_ids │
                │  skipped_node_ids   │
                │  node_outputs       │
                │  variables          │
                │  adapter_blobs?     │  ← only when level is soft/full
                └─────────────────────┘
```

---

## 2. The Four Levels

### 2.1 `none`

The Adapter cannot survive resume at all. On any restart, the invocation has to start over.

- `manifest().capabilities` has no `checkpoint:*` token, **or** has `checkpoint:none`.
- `checkpoint()` should return `null` (or throw).
- `restore()` will not be called; it may throw.

**Use this when:** the Adapter wraps an operation that is cheap to redo, stateless, or for which intermediate state is impossible to capture (e.g., a quick HTTP call, a deterministic computation).

### 2.2 `boundary-only`

The Adapter has no mid-invocation state. Once `NodeCompleted` is emitted, the work is done and persisted in the Runtime Checkpoint; mid-invocation, nothing useful can be saved.

- `manifest().capabilities` includes `checkpoint:boundary-only`.
- `checkpoint()` returns `null` (or a trivial marker).
- `restore()` will not be called; it may throw.
- The mock Adapter is the canonical example.

**Difference from `none`:** purely declarative. Both end up with the same scheduler behaviour today. The distinction tells operators "this Adapter is well-behaved at node boundaries" — useful for catalog filtering and future planning.

### 2.3 `soft`

The Adapter exposes coarse-grained internal boundaries (between tool calls, between message turns) and can serialise enough state to resume from one of those boundaries instead of restarting.

- `manifest().capabilities` includes `checkpoint:soft`.
- `checkpoint(invocationId)` returns an opaque blob — the Adapter knows what to put in it.
- `restore(blob)` rebuilds the invocation state and returns a new `invocationId`.
- The ACP Adapter is the reference implementation; its blob is an `AcpCheckpointBlob` capturing session state and per-node persistence (see `packages/server/src/adapters/acp/checkpoint.ts`).

**Use this when:** invocations are long-lived (multi-turn conversations, multi-tool sessions) and re-running from scratch would be expensive or non-deterministic.

### 2.4 `full`

The Adapter can resume at arbitrary granularity — in principle, from any instruction. This is what "true" resume looks like.

- `manifest().capabilities` includes `checkpoint:full`.
- `checkpoint()` and `restore()` work as in `soft`, but with finer granularity.

**Use this when:** the underlying executor truly supports it (e.g., a deterministic VM with snapshotting). Today no bundled Adapter declares `full`; the level is reserved for future Adapters.

---

## 3. What the Scheduler Does Today

Honest implementation status, so you know what your declared level actually buys.

| Level | Skip completed nodes on resume? | Call `adapter.restore()` to resume a mid-invocation node? |
|---|---|---|
| `none` | **Yes** (via Runtime Checkpoint) | No |
| `boundary-only` | **Yes** (via Runtime Checkpoint) | No |
| `soft` | **Yes** (via Runtime Checkpoint) | Not yet wired through the scheduler |
| `full` | **Yes** (via Runtime Checkpoint) | Not yet wired through the scheduler |

The `CheckpointBlob` schema includes an `adapter_blobs?: Record<string, unknown>` field (`packages/shared/src/events.ts`) reserved for storing Adapter blobs keyed by node id. The scheduler does not yet populate or consume it. Adapters declaring `soft` or `full` are not penalised today — but the level is currently advisory rather than load-bearing.

> **What this means for Adapter authors:** declare the level you can actually honour. When the scheduler wires in `restore()` calls, your Adapter will Just Work; declaring `soft` today already signals intent in the catalog and surfaces the right UX to users.

> **What this means for users:** every run can already resume past completed nodes, regardless of which Adapter ran them. A failed mid-invocation node will, today, restart on resume — even if its Adapter is `soft`.

---

## 4. How to Choose a Level

Walk down the list, stop at the first match:

1. **Does the Adapter run a deterministic, stateless operation that's cheap to redo?** → `none`.
2. **Is the Adapter session-less — every invocation is a single round-trip, and there's nothing to save mid-call?** → `boundary-only`.
3. **Does the underlying executor maintain a session across multiple internal events (a conversation, a long tool sequence)?** → `soft`, if you can serialise enough to resume; otherwise `boundary-only`.
4. **Is the executor a deterministic VM, sandbox, or otherwise true-resumable system?** → `full`.

Do not overclaim. Declaring `soft` and returning `null` from `checkpoint()` is worse than declaring `boundary-only` — when the scheduler eventually wires in restore, the broken Adapter will start failing in confusing ways.

---

## 5. Authoring Guide per Level

### 5.1 `none` / `boundary-only`

```ts
async checkpoint(_invocationId: string): Promise<unknown> {
  return null;
}

async restore(_blob: unknown): Promise<string> {
  throw new Error("adapter is boundary-only; no mid-invocation restore");
}
```

The mock Adapter (`packages/server/src/adapters/mock.ts`) is a 100-line worked example.

### 5.2 `soft`

A `soft` Adapter needs to decide what its boundaries are. The ACP Adapter's choice: between message turns, the session state plus any pending tool-call manifest. Recipe:

1. **Identify the boundary points** in your protocol where state is consistent and small enough to serialise. Between tool calls is a good default.
2. **Define an Adapter-specific blob type.** Keep it small. Anything reconstructible from the workflow (`node`, `inputs`) does not need to be in the blob.
3. **Implement `checkpoint()`** to capture the most recent boundary-consistent state. If the invocation is between boundaries, return the last known good state (the scheduler will replay from there).
4. **Implement `restore(blob)`** to spin up a new invocation that picks up at the captured boundary. Return a fresh `invocationId`.
5. **Validate the blob shape** with `zod` at the `restore` boundary. Adapters are responsible for rejecting malformed blobs with a clear error.

### 5.3 `full`

Same shape as `soft`, but the granularity claim is much stronger. In practice this requires either a snapshotting runtime or a deterministic replay log. Document carefully what "any point" actually means.

---

## 6. The `CheckpointBlob` Schema

For completeness, the Runtime Checkpoint blob persisted by the scheduler:

```ts
CheckpointBlob = {
  run_id: string
  saved_at: number                     // ms since epoch
  completed_node_ids: string[]         // node ids, not refs
  skipped_node_ids:   string[]
  node_outputs: Record<string, unknown>     // nodeId → last OutputGenerated payload
  variables:    Record<string, unknown>
  adapter_blobs?: Record<string, unknown>   // reserved — see §3
}
```

This is what `CheckpointSaved` events reference by id. The actual blob is stored in the `checkpoints` table and retrieved via the checkpoint API. Detailed scope semantics (Variables vs. Artifacts vs. Env vs. Prompt Snapshot) are in [Runtime Context](../reference/runtime-context.md).

---

## 7. Out of Scope (pointers)

- The Adapter interface as a whole → [AgentAdapter Overview](./overview.md)
- The `CheckpointSaved` runtime event → [Runtime Events §3.4](../reference/runtime-events.md#34-control-flow--debugger)
- The four Runtime Context scopes (Variables / Artifacts / Env / Prompt Snapshot) → [Runtime Context](../reference/runtime-context.md)
- The checkpoint REST API → `reference/http-api.md` (TBD)

---

## Appendix A — Level matrix

| Level | Declares mid-invocation resume? | `checkpoint()` payload | `restore()` called by scheduler today? |
|---|---|---|---|
| `none` | no | `null` | no |
| `boundary-only` | no (declarative only) | `null` or trivial | no |
| `soft` | yes (coarse) | Adapter-defined blob | not yet |
| `full` | yes (fine-grained) | Adapter-defined blob | not yet |
