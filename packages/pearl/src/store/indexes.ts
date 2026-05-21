// 内存索引 + 事件折叠(entity 物化视图)
//
// 当前 entity 状态 = 历史事件的 fold,但物化一份以加速读。
// 事件流仍是事实源:重启时清空索引,replay 全部 events 重建。

import type { Attrs, Entity, Event, MatchWhere, Value } from "../types.js";

export class Indexes {
  /** 全库单调递增的 seq 上限(已应用过的最大 seq)。 */
  lastSeq = 0;

  private readonly byId = new Map<string, Entity>();
  private readonly byType = new Map<string, Set<string>>();
  private readonly eventsByEntity = new Map<string, Event[]>();

  /** 应用一个事件:折叠 entity 状态 + 落入索引。 */
  apply(event: Event): void {
    if (event.seq <= this.lastSeq) {
      throw new Error(
        `Indexes.apply: out-of-order event seq=${event.seq} (lastSeq=${this.lastSeq})`,
      );
    }
    this.lastSeq = event.seq;

    // 1) 追加到 entity 的事件流(按 seq 升序)
    const list = this.eventsByEntity.get(event.entityId);
    if (list) list.push(event);
    else this.eventsByEntity.set(event.entityId, [event]);

    // 2) 折叠 entity 物化视图
    this.fold(event);
  }

  private fold(event: Event): void {
    const existing = this.byId.get(event.entityId);

    switch (event.type) {
      case "Created": {
        // payload = { entityType: string, attrs?: Attrs }
        const entityType = asString(event.payload["entityType"]);
        if (entityType === null) {
          throw new Error(
            `Created event missing entityType (entityId=${event.entityId})`,
          );
        }
        const initialAttrs = (event.payload["attrs"] as Attrs | undefined) ?? {};
        const entity: Entity = {
          id: event.entityId,
          type: entityType,
          attrs: { ...initialAttrs },
          version: event.seq,
          createdAt: event.ts,
          updatedAt: event.ts,
        };
        this.byId.set(entity.id, entity);
        this.addToTypeIndex(entity.type, entity.id);
        return;
      }
      case "AttrSet": {
        if (!existing) return; // 静默忽略孤儿事件;W2 加严格校验
        Object.assign(existing.attrs, event.payload);
        existing.version = event.seq;
        existing.updatedAt = event.ts;
        return;
      }
      case "AttrUnset": {
        if (!existing) return;
        const keys = event.payload["keys"];
        if (Array.isArray(keys)) {
          for (const k of keys) {
            if (typeof k === "string") delete existing.attrs[k];
          }
        }
        existing.version = event.seq;
        existing.updatedAt = event.ts;
        return;
      }
      case "Deleted": {
        if (!existing) return;
        existing.deleted = true;
        existing.version = event.seq;
        existing.updatedAt = event.ts;
        this.removeFromTypeIndex(existing.type, existing.id);
        return;
      }
      default: {
        // 自定义事件:仅推进 version/updatedAt,不改 attrs
        if (!existing) return;
        existing.version = event.seq;
        existing.updatedAt = event.ts;
      }
    }
  }

  get(id: string): Entity | undefined {
    const e = this.byId.get(id);
    if (!e || e.deleted) return undefined;
    return e;
  }

  match(type: string, where?: MatchWhere): Entity[] {
    const ids = this.byType.get(type);
    if (!ids) return [];
    const out: Entity[] = [];
    for (const id of ids) {
      const e = this.byId.get(id);
      if (!e || e.deleted) continue;
      if (where && !matchWhere(e.attrs, where)) continue;
      out.push(e);
    }
    return out;
  }

  eventsFor(entityId: string): readonly Event[] {
    return this.eventsByEntity.get(entityId) ?? [];
  }

  private addToTypeIndex(type: string, id: string): void {
    const set = this.byType.get(type);
    if (set) set.add(id);
    else this.byType.set(type, new Set([id]));
  }

  private removeFromTypeIndex(type: string, id: string): void {
    const set = this.byType.get(type);
    if (set) set.delete(id);
  }
}

function asString(v: Value | undefined): string | null {
  return typeof v === "string" ? v : null;
}

function matchWhere(attrs: Attrs, where: MatchWhere): boolean {
  for (const key of Object.keys(where)) {
    if (!deepEqual(attrs[key], where[key])) return false;
  }
  return true;
}

function deepEqual(a: Value | undefined, b: Value | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, Value>;
    const bo = b as Record<string, Value>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!deepEqual(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}
