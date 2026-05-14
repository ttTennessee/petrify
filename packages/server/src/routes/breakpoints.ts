import { Router } from "express";
import { nanoid } from "nanoid";
import type { Breakpoint } from "@petrify/shared";
import { db } from "../db.js";

export const breakpointsRouter = Router();

interface BreakpointRow {
  id: string;
  workflow_id: string;
  node_id: string;
  enabled: number;
  created_at: number;
}

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
  const rows = db
    .prepare(
      `SELECT id, workflow_id, node_id, enabled, created_at FROM breakpoints
       WHERE workflow_id = ? ORDER BY created_at ASC`,
    )
    .all(req.params.workflowId) as BreakpointRow[];
  res.json(rows.map(rowToBreakpoint));
});

breakpointsRouter.put("/workflows/:workflowId/breakpoints/:nodeId", (req, res) => {
  const { workflowId, nodeId } = req.params;
  const wf = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(workflowId);
  if (!wf) return res.status(404).json({ error: "workflow not found" });

  const enabled = req.body?.enabled !== false; // default true
  const existing = db
    .prepare(
      `SELECT id, workflow_id, node_id, enabled, created_at FROM breakpoints
       WHERE workflow_id = ? AND node_id = ?`,
    )
    .get(workflowId, nodeId) as BreakpointRow | undefined;

  if (existing) {
    db.prepare(`UPDATE breakpoints SET enabled = ? WHERE id = ?`).run(
      enabled ? 1 : 0,
      existing.id,
    );
    return res.json(
      rowToBreakpoint({ ...existing, enabled: enabled ? 1 : 0 }),
    );
  }

  const id = nanoid();
  const created_at = Date.now();
  db.prepare(
    `INSERT INTO breakpoints (id, workflow_id, node_id, enabled, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, workflowId, nodeId, enabled ? 1 : 0, created_at);
  res
    .status(201)
    .json({ id, workflow_id: workflowId, node_id: nodeId, enabled, created_at });
});

breakpointsRouter.delete(
  "/workflows/:workflowId/breakpoints/:nodeId",
  (req, res) => {
    const info = db
      .prepare(
        `DELETE FROM breakpoints WHERE workflow_id = ? AND node_id = ?`,
      )
      .run(req.params.workflowId, req.params.nodeId);
    res.json({ deleted: info.changes });
  },
);
