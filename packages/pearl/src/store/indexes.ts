// 内存索引 + 事件折叠 + Edge 索引 + 时间旅行。
//
// 一切都是事件流的派生:重启时清空索引,replay 全部事件重建。

import type {
  Attrs,
  Edge,
  Entity,
  Event,
  HistoryOptions,
  MatchWhere,
  Primitive,
  TraverseOptions,
  Value,
} from "../types.js";
import { SYSTEM_ENTITY_ID } from "../types.js";
import { ShapeRegistry } from "../schema/registry.js";

export class Indexes {
  /** 已应用过的最大 seq(含系统事件)。 */
  lastSeq = 0;

  private readonly byId = new Map<string, Entity>();
  private readonly byType = new Map<string, Set<string>>();
  private readonly eventsByEntity = new Map<string, Event[]>();

  // Edge 索引:每条 edge 是一个不可变记录,删除靠 deletedBySeq 软标。
  private readonly edgesOut = new Map<string, Edge[]>();
  private readonly edgesIn = new Map<string, Edge[]>();

  readonly shapes = new ShapeRegistry();

  /** 应用一个事件:折叠 entity 状态 + 落入索引。 */
  apply(event: Event): void {
    if (event.seq <= this.lastSeq) {
      throw new Error(
        `Indexes.apply: out-of-order event seq=${event.seq} (lastSeq=${this.lastSeq})`,
      );
    }
    this.lastSeq = event.seq;

    // IntentCommitted 是边界标记,不进 eventsByEntity 也不改任何状态
    if (event.type === "IntentCommitted") return;

    // 系统事件(ShapeExtended)只更新 registry,不进 entity 流
    if (event.entityId === SYSTEM_ENTITY_ID) {
      if (event.type === "ShapeExtended") {
        const entityType = asString(event.payload["entityType"]);
        const attr = asString(event.payload["attr"]);
        const primitive = asString(event.payload["primitive"]) as Primitive | null;
        if (entityType && attr && primitive) {
          this.shapes.applyExtended(entityType, attr, primitive);
        }
      }
      return;
    }

    // entity-bound 事件:记录到事件流
    const list = this.eventsByEntity.get(event.entityId);
    if (list) list.push(event);
    else this.eventsByEntity.set(event.entityId, [event]);

    // 折叠
    this.fold(event);
  }

  private fold(event: Event): void {
    const existing = this.byId.get(event.entityId);
    switch (event.type) {
      case "Created": {
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
        if (!existing) return;
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
      case "EdgeAdded": {
        const to = asString(event.payload["to"]);
        const edgeType = asString(event.payload["edgeType"]);
        if (!to || !edgeType) return;
        const edge: Edge = {
          from: event.entityId,
          to,
          type: edgeType,
          attrs: (event.payload["attrs"] as Attrs | undefined) ?? undefined,
          createdBySeq: event.seq,
        };
        pushEdge(this.edgesOut, edge.from, edge);
        pushEdge(this.edgesIn, edge.to, edge);
        return;
      }
      case "EdgeRemoved": {
        const to = asString(event.payload["to"]);
        const edgeType = asString(event.payload["edgeType"]);
        if (!to || !edgeType) return;
        markEdgeDeleted(this.edgesOut, event.entityId, to, edgeType, event.seq);
        markEdgeDeleted(this.edgesIn, to, event.entityId, edgeType, event.seq);
        return;
      }
      default: {
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

  /** 内部直查(允许返回已删 entity,供 history/at 使用)。 */
  getRaw(id: string): Entity | undefined {
    return this.byId.get(id);
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

  traverse(fromId: string, opts: TraverseOptions = {}): Entity[] {
    const direction = opts.direction ?? "out";
    const map = direction === "out" ? this.edgesOut : this.edgesIn;
    const edges = map.get(fromId) ?? [];
    const asOf = opts.asOfSeq ?? Number.POSITIVE_INFINITY;

    const out: Entity[] = [];
    for (const edge of edges) {
      if (opts.edgeType && edge.type !== opts.edgeType) continue;
      if (edge.createdBySeq > asOf) continue;
      if (edge.deletedBySeq !== undefined && edge.deletedBySeq <= asOf) continue;
      const otherId = direction === "out" ? edge.to : edge.from;
      const other = this.byId.get(otherId);
      if (!other || other.deleted) continue;
      out.push(other);
      if (opts.limit !== undefined && out.length >= opts.limit) break;
    }
    return out;
  }

  history(entityId: string, opts: HistoryOptions = {}): Event[] {
    const all = this.eventsByEntity.get(entityId) ?? [];
    const fromSeq = opts.fromSeq ?? 0;
    const toSeq = opts.toSeq ?? Number.POSITIVE_INFINITY;
    const types = opts.types ? new Set(opts.types) : null;

    const filtered = all.filter(
      (e) =>
        e.seq >= fromSeq &&
        e.seq <= toSeq &&
        (types === null || types.has(e.type)),
    );
    const result = opts.reverse ? filtered.slice().reverse() : filtered;
    if (opts.limit !== undefined) return result.slice(0, opts.limit);
    return result;
  }

  /** 时间旅行:返回 entity 在 asOfSeq 时的快照(包含可能的 deleted 标记)。 */
  at(entityId: string, asOfSeq: number): Entity | undefined {
    const events = this.eventsByEntity.get(entityId);
    if (!events || events.length === 0) return undefined;
    if (events[0]!.seq > asOfSeq) return undefined;

    let snapshot: Entity | undefined;
    for (const e of events) {
      if (e.seq > asOfSeq) break;
      snapshot = foldOne(snapshot, e);
    }
    return snapshot;
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

function pushEdge(map: Map<string, Edge[]>, key: string, edge: Edge): void {
  const list = map.get(key);
  if (list) list.push(edge);
  else map.set(key, [edge]);
}

function markEdgeDeleted(
  map: Map<string, Edge[]>,
  key: string,
  otherId: string,
  edgeType: string,
  seq: number,
): void {
  const list = map.get(key);
  if (!list) return;
  // 软删最近一条仍存活的同类 edge
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]!;
    const matchesOther =
      otherId === e.to || otherId === e.from;
    if (e.type === edgeType && e.deletedBySeq === undefined && matchesOther) {
      e.deletedBySeq = seq;
      return;
    }
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

/** 与 Indexes.fold 同步的纯函数版本(供 at 时间旅行使用,不写共享索引)。 */
function foldOne(snapshot: Entity | undefined, e: Event): Entity | undefined {
  switch (e.type) {
    case "Created": {
      const entityType = asString(e.payload["entityType"]);
      if (entityType === null) return snapshot;
      const initialAttrs = (e.payload["attrs"] as Attrs | undefined) ?? {};
      return {
        id: e.entityId,
        type: entityType,
        attrs: { ...initialAttrs },
        version: e.seq,
        createdAt: e.ts,
        updatedAt: e.ts,
      };
    }
    case "AttrSet": {
      if (!snapshot) return snapshot;
      return {
        ...snapshot,
        attrs: { ...snapshot.attrs, ...e.payload },
        version: e.seq,
        updatedAt: e.ts,
      };
    }
    case "AttrUnset": {
      if (!snapshot) return snapshot;
      const next = { ...snapshot.attrs };
      const keys = e.payload["keys"];
      if (Array.isArray(keys)) {
        for (const k of keys) {
          if (typeof k === "string") delete next[k];
        }
      }
      return { ...snapshot, attrs: next, version: e.seq, updatedAt: e.ts };
    }
    case "Deleted": {
      if (!snapshot) return snapshot;
      return { ...snapshot, deleted: true, version: e.seq, updatedAt: e.ts };
    }
    default: {
      if (!snapshot) return snapshot;
      return { ...snapshot, version: e.seq, updatedAt: e.ts };
    }
  }
}
