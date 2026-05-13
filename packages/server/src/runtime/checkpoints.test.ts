import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { compile } from "../runtime/compiler.js";
import { executeRun } from "../runtime/scheduler.js";
import { registerAdapter, getAdapter } from "../adapters/registry.js";
import { MockAdapter, _resetMockState } from "../adapters/mock.js";
import {
  saveCheckpoint,
  listCheckpoints,
  getLatestCheckpoint,
} from "../runtime/checkpoints.js";
import { createRun, ensureWorkflow, getRunStatus, listRunEvents } from "./test-helpers.js";

beforeAll(() => {
  if (!getAdapter("mock")) registerAdapter("mock", new MockAdapter());
});

beforeEach(() => {
  _resetMockState();
});

describe("checkpoints", () => {
  it("roundtrips a saved blob via getLatestCheckpoint", () => {
    const workflowId = ensureWorkflow({ nodes: [], edges: [] });
    const runId = createRun(workflowId);
    saveCheckpoint(runId, {
      run_id: runId,
      saved_at: Date.now(),
      completed_node_ids: ["a", "b"],
      skipped_node_ids: [],
      node_outputs: { a: { hello: 1 } },
      variables: {},
    });
    const latest = getLatestCheckpoint(runId);
    expect(latest).not.toBeNull();
    expect(latest!.blob.completed_node_ids).toEqual(["a", "b"]);
    expect(latest!.blob.node_outputs.a).toEqual({ hello: 1 });
  });

  it("resume from checkpoint skips already-completed nodes", async () => {
    // A linear A->B->C graph. First, fail on B; this leaves a checkpoint with
    // A completed. Resume with B's failure-inducing input removed should
    // re-execute only B and C — never re-emit a NodeStarted for A.
    const baseGraph = (failB: number) => ({
      nodes: [
        { id: "a", ref: "a", title: "A", adapter: { name: "mock" }, dependencies: [], inputs: {}, outputs: {} },
        {
          id: "b",
          ref: "b",
          title: "B",
          adapter: { name: "mock" },
          dependencies: ["a"],
          inputs: { fail_until_attempt: failB },
          outputs: {},
          on_failure: { strategy: "abort" },
        },
        { id: "c", ref: "c", title: "C", adapter: { name: "mock" }, dependencies: ["b"], inputs: {}, outputs: {} },
      ],
      edges: [],
    });

    // First run — fail at B.
    const workflowId1 = ensureWorkflow(baseGraph(99));
    const plan1 = compile(baseGraph(99));
    const runId1 = createRun(workflowId1);
    await executeRun(runId1, plan1);
    expect(getRunStatus(runId1)).toBe("failed");
    const cp = getLatestCheckpoint(runId1);
    expect(cp!.blob.completed_node_ids).toContain("a");

    // Second run — uses a non-failing graph and resumes from the checkpoint.
    const plan2 = compile(baseGraph(0));
    const runId2 = createRun(workflowId1);
    // Copy the prior checkpoint to the new run id (mirrors the route's behavior).
    const saved = saveCheckpoint(runId2, { ...cp!.blob, run_id: runId2 });
    await executeRun(runId2, plan2, { resumeFromCheckpointId: saved.id });
    expect(getRunStatus(runId2)).toBe("completed");

    const events = listRunEvents(runId2);
    // A was already completed, so the scheduler should NOT have launched it again.
    expect(events.find((e) => e.type === "NodeStarted" && e.node_id === "a")).toBeUndefined();
    expect(events.filter((e) => e.type === "NodeCompleted").map((e) => e.node_id)).toEqual(
      expect.arrayContaining(["b", "c"]),
    );
  });

  it("listCheckpoints returns all checkpoints for a run", () => {
    const workflowId = ensureWorkflow({ nodes: [], edges: [] });
    const runId = createRun(workflowId);
    saveCheckpoint(runId, {
      run_id: runId,
      saved_at: 1,
      completed_node_ids: ["a"],
      skipped_node_ids: [],
      node_outputs: {},
      variables: {},
    });
    saveCheckpoint(runId, {
      run_id: runId,
      saved_at: 2,
      completed_node_ids: ["a", "b"],
      skipped_node_ids: [],
      node_outputs: {},
      variables: {},
    });
    const list = listCheckpoints(runId);
    expect(list).toHaveLength(2);
    const sizes = list.map((c) => c.blob.completed_node_ids.length).sort();
    expect(sizes).toEqual([1, 2]);
  });
});
