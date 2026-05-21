import type Database from "better-sqlite3";
import type { ProjectsRepo } from "@petrify/db-core";

export function createProjectsRepo(db: Database.Database): ProjectsRepo {
  const existsByIdStmt = db.prepare(`SELECT 1 FROM projects WHERE id = ?`);

  return {
    existsById(id) {
      return existsByIdStmt.get(id) !== undefined;
    },
  };
}
