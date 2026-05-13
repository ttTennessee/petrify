import { describe, expect, it, beforeAll } from "vitest";
import { compile, CompileError } from "../runtime/compiler.js";
import { registerAdapter, getAdapter } from "../adapters/registry.js";
import { MockAdapter } from "../adapters/mock.js";

beforeAll(() => {
  if (!getAdapter("mock")) registerAdapter("mock", new MockAdapter());
});

function nodeStub(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "x",
    ref: "x",
    title: "X",
    adapter: { name: "mock" },
    dependencies: [],
    inputs: {},
    outputs: {},
    ...over,
  };
}

describe("compiler", () => {
  it("orders nodes by control + dependencies, computes predecessors", () => {
    const plan = compile({
      nodes: [
        nodeStub({ id: "a", ref: "a" }),
        nodeStub({ id: "b", ref: "b", dependencies: ["a"] }),
        nodeStub({ id: "c", ref: "c", dependencies: ["a"] }),
        nodeStub({ id: "d", ref: "d", dependencies: ["b", "c"] }),
      ],
      edges: [],
    });
    expect(plan.order[0]).toBe("a");
    expect(plan.order[3]).toBe("d");
    expect(plan.predecessors.d).toEqual(expect.arrayContaining(["b", "c"]));
    expect(plan.successors.a).toEqual(expect.arrayContaining(["b", "c"]));
  });

  it("rejects cycles via dependencies", () => {
    expect(() =>
      compile({
        nodes: [
          nodeStub({ id: "a", ref: "a", dependencies: ["b"] }),
          nodeStub({ id: "b", ref: "b", dependencies: ["a"] }),
        ],
        edges: [],
      }),
    ).toThrow(CompileError);
  });

  it("rejects unknown adapter", () => {
    expect(() =>
      compile({
        nodes: [nodeStub({ adapter: { name: "missing" } })],
        edges: [],
      }),
    ).toThrow(/unregistered adapter/);
  });

  it("rejects duplicate refs", () => {
    expect(() =>
      compile({
        nodes: [nodeStub({ id: "a", ref: "x" }), nodeStub({ id: "b", ref: "x" })],
        edges: [],
      }),
    ).toThrow(/duplicate node ref/);
  });

  it("rejects undeclared resource pools", () => {
    expect(() =>
      compile({
        nodes: [nodeStub({ resources: [{ name: "llm_quota", amount: 1 }] })],
        edges: [],
      }),
    ).toThrow(/not declared in runtime_policy/);
  });

  it("accepts when pools are declared", () => {
    const plan = compile({
      nodes: [nodeStub({ resources: [{ name: "llm_quota", amount: 1 }] })],
      edges: [],
      runtime_policy: { pools: { llm_quota: { capacity: 2 } } },
    });
    expect(plan.pools.llm_quota).toBe(2);
  });
});
