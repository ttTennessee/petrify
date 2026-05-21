// PermissionGrants Repo —— Drizzle 实现。
//
// 收编 server/src/adapters/acp/permission-broker.ts、permission-broker.test.ts
// 中针对 permission_grants 表的 SQL。

import { and, eq, sql } from "drizzle-orm";
import type { PermissionGrantsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { permissionGrants } from "../schema.js";

export function createPermissionGrantsRepo(d: DrizzleDb): PermissionGrantsRepo {
  return {
    upsert(row) {
      d.insert(permissionGrants)
        .values({
          project_id: row.project_id,
          node_id: row.node_id,
          tool_kind: row.tool_kind,
          decision: row.decision,
          created_at: row.created_at,
        })
        .onConflictDoUpdate({
          target: [
            permissionGrants.project_id,
            permissionGrants.node_id,
            permissionGrants.tool_kind,
          ],
          set: {
            decision: sql`excluded.decision`,
            created_at: sql`excluded.created_at`,
          },
        })
        .run();
    },

    getDecision(projectId, nodeId, toolKind) {
      const r = d
        .select({ decision: permissionGrants.decision })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.project_id, projectId),
            eq(permissionGrants.node_id, nodeId),
            eq(permissionGrants.tool_kind, toolKind),
          ),
        )
        .get();
      return r?.decision;
    },

    deleteAll() {
      d.delete(permissionGrants).run();
    },
  };
}
