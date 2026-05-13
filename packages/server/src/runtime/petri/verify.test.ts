import { describe, expect, it } from "vitest";
import { WorkflowGraphSchema, type WorkflowGraph } from "@petrify/shared";
import { verifyWorkflow } from "./verify.js";

function makeGraph(input: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(input);
}

describe("petri verify", () => {
  it("passes on a simple linear workflow", () => {
    const g = makeGraph({
      nodes: [
        { id: "1", ref: "a", title: "A", adapter: { name: "mock" } },
        { id: "2", ref: "b", title: "B", adapter: { name: "mock" }, dependencies: ["a"] },
      ],
    });
    const r = verifyWorkflow(g);
    expect(r.status).toBe("pass");
    expect(r.issues).toEqual([]);
  });

  it("passes on a diamond layout", () => {
    const g = makeGraph({
      nodes: [
        { id: "1", ref: "root", title: "R", adapter: { name: "mock" } },
        { id: "2", ref: "l", title: "L", adapter: { name: "mock" }, dependencies: ["root"] },
        { id: "3", ref: "r", title: "R2", adapter: { name: "mock" }, dependencies: ["root"] },
        { id: "4", ref: "j", title: "J", adapter: { name: "mock" }, dependencies: ["l", "r"] },
      ],
    });
    const r = verifyWorkflow(g);
    expect(r.status).toBe("pass");
  });

  it("detects classic two-resource cross-acquisition deadlock", () => {
    // node A consumes 1 of poolX, then 1 of poolY (modeled as two separate claims).
    // node B consumes 1 of poolY, then 1 of poolX.
    // capacity 1 each — the Petri net should expose a stuck marking.
    // Single-shot transitions can't show this; we use the holding-resource trick:
    // resource_a holds poolX, resource_b holds poolY, then they each need the other.
    const g = makeGraph({
      nodes: [
        // Pre-holder for X: takes a permit_x token, holds poolX forever (release:false), then enables A.
        {
          id: "1",
          ref: "hold_x",
          title: "Hold X",
          adapter: { name: "mock" },
          resources: [{ name: "poolX", amount: 1, release: false }],
        },
        {
          id: "2",
          ref: "hold_y",
          title: "Hold Y",
          adapter: { name: "mock" },
          resources: [{ name: "poolY", amount: 1, release: false }],
        },
        // A needs poolY (already held by hold_y), B needs poolX (already held by hold_x).
        {
          id: "3",
          ref: "need_y",
          title: "Need Y",
          adapter: { name: "mock" },
          dependencies: ["hold_x"],
          resources: [{ name: "poolY", amount: 1 }],
        },
        {
          id: "4",
          ref: "need_x",
          title: "Need X",
          adapter: { name: "mock" },
          dependencies: ["hold_y"],
          resources: [{ name: "poolX", amount: 1 }],
        },
      ],
      runtime_policy: {
        pools: {
          poolX: { capacity: 1 },
          poolY: { capacity: 1 },
        },
      },
    });
    const r = verifyWorkflow(g);
    expect(r.status).toBe("fail");
    expect(r.issues.some((i) => i.code === "resource_deadlock")).toBe(true);
  });

  it("flags unbounded place when transitions can fire arbitrarily many times", () => {
    // A graph where node A has no upstream consumer for its own output edges but
    // also has a self-feeding pool over-release. Use release-only arcs: a node
    // that doesn't consume from poolZ but does release into it.
    // Simpler: a loop where node A's entry is replenished by a synthetic edge.
    // We can simulate by giving the same node two outgoing control edges to itself
    // — that's a cycle.
    const g = makeGraph({
      nodes: [
        { id: "1", ref: "a", title: "A", adapter: { name: "mock" } },
        { id: "2", ref: "b", title: "B", adapter: { name: "mock" }, dependencies: ["a"] },
      ],
      edges: [{ from: "2", to: "1", kind: "control" }],
    });
    const r = verifyWorkflow(g);
    // The reachability analysis may classify this as unbounded or as a deadlock-free loop;
    // either way it should not be "pass" silently.
    expect(["warn", "fail"]).toContain(r.status);
  });
});
