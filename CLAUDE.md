# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repo currently contains **only `prd.md`** — no source code, build system, or tests exist yet. Any implementation work starts from scratch against the PRD. Read `prd.md` before proposing structure or code; it is the single source of truth for product scope, data shapes, and milestone ordering.

## Product: Petrify

**Verifiable Agent Workflow Runtime.** Sits between user intent and heterogeneous Agent executors, using a Petri-net formal model to make AI workflows provably correct (not just runnable). Four product surfaces share one runtime:

1. **AI Workflow Compiler** — NL/JSON intent → Task IR → Workflow Graph (Places/Transitions/Arcs) → Verified Runtime Plan
2. **Verifiable Workflow Engine** — static (deadlock/liveness/reachability/boundedness/termination) + Dry Run
3. **Agent Runtime** — scheduling, retry, Checkpoint, Resume, Time Travel, event streaming
4. **Workflow IDE** — React Flow editor; Petri-net substructure surfaced as node metadata, never as a raw PN diagram (avoid cognitive load)

Lifecycle is fixed: **Plan → Verify → Execute.** Unverified workflows do not enter Execute except via explicit override.

## Architectural Invariants (do not violate without updating the PRD)

- **Import-first, not LLM-coupled.** Petrify does *not* embed model inference. Blueprints arrive as JSON (pasted, imported, or produced by an external LLM via a Prompt Template). The only way an LLM enters the runtime is through an Adapter.
- **AgentAdapter is the only execution boundary.** ACP, `claude-code-cli`, `openai-tools`, `mock-adapter` are all peers — ACP is one Adapter, not a privileged protocol. The Adapter interface is: `manifest / invoke (AsyncIterable<RuntimeEvent>) / cancel / checkpoint / restore`.
- **Checkpoint capability is declared, not assumed.** Adapters self-report one of `none | boundary-only | soft | full`. Petrify's own Runtime Checkpoint must work even at `none` — fall back to whole-graph rerun; at `boundary-only`, resume from failed node boundary. Never write resume logic that silently requires `soft`/`full`.
- **Workflow model is DAG + Petri-net extensions, not pure DAG.** Nodes = Transitions; variable/artifact slots = Places; resources/quotas/locks = Tokens; edges are tagged `control | data | resource`. Guards express XOR-split, AND-join Transitions express concurrent sync, loops require declared exit conditions. The PN extensions are what give verification real semantic content — don't simplify back to a plain DAG.
- **Runtime Context has four scopes with distinct lifecycles** (see PRD §4.5). Variables/Memory persist via Checkpoint; Artifacts are immutable and live in the Artifact Store; Env is runtime-injected and never persisted; Prompt Snapshots are per-node-execution trace entries. Secrets resolved from Env **must never enter** Prompt Snapshots or Artifacts.
- **Failure semantics are explicit.** Node level: `retry / skip / abort / compensate(on_failure)`. Graph level: `fail-fast / partial-continue / branch-isolation`. Compensation is Saga-style. Recovery/Time Travel assume this model — don't add ad-hoc failure handling that bypasses it.
- **Observability defaults to OpenTelemetry-compatible Traces** (targets: Langfuse / Tempo / Jaeger). Don't invent a private trace format.

## Canonical Data Shapes

PRD §6 fixes the wire formats. When implementing, treat these as authoritative:

- `Workflow Node` (§6.3) — includes `adapter`, `dependencies`, `inputs/outputs`, `condition`, `loop`, `resources[]`, `runtime`, `prompt`, `schema`, `on_failure`, `status`
- `Workflow Edge` (§6.4) — three `kind`s: `control | data | resource` (resource edges target `pool:<name>`)
- `Runtime Event` (§6.5) — enum: `NodeStarted | ToolCalled | OutputGenerated | RetryTriggered | DependencyResolved | ResourceAcquired | ResourceReleased | CheckpointSaved | BreakpointHit | CompensationTriggered | NodeCompleted | NodeFailed | NodeSkipped`
- `Node status` state machine: `idle → pending → running → {completed|failed|blocked|skipped|compensating}`
- `Adapter Manifest` (§6.6) — `capabilities` includes a `checkpoint:<level>` token

Validate everything with **zod** at the boundary (per §8.2 stack).

## Tech Stack (MVP — PRD §8)

- **Frontend:** React 19 · React Flow (graph) · Zustand · Tailwind · TanStack Query
- **Backend:** Node.js 20 · Express · zod · better-sqlite3 · nanoid · `ws` (realtime) · OpenTelemetry SDK
- **Petri-net solver:** in-house (boundedness algorithm) for MVP; pluggable later (LoLA / TAPAAL)
- Extension targets (post-MVP): Rust/Go/JVM runtime; Redis/BullMQ/NATS for distribution

## Milestones (each is independently shippable — PRD §10)

- **M1** — End-to-end minimal loop: import + edit + sequential execution. Node Schema is **complete**, but only `dependencies/inputs/outputs` are consumed; `condition/loop/resources` are declared-only (not interpreted yet).
- **M2** — Runtime Engine + Checkpoint + Resume (starts at `boundary-only`).
- **M3** — Petri-net verification + Dry Run; activate `condition/loop/resources` semantics.
- **M4** — Time Travel + debugger + breakpoints.
- **M5** — Adapter ecosystem + template marketplace.

When proposing work, locate it on this ladder. Don't pull M3+ semantics into M1 — the staging is deliberate.

## Non-goals (PRD §2.6 — refuse scope creep into these)

No model training/fine-tuning. No built-in RAG/vector store. No Agent SDK (don't compete with LangGraph/AutoGen on "how to write an Agent"). No built-in LLM inference. No multi-user collaboration in MVP. No managed cloud — self-host first.

## Frontend UI conventions (`packages/web`)

- **Use components from `src/components/ui/` for any form control, button, dialog, or popover** (shadcn/ui style — Radix primitives + Tailwind, source lives in-repo). Do not write new `<button>` / `<input>` / `<select>` / `<textarea>` / hand-rolled modal markup with raw Tailwind classes.
- The shadcn theme is driven by CSS variables in `src/index.css` (`--primary`, `--muted`, `--destructive`, etc.) and the matching `tailwind.config.ts` color tokens. Use semantic classes (`bg-primary`, `text-muted-foreground`, `border-input`, `text-destructive`) instead of raw `slate-*` / `rose-*` / `gray-*` for new code.
- `cn()` from `src/lib/utils.ts` is the standard `clsx` + `tailwind-merge` helper — use it for any conditional class composition.
- If a needed primitive isn't in `ui/` yet, add it (copy from shadcn/ui canonical source) rather than building a one-off. Keep `ui/` components minimal and unopinionated; project-specific composition belongs in sibling components.
- When touching legacy files that still use raw Tailwind controls, opportunistically migrate them — no big-bang rewrite, but don't add new debt.
