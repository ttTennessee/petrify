import { Router } from "express";
import { nanoid } from "nanoid";
import type { Breakpoint } from "@petrify/shared";
import type { BreakpointRow } from "@petrify/db-core";
import { dbContext } from "../db-context.js";

export const breakpointsRouter = Router();

function rowToBreakpoint(r: BreakpointRow): Breakpoint {
  return {
    id: r.id,
    workflow_id: r.workflow_id,
    node_id: r.node_id,
    enabled: r.enabled === 1,
    created_at: r.created_at,
  };
}

breakpointsRouter.get("/workflows/:workflowId/breakpoints", (req, res) => {
  const rows = dbContext.breakpoints.listByWorkflow(req.params.workflowId);
  res.json(rows.map(rowToBreakpoint));
});

breakpointsRouter.put("/workflows/:workflowId/breakpoints/:nodeId", (req, res) => {
  const { workflowId, nodeId } = req.params;
  if (!dbContext.workflows.getById(workflowId)) {
    return res.status(404).json({ error: "workflow not found" });
  }

  const enabled = req.body?.enabled !== false; // default true
  const existing = dbContext.breakpoints.findByWorkflowAndNode(workflowId, nodeId);

  if (existing) {
    dbContext.breakpoints.setEnabled(existing.id, enabled ? 1 : 0);
    return res.json(
      rowToBreakpoint({ ...existing, enabled: enabled ? 1 : 0 }),
    );
  }

  const id = nanoid();
  const created_at = Date.now();
  dbContext.breakpoints.insert({
    id,
    workflow_id: workflowId,
    node_id: nodeId,
    enabled: enabled ? 1 : 0,
    created_at,
  });
  res
    .status(201)
    .json({ id, workflow_id: workflowId, node_id: nodeId, enabled, created_at });
});

breakpointsRouter.delete(
  "/workflows/:workflowId/breakpoints/:nodeId",
  (req, res) => {
    const info = dbContext.breakpoints.deleteByWorkflowAndNode(
      req.params.workflowId,
      req.params.nodeId,
    );
    res.json({ deleted: info.changes });
  },
);
