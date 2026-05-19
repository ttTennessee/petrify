import { Router } from "express";
import { z } from "zod";
import {
  McpServerSpecSchema,
  type McpServerSpec,
} from "@petrify/shared";
import {
  createServer,
  deleteServer,
  getServer,
  listServers,
  patchServer,
  setEnabled,
} from "../services/mcp-servers.js";

export const mcpRouter = Router();

const NameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_.:-]+$/, "name must be [a-zA-Z0-9_.:-]+");

const CreateBodySchema = McpServerSpecSchema;
// PATCH allows changing transport-specific fields but NOT the name (rename
// would invalidate node.mcp_servers references — users delete & recreate).
const PatchBodySchema = z.union([
  z
    .object({
      transport: z.literal("stdio"),
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      env: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .default([]),
    })
    .partial({ args: true, env: true }),
  z
    .object({
      transport: z.literal("http"),
      url: z.string().url(),
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .default([]),
    })
    .partial({ headers: true }),
  z
    .object({
      transport: z.literal("sse"),
      url: z.string().url(),
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .default([]),
    })
    .partial({ headers: true }),
]);

mcpRouter.get("/", (_req, res) => {
  res.json(listServers());
});

mcpRouter.post("/", (req, res) => {
  const nameParse = NameSchema.safeParse((req.body as { name?: unknown })?.name);
  if (!nameParse.success) {
    return res.status(400).json({ error: "invalid name", issues: nameParse.error.issues });
  }
  const parsed = CreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  if (getServer(parsed.data.name)) {
    return res.status(409).json({ error: `mcp server '${parsed.data.name}' already exists` });
  }
  const spec = parsed.data as McpServerSpec;
  const row =
    spec.transport === "stdio"
      ? createServer({
          name: spec.name,
          transport: "stdio",
          command: spec.command,
          args: spec.args,
          env: spec.env,
        })
      : createServer({
          name: spec.name,
          transport: spec.transport,
          url: spec.url,
          headers: spec.headers,
        });
  res.status(201).json(row);
});

mcpRouter.patch("/:name", (req, res) => {
  const { name } = req.params;
  const existing = getServer(name);
  if (!existing) return res.status(404).json({ error: "not found" });
  const parsed = PatchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid input",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const updated = patchServer(name, parsed.data);
  // Editing forces disable (caller must re-enable).
  setEnabled(name, false);
  res.json(updated);
});

mcpRouter.delete("/:name", (req, res) => {
  const ok = deleteServer(req.params.name);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

mcpRouter.post("/:name/enable", (req, res) => {
  const row = getServer(req.params.name);
  if (!row) return res.status(404).json({ error: "not found" });
  setEnabled(row.name, true);
  res.json({ ok: true, enabled: true });
});

mcpRouter.post("/:name/disable", (req, res) => {
  const row = getServer(req.params.name);
  if (!row) return res.status(404).json({ error: "not found" });
  setEnabled(row.name, false);
  res.json({ ok: true, enabled: false });
});
