import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";

export const configRouter = Router();

const DEFAULTS = {
  auto_run: true,
};

export type GlobalConfig = typeof DEFAULTS;

const ConfigPatchSchema = z
  .object({
    auto_run: z.boolean().optional(),
  })
  .strict();

function readAll(): GlobalConfig {
  const rows = db
    .prepare(`SELECT key, value_json FROM global_config`)
    .all() as Array<{ key: string; value_json: string }>;
  const out: GlobalConfig = { ...DEFAULTS };
  for (const r of rows) {
    if (r.key in DEFAULTS) {
      try {
        (out as Record<string, unknown>)[r.key] = JSON.parse(r.value_json);
      } catch {
        /* keep default */
      }
    }
  }
  return out;
}

const upsert = db.prepare(
  `INSERT INTO global_config (key, value_json, updated_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
);

export function getConfig(): GlobalConfig {
  return readAll();
}

configRouter.get("/", (_req, res) => {
  res.json(readAll());
});

configRouter.put("/", (req, res) => {
  const parsed = ConfigPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const now = Date.now();
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    upsert.run(k, JSON.stringify(v), now);
  }
  res.json(readAll());
});
