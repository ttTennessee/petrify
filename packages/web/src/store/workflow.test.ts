import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@petrify/shared";
import { useWorkflowStore } from "./workflow";

function ev(
  partial: Partial<RuntimeEvent> & {
    event_id: string;
    type: RuntimeEvent["type"];
  },
): RuntimeEvent {
  return {
    run_id: "run-1",
    node_id: partial.node_id ?? null,
    timestamp: partial.timestamp ?? 0,
    payload: partial.payload ?? {},
    ...partial,
  };
}

// rAF-based flush is synchronous under fake timers when we advance them.
function flushRaf() {
  vi.runAllTimers();
}

describe("useWorkflowStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // requestAnimationFrame in jsdom may not be deterministic — stub to setTimeout
    // so vi.runAllTimers() drains the queue.
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
    );
    useWorkflowStore.getState().resetRun();
    // drain any pending raf scheduled by a previous test
    flushRaf();
  });

  describe("ingestEvent", () => {
    it("buffers events and flushes them on the next animation frame", () => {
      const { ingestEvent } = useWorkflowStore.getState();
      ingestEvent(ev({ event_id: "e1", type: "NodeStarted", node_id: "n1" }));
      ingestEvent(ev({ event_id: "e2", type: "NodeCompleted", node_id: "n1" }));

      // Before flush nothing should be visible yet.
      expect(useWorkflowStore.getState().allEvents).toHaveLength(0);

      flushRaf();
      const s = useWorkflowStore.getState();
      expect(s.allEvents).toHaveLength(2);
      expect(s.events).toHaveLength(2);
      expect(s.nodeStatus.n1).toBe("completed");
    });

    it("dedupes by event_id when the same event is ingested twice", () => {
      const { ingestEvent } = useWorkflowStore.getState();
      const e = ev({ event_id: "dup", type: "NodeStarted", node_id: "n1" });
      ingestEvent(e);
      flushRaf();
      ingestEvent(e);
      flushRaf();
      expect(useWorkflowStore.getState().allEvents).toHaveLength(1);
    });

    it("maps event types to node status", () => {
      const { ingestEvent } = useWorkflowStore.getState();
      ingestEvent(ev({ event_id: "e1", type: "NodeStarted", node_id: "n1" }));
      ingestEvent(ev({ event_id: "e2", type: "NodeFailed", node_id: "n2" }));
      ingestEvent(ev({ event_id: "e3", type: "NodeSkipped", node_id: "n3" }));
      flushRaf();
      const status = useWorkflowStore.getState().nodeStatus;
      expect(status.n1).toBe("running");
      expect(status.n2).toBe("failed");
      expect(status.n3).toBe("skipped");
    });
  });

  describe("replayEvents", () => {
    it("merges HTTP seed with WS-ingested state, dedupes, and sorts by timestamp", () => {
      const { ingestEvent, replayEvents } = useWorkflowStore.getState();
      // WS arrives first
      ingestEvent(
        ev({
          event_id: "ws-late",
          type: "NodeCompleted",
          node_id: "n1",
          timestamp: 100,
        }),
      );
      flushRaf();
      // HTTP seed lands later, includes an earlier event the WS missed
      replayEvents([
        ev({
          event_id: "http-early",
          type: "NodeStarted",
          node_id: "n1",
          timestamp: 50,
        }),
        // duplicate of WS event (same event_id) — must dedupe
        ev({
          event_id: "ws-late",
          type: "NodeCompleted",
          node_id: "n1",
          timestamp: 100,
        }),
      ]);
      const s = useWorkflowStore.getState();
      expect(s.allEvents.map((e) => e.event_id)).toEqual([
        "http-early",
        "ws-late",
      ]);
      expect(s.nodeStatus.n1).toBe("completed");
    });

    it("applies seedStatus before deriving status from events", () => {
      const { replayEvents } = useWorkflowStore.getState();
      replayEvents([], { nA: "completed" });
      expect(useWorkflowStore.getState().nodeStatus.nA).toBe("completed");
    });
  });

  describe("setScrubCursor", () => {
    it("switches to paused mode and slices events when cursor < length", () => {
      const { ingestEvent, setScrubCursor } = useWorkflowStore.getState();
      ingestEvent(
        ev({ event_id: "e1", type: "NodeStarted", node_id: "n1", timestamp: 1 }),
      );
      ingestEvent(
        ev({ event_id: "e2", type: "NodeCompleted", node_id: "n1", timestamp: 2 }),
      );
      flushRaf();
      setScrubCursor(1);
      const s = useWorkflowStore.getState();
      expect(s.scrubMode).toBe("paused");
      expect(s.events).toHaveLength(1);
      // status should reflect only the first event
      expect(s.nodeStatus.n1).toBe("running");
    });

    it("returns to live mode when cursor >= length", () => {
      const { ingestEvent, setScrubCursor } = useWorkflowStore.getState();
      ingestEvent(ev({ event_id: "e1", type: "NodeStarted", node_id: "n1" }));
      flushRaf();
      setScrubCursor(0); // pause at start
      expect(useWorkflowStore.getState().scrubMode).toBe("paused");
      setScrubCursor(99); // way past end
      const s = useWorkflowStore.getState();
      expect(s.scrubMode).toBe("live");
      expect(s.events).toHaveLength(1);
    });
  });

  describe("pausedAtBreakpoint", () => {
    it("returns node ids with a BreakpointHit not yet superseded by a terminal event", () => {
      const { ingestEvent, pausedAtBreakpoint } = useWorkflowStore.getState();
      ingestEvent(ev({ event_id: "b1", type: "BreakpointHit", node_id: "n1" }));
      ingestEvent(ev({ event_id: "b2", type: "BreakpointHit", node_id: "n2" }));
      ingestEvent(ev({ event_id: "c1", type: "NodeCompleted", node_id: "n1" }));
      flushRaf();
      expect(pausedAtBreakpoint().sort()).toEqual(["n2"]);
    });
  });

  describe("resetRun", () => {
    it("clears all event/status/run state", () => {
      const { ingestEvent, setCurrentRunId, resetRun } =
        useWorkflowStore.getState();
      setCurrentRunId("run-x");
      ingestEvent(ev({ event_id: "e1", type: "NodeStarted", node_id: "n1" }));
      flushRaf();
      resetRun();
      const s = useWorkflowStore.getState();
      expect(s.currentRunId).toBeNull();
      expect(s.allEvents).toHaveLength(0);
      expect(s.nodeStatus).toEqual({});
      expect(s.scrubMode).toBe("live");
      expect(s.scrubCursor).toBe(0);
    });
  });
});
