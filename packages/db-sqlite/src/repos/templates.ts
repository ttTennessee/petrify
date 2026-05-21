// Templates Repo —— Drizzle 实现。
//
// 收编 server/src/routes/templates.ts、templates/seed.ts 中针对 templates
// 表的 SQL。

import { desc, eq } from "drizzle-orm";
import type { TemplateRow, TemplatesRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { templates } from "../schema.js";

export function createTemplatesRepo(d: DrizzleDb): TemplatesRepo {
  return {
    list() {
      return d
        .select()
        .from(templates)
        .orderBy(desc(templates.updated_at))
        .all() as TemplateRow[];
    },

    getById(id) {
      const r = d
        .select()
        .from(templates)
        .where(eq(templates.id, id))
        .get();
      return r as TemplateRow | undefined;
    },

    findByName(name) {
      const r = d
        .select({ id: templates.id })
        .from(templates)
        .where(eq(templates.name, name))
        .get();
      return r ?? undefined;
    },

    insert(row) {
      d.insert(templates)
        .values({
          id: row.id,
          name: row.name,
          description: row.description,
          tags_json: row.tags_json,
          graph_json: row.graph_json,
          runtime_policy_json: row.runtime_policy_json,
          adapter_bindings_json: row.adapter_bindings_json,
          source_workflow_id: row.source_workflow_id,
          origin: row.origin,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })
        .run();
    },

    deleteById(id) {
      const info = d.delete(templates).where(eq(templates.id, id)).run();
      return { changes: info.changes };
    },
  };
}
