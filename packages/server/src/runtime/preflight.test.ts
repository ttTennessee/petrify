import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { compile } from "./compiler.js";
import { validateAdaptersForRun } from "./preflight.js";
import {
  getAdapter,
  registerAdapter,
  unregisterAdapter,
} from "../adapters/registry.js";
import { MockAdapter } from "../adapters/mock.js";
import type { AgentAdapter } from "../adapters/types.js";

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

describe("validateAdaptersForRun", () => {
  afterEach(() => {
    unregisterAdapter("probe-ok");
    unregisterAdapter("probe-fail");
  });

  it("passes when all adapters are registered and have no probe", async () => {
    const plan = compile({ nodes: [nodeStub()], edges: [] });
    const result = await validateAdaptersForRun(plan);
    expect(result.ok).toBe(true);
  });

  it("fails when an adapter is unregistered, with node ref mapped", async () => {
    const plan = compile({
      nodes: [nodeStub({ adapter: { name: "ghost" }, ref: "n1", id: "n1" })],
      edges: [],
    });
    const result = await validateAdaptersForRun(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.adapter).toBe("ghost");
      expect(result.failures[0]!.node_ref).toBe("n1");
      expect(result.failures[0]!.reason).toMatch(/not registered/);
    }
  });

  it("passes when probe() returns ok", async () => {
    const fakeOk: AgentAdapter = {
      manifest: () => ({
        name: "probe-ok",
        version: "0",
        capabilities: [],
        concurrency: { max: 1 },
      }),
      invoke: async function* () {},
      cancel: async () => {},
      checkpoint: async () => ({}),
      restore: async () => "",
      probe: async () => ({ ok: true, durationMs: 1 }),
    };
    registerAdapter("probe-ok", fakeOk);
    const plan = compile({
      nodes: [nodeStub({ adapter: { name: "probe-ok" } })],
      edges: [],
    });
    const result = await validateAdaptersForRun(plan);
    expect(result.ok).toBe(true);
  });

  it("fails when probe() returns error, dedupes across nodes", async () => {
    const fakeFail: AgentAdapter = {
      manifest: () => ({
        name: "probe-fail",
        version: "0",
        capabilities: [],
        concurrency: { max: 1 },
      }),
      invoke: async function* () {},
      cancel: async () => {},
      checkpoint: async () => ({}),
      restore: async () => "",
      probe: async () => ({ ok: false, error: "boom" }),
    };
    registerAdapter("probe-fail", fakeFail);
    const plan = compile({
      nodes: [
        nodeStub({ id: "a", ref: "a", adapter: { name: "probe-fail" } }),
        nodeStub({
          id: "b",
          ref: "b",
          dependencies: ["a"],
          adapter: { name: "probe-fail" },
        }),
      ],
      edges: [],
    });
    const result = await validateAdaptersForRun(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.map((f) => f.node_ref).sort()).toEqual(["a", "b"]);
      expect(result.failures.every((f) => f.reason === "boom")).toBe(true);
    }
  });
});
