import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Pearl } from "../src/index.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "pearl-gen-"));
}

describe("gen-types", () => {
  let dir: string;
  let db: Pearl;

  beforeEach(() => {
    dir = tmp();
    db = Pearl.open({ dir, fsync: false });
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("空 registry 输出占位 EntityByType", () => {
    const out = db.generateTypes();
    expect(out).toContain("export type EntityByType = {");
    expect(out).toContain("(no entity types observed yet)");
    expect(out).toContain("export type EntityType = keyof EntityByType");
  });

  it("观察后输出 Attrs 与 Entity 接口", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: {
            entityType: "run",
            attrs: { status: "running", progress: 0.5, ok: true },
          },
        },
      ],
    });
    const out = db.generateTypes();
    expect(out).toContain("export interface RunAttrs {");
    expect(out).toContain("status?: string");
    expect(out).toContain("progress?: number");
    expect(out).toContain("ok?: boolean");
    expect(out).toContain("export interface RunEntity {");
    expect(out).toContain('type: "run"');
    expect(out).toContain("attrs: RunAttrs");
    expect(out).toContain('"run": RunEntity');
  });

  it("多 entityType 排序稳定", async () => {
    await db.commit({
      events: [
        {
          entityId: "z-1",
          type: "Created",
          payload: { entityType: "zeta", attrs: { x: 1 } },
        },
        {
          entityId: "a-1",
          type: "Created",
          payload: { entityType: "alpha", attrs: { y: "ok" } },
        },
      ],
    });
    const out = db.generateTypes();
    const aIdx = out.indexOf("AlphaEntity");
    const zIdx = out.indexOf("ZetaEntity");
    expect(aIdx).toBeGreaterThan(0);
    expect(zIdx).toBeGreaterThan(0);
    expect(aIdx).toBeLessThan(zIdx);
  });

  it("snake_case 与 kebab-case entity type 转换为 PascalCase", async () => {
    await db.commit({
      events: [
        {
          entityId: "x-1",
          type: "Created",
          payload: { entityType: "mcp_server", attrs: { name: "test" } },
        },
        {
          entityId: "x-2",
          type: "Created",
          payload: { entityType: "adapter-instance", attrs: { kind: "local" } },
        },
      ],
    });
    const out = db.generateTypes();
    expect(out).toContain("McpServerEntity");
    expect(out).toContain("AdapterInstanceEntity");
  });

  it("非法 identifier 的 attr 名加引号", async () => {
    await db.commit({
      events: [
        {
          entityId: "x",
          type: "Created",
          payload: { entityType: "foo", attrs: { "has-dash": "ok", "1leading": "x" } },
        },
      ],
    });
    const out = db.generateTypes();
    expect(out).toContain('"has-dash"?: string');
    expect(out).toContain('"1leading"?: string');
  });

  it("writeTypes 落盘", async () => {
    await db.commit({
      events: [
        {
          entityId: "r-1",
          type: "Created",
          payload: { entityType: "run", attrs: { status: "running" } },
        },
      ],
    });
    const outPath = join(dir, "pearl-types.d.ts");
    db.writeTypes(outPath);
    const content = readFileSync(outPath, "utf8");
    expect(content).toContain("RunAttrs");
  });

  it("array / object primitive 输出 unknown 容器类型", async () => {
    await db.commit({
      events: [
        {
          entityId: "x",
          type: "Created",
          payload: {
            entityType: "foo",
            attrs: { items: [1, 2, 3], meta: { nested: true } },
          },
        },
      ],
    });
    const out = db.generateTypes();
    expect(out).toContain("items?: unknown[]");
    expect(out).toContain("meta?: Record<string, unknown>");
  });
});
