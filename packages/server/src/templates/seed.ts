import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import { WorkflowGraphSchema, type WorkflowGraph } from "@petrify/shared";
import { dbContext } from "../db-context.js";

const SEED_PREFIX = "example: ";

interface SeedFile {
  fileName: string;
  graph: WorkflowGraph;
}

export function seedExampleTemplates(): { inserted: number; skipped: number } {
  if (process.env.PETRIFY_SEED_EXAMPLES === "0") {
    return { inserted: 0, skipped: 0 };
  }

  const examplesDir = resolveExamplesDir();
  let entries: string[];
  try {
    entries = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));
  } catch {
    return { inserted: 0, skipped: 0 };
  }

  const files: SeedFile[] = [];
  for (const fileName of entries) {
    try {
      const raw = JSON.parse(readFileSync(join(examplesDir, fileName), "utf8"));
      const parsed = WorkflowGraphSchema.safeParse(raw);
      if (parsed.success) {
        files.push({ fileName, graph: parsed.data });
      }
    } catch {
      // Bad file — skip silently; seeding must not break boot.
    }
  }

  let inserted = 0;
  let skipped = 0;
  const now = Date.now();
  for (const { fileName, graph } of files) {
    const name = SEED_PREFIX + fileName.replace(/\.json$/, "");
    if (dbContext.templates.findByName(name)) {
      skipped++;
      continue;
    }
    dbContext.templates.insert({
      id: nanoid(),
      name,
      description: `Bundled example loaded from examples/${fileName}`,
      tags_json: JSON.stringify(["example", "bundled"]),
      graph_json: JSON.stringify(graph),
      runtime_policy_json: null,
      adapter_bindings_json: null,
      source_workflow_id: null,
      origin: "local",
      created_at: now,
      updated_at: now,
    });
    inserted++;
  }
  return { inserted, skipped };
}

function resolveExamplesDir(): string {
  // Walk up from this file (packages/server/dist|src/templates/seed.*) until we
  // find a directory containing an "examples" sibling. This keeps the seed
  // working in both ts-node-dev and compiled-dist layouts.
  const here = dirname(fileURLToPath(import.meta.url));
  let cur = here;
  for (let i = 0; i < 6; i++) {
    const candidate = join(cur, "examples");
    try {
      const stat = readdirSync(candidate);
      if (stat.length > 0) return candidate;
    } catch {
      /* keep climbing */
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return resolve(here, "../../../../examples");
}
