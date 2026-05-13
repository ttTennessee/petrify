import { EventEmitter } from "node:events";
import type { RuntimeEvent } from "@petrify/shared";
import { db } from "../db.js";

const insertEvent = db.prepare(
  `INSERT INTO run_events (event_id, run_id, node_id, type, payload_json, ts)
   VALUES (@event_id, @run_id, @node_id, @type, @payload_json, @ts)`,
);

class EventBus extends EventEmitter {
  publish(ev: RuntimeEvent): void {
    insertEvent.run({
      event_id: ev.event_id,
      run_id: ev.run_id,
      node_id: ev.node_id,
      type: ev.type,
      payload_json: JSON.stringify(ev.payload ?? {}),
      ts: ev.timestamp,
    });
    this.emit(ev.run_id, ev);
    this.emit("*", ev);
  }

  subscribe(runId: string, handler: (ev: RuntimeEvent) => void): () => void {
    this.on(runId, handler);
    return () => this.off(runId, handler);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(0);

export function listEvents(runId: string, sinceId = 0): RuntimeEvent[] {
  const rows = db
    .prepare(
      `SELECT event_id, run_id, node_id, type, payload_json, ts, id
       FROM run_events WHERE run_id = ? AND id > ? ORDER BY id ASC`,
    )
    .all(runId, sinceId) as Array<{
    event_id: string;
    run_id: string;
    node_id: string | null;
    type: string;
    payload_json: string;
    ts: number;
  }>;
  return rows.map((r) => ({
    event_id: r.event_id,
    run_id: r.run_id,
    node_id: r.node_id,
    type: r.type as RuntimeEvent["type"],
    timestamp: r.ts,
    payload: JSON.parse(r.payload_json),
  }));
}
