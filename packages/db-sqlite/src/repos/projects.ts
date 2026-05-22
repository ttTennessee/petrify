// Projects Repo —— Drizzle 实现。
//
// 收编 server/src/routes/projects.ts、routes/templates.ts、runtime/test-helpers.ts
// 中针对 projects 表的 SQL。

import { desc, eq } from "drizzle-orm";
import type { ProjectRow, ProjectsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { projects } from "../schema.js";

export function createProjectsRepo(d: DrizzleDb): ProjectsRepo {
  return {
    existsById(id) {
      const r = d
        .select({ one: projects.id })
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      return r !== undefined;
    },

    insert(row) {
      d.insert(projects)
        .values({
          id: row.id,
          goal: row.goal,
          description: row.description,
          constraints_json: row.constraints_json,
          preferred_tools_json: row.preferred_tools_json,
          runtime_policy_json: row.runtime_policy_json,
          status: row.status,
          created_at: row.created_at,
        })
        .run();
    },

    list() {
      return d
        .select({
          id: projects.id,
          goal: projects.goal,
          description: projects.description,
          status: projects.status,
          created_at: projects.created_at,
        })
        .from(projects)
        .orderBy(desc(projects.created_at))
        .all();
    },

    getById(id) {
      const r = d
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      return r as ProjectRow | undefined;
    },

    getGoalAndDescription(id) {
      const r = d
        .select({ goal: projects.goal, description: projects.description })
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      return r ?? undefined;
    },

    getRuntimePolicy(id) {
      const r = d
        .select({ runtime_policy_json: projects.runtime_policy_json })
        .from(projects)
        .where(eq(projects.id, id))
        .get();
      return r ?? undefined;
    },
  };
}
