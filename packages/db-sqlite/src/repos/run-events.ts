// 收编 server/src/runtime/events.ts 中针对 run_events 表的 inline SQL。

import type Database from "better-sqlite3";
import type { RunEventRow, RunEventsRepo } from "@petrify/db-core";

export function createRunEventsRepo(db: Database.Database): RunEventsRepo {
  const appendStmt = db.prepare(
    `INSERT INTO run_events (event_id, run_id, node_id, type, payload_json, ts)
     VALUES (@event_id, @run_id, @node_id, @type, @payload_json, @ts)`,
  );

  const listSinceStmt = db.prepare(
    `SELECT id, event_id, run_id, node_id, type, payload_json, ts
     FROM run_events WHERE run_id = ? AND id > ? ORDER BY id ASC`,
  );

  return {
    async append(row) {
      appendStmt.run({
        event_id: row.event_id,
        run_id: row.run_id,
        node_id: row.node_id,
        type: row.type,
        payload_json: row.payload_json,
        ts: row.ts,
      });
    },
    listSince(runId, sinceId = 0) {
      return listSinceStmt.all(runId, sinceId) as Array<
        RunEventRow & { id: number }
      >;
    },
  };
}
