// 验证 db-pearl CheckpointsRepo 在 entity 图存储下，对外仍满足 CheckpointRow
// roundtrip 语义（与 sqlite 后端等价）。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPearlDb } from "../src/index.js";

type Ctx = ReturnType<typeof createPearlDb>;

const sampleBlob = (overrides: Record<string, unknown> = {}) => ({
  run_id: "run-1",
  saved_at: 1000,
  completed_node_ids: ["n1", "n2"],
  skipped_node_ids: ["n3"],
  node_outputs: {
    n1: { ok: true, value: 42 },
    n2: "hello",
  },
  variables: {
    counter: 7,
    flag: false,
    nested: { a: [1, 2, 3], b: null },
  },
  ...overrides,
});

describe("db-pearl CheckpointsRepo", () => {
  let dir: string;
  let ctx: Ctx;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "db-pearl-cp-"));
    ctx = createPearlDb({ dir, fsync: false });
  });

  afterEach(() => {
    ctx.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("insert → getById 完整 roundtrip", () => {
    const blob = sampleBlob();
    ctx.checkpoints.insert({
      id: "cp-1",
      run_id: "run-1",
      label: "before-step-3",
      blob_json: JSON.stringify(blob),
      created_at: 1234,
    });

    const got = ctx.checkpoints.getById("cp-1");
    expect(got).toBeDefined();
    expect(got!.id).toBe("cp-1");
    expect(got!.run_id).toBe("run-1");
    expect(got!.label).toBe("before-step-3");
    expect(got!.created_at).toBe(1234);

    const restored = JSON.parse(got!.blob_json);
    expect(restored).toEqual(blob);
  });

  it("缺省 adapter_blobs 不应注入空对象", () => {
    const blob = sampleBlob();
    ctx.checkpoints.insert({
      id: "cp-noab",
      run_id: "run-1",
      label: null,
      blob_json: JSON.stringify(blob),
      created_at: 1,
    });
    const restored = JSON.parse(ctx.checkpoints.getById("cp-noab")!.blob_json);
    expect("adapter_blobs" in restored).toBe(false);
  });

  it("adapter_blobs 也走 roundtrip", () => {
    const blob = sampleBlob({
      adapter_blobs: { n1: { token: "abc" }, n2: 99 },
    });
    ctx.checkpoints.insert({
      id: "cp-ab",
      run_id: "run-1",
      label: null,
      blob_json: JSON.stringify(blob),
      created_at: 1,
    });
    const restored = JSON.parse(ctx.checkpoints.getById("cp-ab")!.blob_json);
    expect(restored.adapter_blobs).toEqual(blob.adapter_blobs);
  });

  it("listByRun 按 created_at DESC 且按 run 隔离", () => {
    ctx.checkpoints.insert({
      id: "cp-a",
      run_id: "run-1",
      label: "a",
      blob_json: JSON.stringify(sampleBlob()),
      created_at: 100,
    });
    ctx.checkpoints.insert({
      id: "cp-b",
      run_id: "run-1",
      label: "b",
      blob_json: JSON.stringify(sampleBlob()),
      created_at: 300,
    });
    ctx.checkpoints.insert({
      id: "cp-c",
      run_id: "run-2",
      label: "c",
      blob_json: JSON.stringify(sampleBlob({ run_id: "run-2" })),
      created_at: 200,
    });

    const r1 = ctx.checkpoints.listByRun("run-1");
    expect(r1.map((x) => x.id)).toEqual(["cp-b", "cp-a"]);

    const r2 = ctx.checkpoints.listByRun("run-2");
    expect(r2.map((x) => x.id)).toEqual(["cp-c"]);

    expect(ctx.checkpoints.listByRun("run-missing")).toEqual([]);
  });

  it("getById 返回 undefined 当 id 不存在", () => {
    expect(ctx.checkpoints.getById("nope")).toBeUndefined();
  });

  it("空 node_outputs / variables 不破坏 roundtrip", () => {
    const blob = sampleBlob({ node_outputs: {}, variables: {} });
    ctx.checkpoints.insert({
      id: "cp-empty",
      run_id: "run-1",
      label: null,
      blob_json: JSON.stringify(blob),
      created_at: 1,
    });
    const restored = JSON.parse(ctx.checkpoints.getById("cp-empty")!.blob_json);
    expect(restored.node_outputs).toEqual({});
    expect(restored.variables).toEqual({});
  });
});
