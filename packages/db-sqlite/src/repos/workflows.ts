// Workflows Repo —— Drizzle 实现。
//
// 收编 server/src/routes/workflows.ts、routes/verification.ts、routes/runs.ts、
// routes/templates.ts、adapters/acp/permission-broker.test.ts 中针对 workflows
// 表的 SQL。

import { eq, desc } from "drizzle-orm";
import type { WorkflowRow, WorkflowsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { workflows } from "../schema.js";

export function createWorkflowsRepo(d: DrizzleDb): WorkflowsRepo {
  return {
    async insert(row) {
      d.insert(workflows)
        .values({
          id: row.id,
          project_id: row.project_id,
          graph_json: row.graph_json,
          created_at: row.created_at,
        })
        .run();
    },

    getById(id) {
      const r = d
        .select()
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r as WorkflowRow | undefined;
    },

    getGraphById(id) {
      const r = d
        .select({ id: workflows.id, graph_json: workflows.graph_json })
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r ?? undefined;
    },

    listByProject(projectId) {
      return d
        .select({ id: workflows.id, created_at: workflows.created_at })
        .from(workflows)
        .where(eq(workflows.project_id, projectId))
        .orderBy(desc(workflows.created_at))
        .all();
    },

    async updateGraph(id, graphJson) {
      d.update(workflows)
        .set({ graph_json: graphJson })
        .where(eq(workflows.id, id))
        .run();
    },

    async updateVerify(id, lastVerifyJson) {
      d.update(workflows)
        .set({ last_verify_json: lastVerifyJson })
        .where(eq(workflows.id, id))
        .run();
    },

    getProjectId(id) {
      const r = d
        .select({ project_id: workflows.project_id })
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r ?? undefined;
    },

    getGraphAndVerify(id) {
      const r = d
        .select({
          graph_json: workflows.graph_json,
          last_verify_json: workflows.last_verify_json,
        })
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r ?? undefined;
    },

    getLastVerify(id) {
      const r = d
        .select({ last_verify_json: workflows.last_verify_json })
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r ?? undefined;
    },

    getForTemplate(id) {
      const r = d
        .select({
          id: workflows.id,
          project_id: workflows.project_id,
          graph_json: workflows.graph_json,
        })
        .from(workflows)
        .where(eq(workflows.id, id))
        .get();
      return r ?? undefined;
    },
  };
}
