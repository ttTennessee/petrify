// 直接收编 server/src/routes/workflows.ts 和 routes/verification.ts 中
// 与 workflows 表相关的 inline SQL,语句原样不动。

import type Database from "better-sqlite3";
import type { WorkflowRow, WorkflowsRepo } from "@petrify/db-core";

export function createWorkflowsRepo(db: Database.Database): WorkflowsRepo {
  const insertStmt = db.prepare(
    `INSERT INTO workflows (id, project_id, graph_json, created_at)
     VALUES (@id, @project_id, @graph_json, @created_at)`,
  );

  const updateGraphStmt = db.prepare(
    `UPDATE workflows SET graph_json = @graph_json WHERE id = @id`,
  );

  const updateVerifyStmt = db.prepare(
    `UPDATE workflows SET last_verify_json = ? WHERE id = ?`,
  );

  const getByIdStmt = db.prepare(`SELECT * FROM workflows WHERE id = ?`);
  const getGraphByIdStmt = db.prepare(
    `SELECT id, graph_json FROM workflows WHERE id = ?`,
  );
  const listByProjectStmt = db.prepare(
    `SELECT id, created_at FROM workflows WHERE project_id = ? ORDER BY created_at DESC`,
  );

  return {
    async insert(row) {
      insertStmt.run(row);
    },
    getById(id) {
      return getByIdStmt.get(id) as WorkflowRow | undefined;
    },
    getGraphById(id) {
      return getGraphByIdStmt.get(id) as
        | { id: string; graph_json: string }
        | undefined;
    },
    listByProject(projectId) {
      return listByProjectStmt.all(projectId) as Array<
        Pick<WorkflowRow, "id" | "created_at">
      >;
    },
    async updateGraph(id, graphJson) {
      updateGraphStmt.run({ id, graph_json: graphJson });
    },
    async updateVerify(id, lastVerifyJson) {
      updateVerifyStmt.run(lastVerifyJson, id);
    },
  };
}
