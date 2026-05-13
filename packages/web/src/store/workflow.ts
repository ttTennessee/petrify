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
  replayEvents: (events: RuntimeEvent[]) => void;
  resetRun: () => void;
}

const eventToStatus: Partial<Record<RuntimeEvent["type"], NodeStatus>> = {
  NodeStarted: "running",
  NodeCompleted: "completed",
  NodeFailed: "failed",
  NodeSkipped: "skipped",
};

export const useWorkflowStore = create<WorkflowState>((set) => ({
  graph: null,
  setGraph: (graph) => set({ graph }),
  nodeStatus: {},
  events: [],
  currentRunId: null,
  setCurrentRunId: (id) => set({ currentRunId: id, events: [], nodeStatus: {} }),
  ingestEvent: (ev) =>
    set((s) => {
      if (s.events.some((e) => e.event_id === ev.event_id)) return s; // dedupe ws/replay overlap
      const nextStatus = { ...s.nodeStatus };
      const mapped = eventToStatus[ev.type];
      if (mapped && ev.node_id) nextStatus[ev.node_id] = mapped;
      return {
        events: [...s.events, ev],
        nodeStatus: nextStatus,
      };
    }),
  replayEvents: (events) =>
    set(() => {
      const nodeStatus: Record<string, NodeStatus> = {};
      for (const ev of events) {
        const mapped = eventToStatus[ev.type];
        if (mapped && ev.node_id) nodeStatus[ev.node_id] = mapped;
      }
      return { events, nodeStatus };
    }),
  resetRun: () => set({ events: [], nodeStatus: {}, currentRunId: null }),
}));
