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
      const nextStatus = { ...s.nodeStatus };
      const mapped = eventToStatus[ev.type];
      if (mapped && ev.node_id) nextStatus[ev.node_id] = mapped;
      return {
        events: [...s.events, ev],
        nodeStatus: nextStatus,
      };
    }),
  resetRun: () => set({ events: [], nodeStatus: {}, currentRunId: null }),
}));
