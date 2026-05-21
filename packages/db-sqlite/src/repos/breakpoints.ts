// Breakpoints Repo —— Drizzle 实现。
//
// 收编 server/src/routes/breakpoints.ts、runtime/scheduler.ts 中针对 breakpoints
// 表的 SQL。

import { and, asc, eq } from "drizzle-orm";
import type { BreakpointRow, BreakpointsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { breakpoints } from "../schema.js";

export function createBreakpointsRepo(d: DrizzleDb): BreakpointsRepo {
  return {
    listByWorkflow(workflowId) {
      return d
        .select()
        .from(breakpoints)
        .where(eq(breakpoints.workflow_id, workflowId))
        .orderBy(asc(breakpoints.created_at))
        .all() as BreakpointRow[];
    },

    findByWorkflowAndNode(workflowId, nodeId) {
      const r = d
        .select()
        .from(breakpoints)
        .where(
          and(
            eq(breakpoints.workflow_id, workflowId),
            eq(breakpoints.node_id, nodeId),
          ),
        )
        .get();
      return r as BreakpointRow | undefined;
    },

    insert(row) {
      d.insert(breakpoints)
        .values({
          id: row.id,
          workflow_id: row.workflow_id,
          node_id: row.node_id,
          enabled: row.enabled,
          created_at: row.created_at,
        })
        .run();
    },

    setEnabled(id, enabled) {
      d.update(breakpoints)
        .set({ enabled })
        .where(eq(breakpoints.id, id))
        .run();
    },

    deleteByWorkflowAndNode(workflowId, nodeId) {
      const info = d
        .delete(breakpoints)
        .where(
          and(
            eq(breakpoints.workflow_id, workflowId),
            eq(breakpoints.node_id, nodeId),
          ),
        )
        .run();
      return { changes: info.changes };
    },

    hasEnabled(workflowId, nodeId) {
      const r = d
        .select({ one: breakpoints.id })
        .from(breakpoints)
        .where(
          and(
            eq(breakpoints.workflow_id, workflowId),
            eq(breakpoints.node_id, nodeId),
            eq(breakpoints.enabled, 1),
          ),
        )
        .limit(1)
        .get();
      return r !== undefined;
    },
  };
}
