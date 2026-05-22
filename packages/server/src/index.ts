import "./telemetry.js";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { projectsRouter } from "./routes/projects.js";
import { workflowsRouter } from "./routes/workflows.js";
import { runsRouter } from "./routes/runs.js";
import { breakpointsRouter } from "./routes/breakpoints.js";
import { verificationRouter } from "./routes/verification.js";
import { templatesRouter } from "./routes/templates.js";
import { adaptersRouter } from "./routes/adapters.js";
import { configRouter } from "./routes/config.js";
import { mcpRouter } from "./routes/mcp.js";
import { eventBus } from "./runtime/events.js";
import { registerAdapter, listAdapterEntries } from "./adapters/registry.js";
import { MockAdapter } from "./adapters/mock.js";
import { AcpAdapter } from "./adapters/acp/index.js";
import { permissionBroker } from "./adapters/acp/permission-broker.js";
import { restoreEnabledAdapters } from "./adapters/persistence.js";
import { seedExampleTemplates } from "./templates/seed.js";
import { dbContext, dbBackend } from "./db-context.js";
import { shutdownTelemetry } from "./telemetry.js";

console.log(`[petrify] db backend: ${dbBackend}`);

registerAdapter("mock", new MockAdapter(), { source: "builtin", kind: "builtin" });

const acpCmd = process.env.PETRIFY_ACP_CMD;
if (acpCmd && acpCmd.trim().length > 0) {
  const [command, ...args] = acpCmd.trim().split(/\s+/);
  registerAdapter("acp", new AcpAdapter({
    command: command!,
    args,
    instanceName: "acp",
    onPermission: (ctx) => permissionBroker.request(ctx),
  }), {
    source: "env",
    kind: "spawn",
  });
  console.log(`[petrify] acp adapter registered (command: ${acpCmd})`);
}

restoreEnabledAdapters();
seedExampleTemplates();

const app = express();

// CORS allowlist — wildcard removed so the sidecar refuses random web origins.
// Defaults to the Vite dev origin; production / Tauri sidecar must pass an
// explicit comma-separated list via PETRIFY_CORS_ORIGIN.
const corsOrigins = (process.env.PETRIFY_CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, adapters: listAdapterEntries() });
});

app.use("/api/projects", projectsRouter);
app.use("/api", workflowsRouter);
app.use("/api", runsRouter);
app.use("/api", breakpointsRouter);
app.use("/api", verificationRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/adapters", adaptersRouter);
app.use("/api/config", configRouter);
app.use("/api/mcp-servers", mcpRouter);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const match = url.pathname.match(/^\/ws\/runs\/([^/]+)$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const runId = match[1]!;
  wss.handleUpgrade(req, socket, head, (ws) => {
    const unsub = eventBus.subscribe(runId, (ev) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ev));
    });
    ws.on("close", unsub);
  });
});

// PORT=0 lets the OS pick a free port — required for Tauri sidecar mode,
// where the parent process needs to read the actual port from stdout.
const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.PETRIFY_HOST ?? "127.0.0.1";

server.listen(PORT, HOST, () => {
  const addr = server.address() as AddressInfo;
  // Single-line machine-readable announce so a parent process (Tauri) can
  // grep stdout for {"event":"ready",...} and learn the dynamic port.
  console.log(JSON.stringify({ event: "ready", host: HOST, port: addr.port }));
  console.log(`[petrify] server listening on ${HOST}:${addr.port}`);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[petrify] received ${signal}, shutting down`);
  await new Promise<void>((r) => server.close(() => r()));
  for (const client of wss.clients) {
    try { client.terminate(); } catch { /* ignore */ }
  }
  await new Promise<void>((r) => wss.close(() => r()));
  try {
    dbContext.close();
  } catch {
    /* ignore */
  }
  await shutdownTelemetry();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
