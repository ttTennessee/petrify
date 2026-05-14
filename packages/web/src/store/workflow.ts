import { create } from "zustand";
import type { NodeStatus, RuntimeEvent, WorkflowGraph } from "@petrify/shared";

interface WorkflowState {
  graph: WorkflowGraph | null;
  setGraph: (g: WorkflowGraph | null) => void;
  nodeStatus: Record<string, NodeStatus>;
  events: RuntimeEvent[]; // displayed slice (== allEvents when live)
  allEvents: RuntimeEvent[]; // full source of truth, never sliced
  currentRunId: string | null;
  setCurrentRunId: (id: string | null) => void;
  ingestEvent: (ev: RuntimeEvent) => void;
  replayEvents: (events: RuntimeEvent[], seedStatus?: Record<string, NodeStatus>) => void;
  // ---- M4: time-travel scrubber ----
  scrubMode: "live" | "paused";
  scrubCursor: number; // index into allEvents (0..allEvents.length)
  seedStatus: Record<string, NodeStatus>;
  setScrubCursor: (cursor: number) => void;
  exitScrubMode: () => void; // jump back to live (cursor = allEvents.length)
  pausedAtBreakpoint: () => string[]; // node ids paused at a not-yet-resolved breakpoint
  resetRun: () => void;
}

const eventToStatus: Partial<Record<RuntimeEvent["type"], NodeStatus>> = {
  NodeStarted: "running",
  NodeCompleted: "completed",
  NodeFailed: "failed",
  NodeSkipped: "skipped",
};

function computeStatusFromEvents(
  events: RuntimeEvent[],
  seedStatus: Record<string, NodeStatus>,
): Record<string, NodeStatus> {
  const status: Record<string, NodeStatus> = { ...seedStatus };
  for (const ev of events) {
    const mapped = eventToStatus[ev.type];
    if (mapped && ev.node_id) status[ev.node_id] = mapped;
  }
  return status;
}

// Streaming text_delta events fire much faster than React can usefully render —
// buffer arrivals and flush once per animation frame so the user sees smooth
// growth instead of per-character relayouts.
let pending: RuntimeEvent[] = [];
let scheduled = false;

function scheduleFlush(flush: () => void) {
  if (scheduled) return;
  scheduled = true;
  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16);
  raf(() => {
    scheduled = false;
    flush();
  });
}

export const useWorkflowStore = create<WorkflowState>((set, get) => {
  const flush = () =>
    set((s) => {
      if (pending.length === 0) return s;
      const seen = new Set(s.allEvents.map((e) => e.event_id));
      const fresh: RuntimeEvent[] = [];
      for (const ev of pending) {
        if (seen.has(ev.event_id)) continue;
        seen.add(ev.event_id);
        fresh.push(ev);
      }
      pending = [];
      if (fresh.length === 0) return s;
      const allEvents = [...s.allEvents, ...fresh];
      if (s.scrubMode === "live") {
        const nextStatus = { ...s.nodeStatus };
        for (const ev of fresh) {
          const mapped = eventToStatus[ev.type];
          if (mapped && ev.node_id) nextStatus[ev.node_id] = mapped;
        }
        return {
          allEvents,
          events: allEvents,
          nodeStatus: nextStatus,
          scrubCursor: allEvents.length,
        };
      }
      // paused: keep displayed slice anchored to cursor, allEvents grows silently
      return { allEvents };
    });

  return {
    graph: null,
    setGraph: (graph) => set({ graph }),
    nodeStatus: {},
    events: [],
    allEvents: [],
    currentRunId: null,
    seedStatus: {},
    scrubMode: "live",
    scrubCursor: 0,
    setCurrentRunId: (id) => {
      pending = [];
      set({
        currentRunId: id,
        events: [],
        allEvents: [],
        nodeStatus: {},
        seedStatus: {},
        scrubMode: "live",
        scrubCursor: 0,
      });
    },
    ingestEvent: (ev) => {
      pending.push(ev);
      scheduleFlush(flush);
    },
    replayEvents: (events, seedStatus) =>
      set((s) => {
        pending = [];
        const seed = seedStatus ?? {};
        // Merge HTTP seed with WS-ingested state, deduping by event_id and
        // re-sorting by timestamp. Without this, a re-fire of the seeding
        // effect (e.g. seedStatus reference changes when a late checkpoint
        // poll lands) would clobber trailing events that already arrived
        // via WebSocket but aren't yet in the HTTP fetch.
        const seen = new Set<string>();
        const merged: RuntimeEvent[] = [];
        for (const ev of events) {
          if (seen.has(ev.event_id)) continue;
          seen.add(ev.event_id);
          merged.push(ev);
        }
        for (const ev of s.allEvents) {
          if (seen.has(ev.event_id)) continue;
          seen.add(ev.event_id);
          merged.push(ev);
        }
        merged.sort((a, b) =>
          a.timestamp !== b.timestamp
            ? a.timestamp - b.timestamp
            : a.event_id < b.event_id
              ? -1
              : 1,
        );
        if (s.scrubMode === "paused" && s.scrubCursor < merged.length) {
          const slice = merged.slice(0, s.scrubCursor);
          return {
            allEvents: merged,
            events: slice,
            seedStatus: seed,
            nodeStatus: computeStatusFromEvents(slice, seed),
          };
        }
        return {
          allEvents: merged,
          events: merged,
          seedStatus: seed,
          nodeStatus: computeStatusFromEvents(merged, seed),
          scrubCursor: merged.length,
        };
      }),
    setScrubCursor: (cursor) =>
      set((s) => {
        const clamped = Math.max(0, Math.min(cursor, s.allEvents.length));
        const isLive = clamped >= s.allEvents.length;
        const slice = isLive ? s.allEvents : s.allEvents.slice(0, clamped);
        return {
          scrubCursor: clamped,
          scrubMode: isLive ? "live" : "paused",
          events: slice,
          nodeStatus: computeStatusFromEvents(
            slice,
            isLive ? s.seedStatus : {},
          ),
        };
      }),
    exitScrubMode: () => {
      const { allEvents, seedStatus } = get();
      set({
        scrubMode: "live",
        scrubCursor: allEvents.length,
        events: allEvents,
        nodeStatus: computeStatusFromEvents(allEvents, seedStatus),
      });
    },
    pausedAtBreakpoint: () => {
      const { allEvents } = get();
      const pausedAt = new Set<string>();
      for (const ev of allEvents) {
        if (!ev.node_id) continue;
        if (ev.type === "BreakpointHit") {
          pausedAt.add(ev.node_id);
        } else if (
          ev.type === "NodeStarted" ||
          ev.type === "NodeCompleted" ||
          ev.type === "NodeFailed" ||
          ev.type === "NodeSkipped"
        ) {
          pausedAt.delete(ev.node_id);
        }
      }
      return [...pausedAt];
    },
    resetRun: () => {
      pending = [];
      set({
        events: [],
        allEvents: [],
        nodeStatus: {},
        seedStatus: {},
        currentRunId: null,
        scrubMode: "live",
        scrubCursor: 0,
      });
    },
  };
});
