// 单写队列 + 意图边界 + shape 校验。
//
// 一次 commit 的写入顺序:
//   1. ShapeExtended(若有 drift,注册新 attr)
//   2. 用户事件(显式 events + 翻译自 edges.add/remove)
//   3. IntentCommitted(原子边界标记)
// 整批一次 writeSync 入盘,共享同一个 intentId。

import { nanoid } from "nanoid";

import type {
  Attrs,
  CommitIntent,
  CommitReceipt,
  Event,
  Primitive,
} from "../types.js";
import { IntentRejected, SYSTEM_ENTITY_ID } from "../types.js";
import type { EventLog } from "../store/log.js";
import type { Indexes } from "../store/indexes.js";
import type { DriftEntry } from "../schema/registry.js";
import { primitiveOf } from "../schema/registry.js";

type RawEvent = {
  entityId: string;
  type: string;
  payload: Attrs;
};

export class Writer {
  private tail: Promise<unknown> = Promise.resolve();
  private nextSeq: number;

  constructor(
    private readonly log: EventLog,
    private readonly indexes: Indexes,
    startSeq: number,
  ) {
    this.nextSeq = startSeq + 1;
  }

  commit(intent: CommitIntent): Promise<CommitReceipt> {
    const task = (): Promise<CommitReceipt> => this.runOne(intent);
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async runOne(intent: CommitIntent): Promise<CommitReceipt> {
    const userEvents = this.translate(intent);
    if (userEvents.length === 0) {
      throw new Error("commit: intent must contain at least one event or edge");
    }

    // 1) 收集每个 user event 的目标 entityType(用于 shape 校验)
    //    AttrSet 找已存在的 entity;Created 直接读 payload。
    //    在意图内部维护一个 "in-intent created entities" 临时表。
    const inIntentTypes = new Map<string, string>(); // entityId → entityType

    // 同一意图内的暂存 shape 扩展(避免重复 drift)
    const pendingExtensions = new Map<string, Map<string, Primitive>>(); // entityType → attr → primitive

    const driftAll: DriftEntry[] = [];

    for (const ue of userEvents) {
      let entityType: string | undefined;
      if (ue.type === "Created") {
        const t = ue.payload["entityType"];
        if (typeof t !== "string") {
          throw new IntentRejected("missing-entity-type", { entityId: ue.entityId });
        }
        entityType = t;
        inIntentTypes.set(ue.entityId, entityType);
      } else if (ue.type === "AttrSet") {
        entityType =
          inIntentTypes.get(ue.entityId) ??
          this.indexes.getRaw(ue.entityId)?.type;
        // 找不到 entity:跳过 shape 校验(apply 时也会静默 no-op)
      } else {
        continue; // 其它事件类型不参与 shape 校验
      }

      if (!entityType) continue;

      const attrsToCheck =
        ue.type === "Created"
          ? ((ue.payload["attrs"] as Attrs | undefined) ?? {})
          : ue.payload;

      // expectedShape 硬约束
      if (intent.expectedShape && intent.expectedShape[entityType]) {
        const allowed = intent.expectedShape[entityType]!;
        for (const [k, v] of Object.entries(attrsToCheck)) {
          const prim = primitiveOf(v);
          if (prim === null) continue;
          if (!(k in allowed)) {
            throw new IntentRejected("shape-not-allowed", {
              entityType,
              attr: k,
            });
          }
          if (allowed[k] !== prim) {
            throw new IntentRejected("shape-conflict", {
              entityType,
              attr: k,
              expected: allowed[k],
              actual: prim,
            });
          }
        }
      }

      let pending = pendingExtensions.get(entityType);
      if (!pending) {
        pending = new Map();
        pendingExtensions.set(entityType, pending);
      }

      const drift = this.indexes.shapes.validateOrThrow(
        entityType,
        attrsToCheck,
        pending,
      );
      driftAll.push(...drift);
    }

    // 2) 组装最终事件列表
    const intentId = nanoid();
    const ts = Date.now();
    const finalRaws: RawEvent[] = [];

    // 2a) ShapeExtended(去重:已 push 到 driftAll 的就是新的)
    const seenDrift = new Set<string>();
    for (const d of driftAll) {
      const key = `${d.entityType}|${d.attr}`;
      if (seenDrift.has(key)) continue;
      seenDrift.add(key);
      finalRaws.push({
        entityId: SYSTEM_ENTITY_ID,
        type: "ShapeExtended",
        payload: { entityType: d.entityType, attr: d.attr, primitive: d.primitive },
      });
    }

    // 2b) 用户事件
    const userStart = finalRaws.length;
    finalRaws.push(...userEvents);
    const userEnd = finalRaws.length;

    // 2c) IntentCommitted 边界
    finalRaws.push({
      entityId: SYSTEM_ENTITY_ID,
      type: "IntentCommitted",
      payload: {},
    });

    // 3) 分配 seq
    const events: Event[] = finalRaws.map((r) => ({
      id: nanoid(),
      seq: this.nextSeq++,
      entityId: r.entityId,
      type: r.type,
      payload: r.payload,
      ts,
      intentId,
    }));

    // 4) 落盘(整批 atomic append)
    this.log.append(events);
    // 5) 灌索引
    for (const ev of events) this.indexes.apply(ev);

    const userEventsWithSeq = events.slice(userStart, userEnd);
    return {
      intentId,
      fromSeq: userEventsWithSeq[0]!.seq,
      toSeq: userEventsWithSeq[userEventsWithSeq.length - 1]!.seq,
      count: userEventsWithSeq.length,
      driftAttrs: driftAll.filter((_, i, arr) => {
        const key = `${arr[i]!.entityType}|${arr[i]!.attr}`;
        return arr.findIndex((d) => `${d.entityType}|${d.attr}` === key) === i;
      }),
    };
  }

  /** 把 CommitIntent 翻译成用户事件列表(显式 events + edges 翻译)。 */
  private translate(intent: CommitIntent): RawEvent[] {
    const out: RawEvent[] = [];
    for (const e of intent.events ?? []) {
      out.push({
        entityId: e.entityId,
        type: e.type,
        payload: e.payload ?? {},
      });
    }
    for (const add of intent.edges?.add ?? []) {
      const payload: Attrs = { to: add.to, edgeType: add.type };
      if (add.attrs) payload["attrs"] = add.attrs;
      out.push({ entityId: add.from, type: "EdgeAdded", payload });
    }
    for (const rm of intent.edges?.remove ?? []) {
      out.push({
        entityId: rm.from,
        type: "EdgeRemoved",
        payload: { to: rm.to, edgeType: rm.type },
      });
    }
    return out;
  }
}
