import { Router } from "express";
import { z } from "zod";
import { dbContext } from "../db-context.js";

export const configRouter = Router();

const DEFAULTS = {
  auto_run: true,
  // Default policy applied when a node has no `permission_policy` field.
  // "ask" surfaces a UI prompt for every agent permission request; "deny-all"
  // hard-denies everything (the pre-broker behavior, useful for headless runs).
  permission_default_policy: "ask" as "ask" | "deny-all",
};

export type GlobalConfig = typeof DEFAULTS;

const ConfigPatchSchema = z
  .object({
    auto_run: z.boolean().optional(),
    permission_default_policy: z.enum(["ask", "deny-all"]).optional(),
  })
  .strict();

function readAll(): GlobalConfig {
  const rows = dbContext.globalConfig.list();
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
    dbContext.globalConfig.upsert(k, JSON.stringify(v), now);
  }
  res.json(readAll());
});
