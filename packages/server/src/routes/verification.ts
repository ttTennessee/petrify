import { Router } from "express";
import { db } from "../db.js";
import { verifyWorkflow } from "../runtime/petri/verify.js";
import { dryRun } from "../runtime/petri/dry-run.js";
import { compilePetri } from "../runtime/petri/compile.js";
import { WorkflowGraphSchema } from "@petrify/shared";

export const verificationRouter = Router();

function loadGraph(workflowId: string) {
  const row = db
    .prepare(`SELECT graph_json FROM workflows WHERE id = ?`)
    .get(workflowId) as { graph_json: string } | undefined;
  if (!row) return null;
  return WorkflowGraphSchema.parse(JSON.parse(row.graph_json));
}

verificationRouter.post("/workflows/:id/verify", (req, res) => {
  const graph = loadGraph(req.params.id);
  if (!graph) return res.status(404).json({ error: "workflow not found" });
  const report = verifyWorkflow(graph);
  db.prepare(`UPDATE workflows SET last_verify_json = ? WHERE id = ?`).run(
    JSON.stringify(report),
    req.params.id,
  );
  res.json(report);
});

verificationRouter.get("/workflows/:id/verify", (req, res) => {
  const row = db
    .prepare(`SELECT last_verify_json FROM workflows WHERE id = ?`)
    .get(req.params.id) as { last_verify_json: string | null } | undefined;
  if (!row) return res.status(404).json({ error: "workflow not found" });
  if (!row.last_verify_json) return res.json(null);
  res.json(JSON.parse(row.last_verify_json));
});

verificationRouter.post("/workflows/:id/dry-run", (req, res) => {
  const graph = loadGraph(req.params.id);
  if (!graph) return res.status(404).json({ error: "workflow not found" });
  res.json(dryRun(graph));
});

verificationRouter.get("/workflows/:id/petri", (req, res) => {
  // Useful for debugging — returns the raw Petri compilation result.
  const graph = loadGraph(req.params.id);
  if (!graph) return res.status(404).json({ error: "workflow not found" });
  const compiled = compilePetri(graph);
  res.json({
    net: compiled.net,
    initialMarking: compiled.initialMarking,
  });
});
