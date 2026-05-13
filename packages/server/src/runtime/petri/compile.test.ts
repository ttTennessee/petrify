import { describe, expect, it } from "vitest";
import { compilePetri } from "./compile.js";
import { WorkflowGraphSchema, type WorkflowGraph } from "@petrify/shared";

function makeGraph(input: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(input);
}

describe("petri compile", () => {
  it("creates a transition per node and edge places for control edges", () => {
    const g = makeGraph({
      nodes: [
        { id: "1", ref: "a", title: "A", adapter: { name: "mock" } },
        { id: "2", ref: "b", title: "B", adapter: { name: "mock" }, dependencies: ["a"] },
      ],
    });
    const c = compilePetri(g);
    expect(c.net.transitions.map((t) => t.id).sort()).toEqual(["t_a", "t_b"]);
    expect(c.net.places.find((p) => p.id === "p_edge_a_b")).toBeDefined();
    expect(c.net.arcs).toContainEqual({ from: "t_a", to: "p_edge_a_b", weight: 1 });
    expect(c.net.arcs).toContainEqual({ from: "p_edge_a_b", to: "t_b", weight: 1 });
  });

  it("seeds root entry places with 1 token", () => {
    const g = makeGraph({
      nodes: [
        { id: "1", ref: "a", title: "A", adapter: { name: "mock" } },
        { id: "2", ref: "b", title: "B", adapter: { name: "mock" }, dependencies: ["a"] },
      ],
    });
    const c = compilePetri(g);
    expect(c.initialMarking["p_a_in"]).toBe(1);
    expect(c.initialMarking["p_b_in"] ?? 0).toBe(0);
  });

  it("creates pool places with declared capacity", () => {
    const g = makeGraph({
      nodes: [
        {
          id: "1",
          ref: "a",
          title: "A",
          adapter: { name: "mock" },
          resources: [{ name: "llm", amount: 1 }],
        },
      ],
      runtime_policy: { pools: { llm: { capacity: 3 } } },
    });
    const c = compilePetri(g);
    expect(c.initialMarking["p_pool_llm"]).toBe(3);
    expect(c.net.arcs).toContainEqual({ from: "p_pool_llm", to: "t_a", weight: 1 });
    expect(c.net.arcs).toContainEqual({ from: "t_a", to: "p_pool_llm", weight: 1 });
  });

  it("omits release arc when release: false", () => {
    const g = makeGraph({
      nodes: [
        {
          id: "1",
          ref: "a",
          title: "A",
          adapter: { name: "mock" },
          resources: [{ name: "ticket", amount: 1, release: false }],
        },
      ],
      runtime_policy: { pools: { ticket: { capacity: 2 } } },
    });
    const c = compilePetri(g);
    expect(c.net.arcs).toContainEqual({ from: "p_pool_ticket", to: "t_a", weight: 1 });
    expect(c.net.arcs.find((a) => a.from === "t_a" && a.to === "p_pool_ticket")).toBeUndefined();
  });
});
