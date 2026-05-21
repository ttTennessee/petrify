// run_events:append-only,SQL 端用 INTEGER AUTOINCREMENT 当 id;pearl 端用
// 每条事件 entity 的 createdAt+seq 派生。本次脚手架阶段保持简单 ——
// 每条 run-event 落成一条 type:"run_event" 实体,id 用 pearl 分配的 entity id;
// listSince 的"自增 id"语义用 pearl 的 entity.version (= seq) 实现。

import { nanoid } from "nanoid";
import type { Pearl } from "@petrify/pearl";
import type { RunEventRow, RunEventsRepo } from "@petrify/db-core";

const TYPE = "run_event";
const RUN_EDGE = "of_run";

export function createRunEventsRepo(pearl: Pearl): RunEventsRepo {
  return {
    async append(row) {
      const entityId = nanoid();
      await pearl.commit({
        events: [
          {
            entityId,
            type: "Created",
            payload: {
              entityType: TYPE,
              attrs: {
                event_id: row.event_id,
                run_id: row.run_id,
                node_id: row.node_id,
                type: row.type,
                payload_json: row.payload_json,
                ts: row.ts,
              },
            },
          },
        ],
        edges: {
          add: [{ from: entityId, to: row.run_id, type: RUN_EDGE }],
        },
      });
    },

    listSince(runId, sinceId = 0) {
      // 反向遍历 of_run 拿到属于该 run 的全部事件实体。
      const events = pearl.traverse(runId, {
        direction: "in",
        edgeType: RUN_EDGE,
      });
      return events
        .filter((e) => e.type === TYPE && !e.deleted && e.version > sinceId)
        .map((e) => ({
          id: e.version, // 用 pearl seq 作为"自增 id"
          event_id: String(e.attrs["event_id"] ?? ""),
          run_id: String(e.attrs["run_id"] ?? ""),
          node_id:
            e.attrs["node_id"] == null ? null : String(e.attrs["node_id"]),
          type: String(e.attrs["type"] ?? ""),
          payload_json: String(e.attrs["payload_json"] ?? ""),
          ts: Number(e.attrs["ts"] ?? 0),
        }))
        .sort((a, b) => a.id - b.id);
    },
  };
}
