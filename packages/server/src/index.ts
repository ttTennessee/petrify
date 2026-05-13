import "./telemetry.js";
import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import { projectsRouter } from "./routes/projects.js";
import { workflowsRouter } from "./routes/workflows.js";
import { runsRouter } from "./routes/runs.js";
import { verificationRouter } from "./routes/verification.js";
import { templatesRouter } from "./routes/templates.js";
import { eventBus } from "./runtime/events.js";
import { registerAdapter, listAdapters } from "./adapters/registry.js";
import { MockAdapter } from "./adapters/mock.js";
import { AcpAdapter } from "./adapters/acp.js";
import { seedExampleTemplates } from "./templates/seed.js";

registerAdapter("mock", new MockAdapter());

const acpCmd = process.env.PETRIFY_ACP_CMD;
if (acpCmd && acpCmd.trim().length > 0) {
  const [command, ...args] = acpCmd.trim().split(/\s+/);
  registerAdapter("acp", new AcpAdapter({ command: command!, args }));
  console.log(`[petrify] acp adapter registered (command: ${acpCmd})`);
}

seedExampleTemplates();

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, adapters: listAdapters() });
});

app.use("/api/projects", projectsRouter);
app.use("/api", workflowsRouter);
app.use("/api", runsRouter);
app.use("/api", verificationRouter);
app.use("/api/templates", templatesRouter);

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

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
  console.log(`[petrify] server listening on :${PORT}`);
});
