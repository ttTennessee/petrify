// RunEvents Repo —— Drizzle 实现。
//
// 收编 server/src/runtime/events.ts、runtime/test-helpers.ts 中针对 run_events
// 表的 SQL。

import { and, asc, eq, gt } from "drizzle-orm";
import type { RunEventRow, RunEventsRepo } from "@petrify/db-core";

import type { DrizzleDb } from "../db.js";
import { runEvents } from "../schema.js";

export function createRunEventsRepo(d: DrizzleDb): RunEventsRepo {
  return {
    async append(row) {
      d.insert(runEvents)
        .values({
          event_id: row.event_id,
          run_id: row.run_id,
          node_id: row.node_id,
          type: row.type,
          payload_json: row.payload_json,
          ts: row.ts,
        })
        .run();
    },

    listSince(runId, sinceId = 0) {
      const rows = d
        .select()
        .from(runEvents)
        .where(and(eq(runEvents.run_id, runId), gt(runEvents.id, sinceId)))
        .orderBy(asc(runEvents.id))
        .all();
      // drizzle 推断 id 为 number(autoincrement),不会是 null。
      return rows as Array<RunEventRow & { id: number }>;
    },

    listTypesAndNodes(runId) {
      return d
        .select({ type: runEvents.type, node_id: runEvents.node_id })
        .from(runEvents)
        .where(eq(runEvents.run_id, runId))
        .orderBy(asc(runEvents.id))
        .all();
    },
  };
}
