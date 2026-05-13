import { create } from "zustand";
import type { NodeStatus, RuntimeEvent, WorkflowGraph } from "@petrify/shared";

interface WorkflowState {
  graph: WorkflowGraph | null;
  setGraph: (g: WorkflowGraph | null) => void;
  nodeStatus: Record<string, NodeStatus>;
  events: RuntimeEvent[];
  currentRunId: string | null;
  setCurrentRunId: (id: string | null) => void;
  ingestEvent: (ev: RuntimeEvent) => void;
  replayEvents: (events: RuntimeEvent[], seedStatus?: Record<string, NodeStatus>) => void;
  resetRun: () => void;
}

const eventToStatus: Partial<Record<RuntimeEvent["type"], NodeStatus>> = {
  NodeStarted: "running",
  NodeCompleted: "completed",
  NodeFailed: "failed",
  NodeSkipped: "skipped",
};

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

export const useWorkflowStore = create<WorkflowState>((set) => {
  const flush = () =>
    set((s) => {
      if (pending.length === 0) return s;
      const seen = new Set(s.events.map((e) => e.event_id));
      const fresh: RuntimeEvent[] = [];
      const nextStatus = { ...s.nodeStatus };
      for (const ev of pending) {
        if (seen.has(ev.event_id)) continue;
        seen.add(ev.event_id);
        fresh.push(ev);
        const mapped = eventToStatus[ev.type];
        if (mapped && ev.node_id) nextStatus[ev.node_id] = mapped;
      }
      pending = [];
      if (fresh.length === 0) return s;
      return { events: [...s.events, ...fresh], nodeStatus: nextStatus };
    });

  return {
    graph: null,
    setGraph: (graph) => set({ graph }),
    nodeStatus: {},
    events: [],
    currentRunId: null,
    setCurrentRunId: (id) => {
      pending = [];
      set({ currentRunId: id, events: [], nodeStatus: {} });
    },
    ingestEvent: (ev) => {
      pending.push(ev);
      scheduleFlush(flush);
    },
    replayEvents: (events, seedStatus) =>
      set(() => {
        pending = [];
        const nodeStatus: Record<string, NodeStatus> = {};
        for (const ev of events) {
          const mapped = eventToStatus[ev.type];
          if (mapped && ev.node_id) nodeStatus[ev.node_id] = mapped;
        }
        for (const [id, status] of Object.entries(seedStatus ?? {})) {
          nodeStatus[id] = status;
        }
        return { events, nodeStatus };
      }),
    resetRun: () => {
      pending = [];
      set({ events: [], nodeStatus: {}, currentRunId: null });
    },
  };
});
