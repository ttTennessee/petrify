import { Router } from "express";
import { z } from "zod";
import { ADAPTER_CATALOG, findCatalogEntry } from "../adapters/catalog.js";
import {
  createInstance,
  deleteInstance,
  getInstance,
  listInstances,
  patchInstance,
  setEnabled,
  setStatus,
  buildAdapterFromRow,
  type AdapterKind,
} from "../adapters/persistence.js";
import {
  getAdapterEntry,
  listAdapterEntries,
  registerAdapter,
  unregisterAdapter,
} from "../adapters/registry.js";
import { probeAcp } from "../adapters/probe.js";

export const adaptersRouter = Router();

const NameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.:-]+$/, "name must be [a-zA-Z0-9_.:-]+");

const KindSchema = z.enum(["spawn", "connect"]);

const CreateBodySchema = z.object({
  name: NameSchema,
  catalog_id: z.string().min(1).max(64).optional().nullable(),
  kind: KindSchema,
  command: z.string().min(1).optional().nullable(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  default_cwd: z.string().optional().nullable(),
  endpoint: z.string().optional().nullable(),
});

const PatchBodySchema = CreateBodySchema.partial().omit({ name: true });

// === Reserved-name guard ====================================================
// Names registered statically at boot (mock + env-driven acp) are read-only
// via this API. They show up in GET but cannot be mutated.
function isReadOnlyName(name: string): boolean {
  const entry = getAdapterEntry(name);
  if (!entry) return false;
  const src = entry.meta?.source;
  return src === "builtin" || src === "env";
}

// === GET /catalog ===========================================================
adaptersRouter.get("/catalog", (_req, res) => {
  res.json(ADAPTER_CATALOG);
});

// === GET / ==================================================================
adaptersRouter.get("/", (_req, res) => {
  const rows = listInstances();
  const registered = new Map(listAdapterEntries().map((e) => [e.name, e]));
  // Merge: each db row gets `live` = whether it's currently in the registry.
  const merged = rows.map((r) => ({
    ...r,
    live: registered.has(r.name),
  }));
  // Also surface read-only registry entries (mock, env-driven acp) that have
  // no db row, so the UI can display them.
  const extras: Array<Record<string, unknown>> = [];
  for (const [name, entry] of registered.entries()) {
    if (rows.find((r) => r.name === name)) continue;
    extras.push({
      name,
      catalog_id: entry.meta?.catalog_id ?? null,
      kind: entry.meta?.kind ?? "builtin",
      enabled: 1,
      command: null,
      args: [],
      env: {},
      default_cwd: null,
      endpoint: null,
      status: "ok",
      status_detail: entry.meta?.source ?? null,
      last_probed_at: null,
      created_at: 0,
      updated_at: 0,
      live: true,
      read_only: true,
    });
  }
  res.json([...extras, ...merged]);
});

// === POST / =================================================================
adaptersRouter.post("/", (req, res) => {
  const parsed = CreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const body = parsed.data;
  if (body.kind === "connect") {
    return res.status(400).json({
      error: "connect mode is reserved for a future release; please use spawn mode",
    });
  }
  if (body.kind === "spawn" && !body.command) {
    return res.status(400).json({ error: "command is required for spawn kind" });
  }
  if (getInstance(body.name) || getAdapterEntry(body.name)) {
    return res.status(409).json({ error: `adapter '${body.name}' already exists` });
  }
  if (body.catalog_id && !findCatalogEntry(body.catalog_id)) {
    return res.status(400).json({ error: `unknown catalog_id '${body.catalog_id}'` });
  }
  const row = createInstance({
    name: body.name,
    catalog_id: body.catalog_id ?? null,
    kind: body.kind as AdapterKind,
    command: body.command ?? null,
    args: body.args ?? [],
    env: body.env ?? {},
    default_cwd: body.default_cwd ?? null,
    endpoint: body.endpoint ?? null,
  });
  res.status(201).json(row);
});

// === PATCH /:name ===========================================================
adaptersRouter.patch("/:name", (req, res) => {
  const { name } = req.params;
  if (isReadOnlyName(name)) {
    return res.status(403).json({ error: `'${name}' is read-only` });
  }
  const parsed = PatchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const existing = getInstance(name);
  if (!existing) return res.status(404).json({ error: "not found" });
  const updated = patchInstance(name, {
    catalog_id: parsed.data.catalog_id,
    kind: (parsed.data.kind as AdapterKind | undefined) ?? existing.kind,
    command: parsed.data.command,
    args: parsed.data.args,
    env: parsed.data.env,
    default_cwd: parsed.data.default_cwd,
    endpoint: parsed.data.endpoint,
  });
  res.json(updated);
});

// === DELETE /:name ==========================================================
adaptersRouter.delete("/:name", (req, res) => {
  const { name } = req.params;
  if (isReadOnlyName(name)) {
    return res.status(403).json({ error: `'${name}' is read-only` });
  }
  const ok = deleteInstance(name);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

// === POST /:name/probe ======================================================
adaptersRouter.post("/:name/probe", async (req, res) => {
  const { name } = req.params;
  if (isReadOnlyName(name)) {
    return res.status(403).json({ error: `'${name}' is read-only` });
  }
  const row = getInstance(name);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.kind !== "spawn") {
    return res
      .status(400)
      .json({ error: "only spawn-kind adapters can be probed in this release" });
  }
  if (!row.command) {
    return res.status(400).json({ error: "command is required" });
  }
  const probe = await probeAcp({
    command: row.command,
    args: row.args,
    env: row.env,
    cwd: row.default_cwd ?? undefined,
  });
  if (probe.ok) {
    setStatus(name, "ok", null);
    const { ok: _ok, ...rest } = probe;
    void _ok;
    return res.json({ ok: true, ...rest });
  }
  setStatus(name, "error", probe.error);
  res.status(502).json({ ok: false, error: probe.error });
});

// === POST /:name/enable =====================================================
adaptersRouter.post("/:name/enable", async (req, res) => {
  const { name } = req.params;
  if (isReadOnlyName(name)) {
    return res.status(403).json({ error: `'${name}' is read-only` });
  }
  const row = getInstance(name);
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.kind !== "spawn" || !row.command) {
    return res.status(400).json({ error: "adapter is not configured for spawn mode" });
  }
  // Always probe first — enabling something unhealthy is worse than refusing.
  const probe = await probeAcp({
    command: row.command,
    args: row.args,
    env: row.env,
    cwd: row.default_cwd ?? undefined,
  });
  if (!probe.ok) {
    setStatus(name, "error", probe.error);
    return res.status(502).json({ ok: false, error: probe.error });
  }
  try {
    const adapter = buildAdapterFromRow(row);
    registerAdapter(name, adapter, {
      kind: row.kind,
      source: "db",
      catalog_id: row.catalog_id ?? undefined,
    });
    setEnabled(name, true);
    setStatus(name, "ok", null);
    const { ok: _ok2, ...probeRest } = probe;
    void _ok2;
    res.json({ ok: true, ...probeRest, enabled: true });
  } catch (err) {
    setStatus(name, "error", (err as Error).message);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

// === POST /:name/disable ====================================================
adaptersRouter.post("/:name/disable", (req, res) => {
  const { name } = req.params;
  if (isReadOnlyName(name)) {
    return res.status(403).json({ error: `'${name}' is read-only` });
  }
  const row = getInstance(name);
  if (!row) return res.status(404).json({ error: "not found" });
  unregisterAdapter(name);
  setEnabled(name, false);
  res.json({ ok: true });
});

