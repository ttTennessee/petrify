import { EventEmitter } from "node:events";
import type { RuntimeEvent } from "@petrify/shared";
import { dbContext } from "../db-context.js";

class EventBus extends EventEmitter {
  /**
   * 订阅者用 EventEmitter 同步派发,所以 emit 必须立刻发生(测试 / WS 客户端
   * 都依赖 publish 之后事件马上可见)。持久化在 pearl backend 下是 async
   * (写队列串行化),不让它阻塞 emit;失败只记日志。
   */
  publish(ev: RuntimeEvent): void {
    this.emit(ev.run_id, ev);
    this.emit("*", ev);
    void dbContext.runEvents
      .append({
        event_id: ev.event_id,
        run_id: ev.run_id,
        node_id: ev.node_id,
        type: ev.type,
        payload_json: JSON.stringify(ev.payload ?? {}),
        ts: ev.timestamp,
      })
      .catch((err) => {
        console.error("[petrify] runEvents.append failed", err);
      });
  }

  subscribe(runId: string, handler: (ev: RuntimeEvent) => void): () => void {
    this.on(runId, handler);
    return () => this.off(runId, handler);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(0);

export function listEvents(runId: string, sinceId = 0): RuntimeEvent[] {
  const rows = dbContext.runEvents.listSince(runId, sinceId);
  return rows.map((r) => ({
    event_id: r.event_id,
    run_id: r.run_id,
    node_id: r.node_id,
    type: r.type as RuntimeEvent["type"],
    timestamp: r.ts,
    payload: JSON.parse(r.payload_json),
  }));
}
