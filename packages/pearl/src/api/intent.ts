// 读意图 IR + execute 求值器。
//
// 意图是纯数据值,可序列化为二进制,可在进程外执行。
// 求值器把意图转换为对 Indexes 的调用,结果也是 Value(可再次序列化)。

import type {
  Attrs,
  Entity,
  Event,
  HistoryOptions,
  MatchWhere,
  Value,
} from "../types.js";
import type { Indexes } from "../store/indexes.js";

/** 对 traverse 结果的投影也是 Projection,从而实现任意深度的字段挑选。 */
export type Projection = {
  id?: boolean;
  type?: boolean;
  version?: boolean;
  createdAt?: boolean;
  updatedAt?: boolean;
  /** true = 整体保留;数组 = 只保留指定 attr */
  attrs?: boolean | string[];
  /** 其它键名:对应 traverse.as,值为 true(原样) 或嵌套 Projection */
  [aliasKey: string]: boolean | string[] | Projection | undefined;
};

export type TraverseClause = {
  /** edge type 过滤,缺省 = 所有 */
  edge?: string;
  direction?: "out" | "in";
  /** 输出键名:挂载到每个源 entity 的结果上 */
  as: string;
  limit?: number;
  /** 目标 entity 的 attr 过滤 */
  where?: MatchWhere;
};

export type ReadIntent = {
  // 入口(get / match / history / at 四选一)
  get?: string;
  match?: { type: string; where?: MatchWhere; limit?: number };
  history?: { entityId: string; opts?: HistoryOptions };
  at?: { entityId: string; asOfSeq: number };

  // 组合(仅与 get / match 配合)
  traverse?: TraverseClause[];
  project?: Projection;

  /** 时间旅行:作用于 get / match / traverse 链路。 */
  asOfSeq?: number;
};

/** 身份函数:用于显式标注 intent 字面量类型。 */
export function read(intent: ReadIntent): ReadIntent {
  return intent;
}

export type ReadResult =
  | Entity
  | Entity[]
  | Event[]
  | Record<string, Value>
  | Array<Record<string, Value>>
  | undefined;

export function execute(indexes: Indexes, intent: ReadIntent): ReadResult {
  // 入口模式互斥校验
  const entry = countEntries(intent);
  if (entry !== 1) {
    throw new Error(
      `ReadIntent must have exactly one entry (get/match/history/at), got ${entry}`,
    );
  }

  if (intent.history) {
    return indexes.history(intent.history.entityId, intent.history.opts);
  }
  if (intent.at) {
    return indexes.at(intent.at.entityId, intent.at.asOfSeq);
  }

  const asOfSeq = intent.asOfSeq;
  let sources: Entity[];

  if (intent.get !== undefined) {
    const e =
      asOfSeq !== undefined
        ? indexes.at(intent.get, asOfSeq)
        : indexes.get(intent.get);
    sources = e && !e.deleted ? [e] : [];
  } else {
    const { type, where, limit } = intent.match!;
    sources = indexes.match(type, where);
    if (limit !== undefined) sources = sources.slice(0, limit);
  }

  const projected = sources.map((src) => {
    const attachments: Record<string, Entity[]> = {};
    if (intent.traverse) {
      for (const t of intent.traverse) {
        const tOpts: { direction?: "out" | "in"; edgeType?: string; limit?: number; asOfSeq?: number } = {};
        if (t.direction !== undefined) tOpts.direction = t.direction;
        if (t.edge !== undefined) tOpts.edgeType = t.edge;
        if (t.limit !== undefined) tOpts.limit = t.limit;
        if (asOfSeq !== undefined) tOpts.asOfSeq = asOfSeq;
        let related = indexes.traverse(src.id, tOpts);
        if (t.where) related = related.filter((r) => matchAttrs(r.attrs, t.where!));
        attachments[t.as] = related;
      }
    }
    return shape(src, attachments, intent.project);
  });

  if (intent.get !== undefined) {
    return projected[0];
  }
  return projected as Array<Record<string, Value>>;
}

function countEntries(intent: ReadIntent): number {
  let n = 0;
  if (intent.get !== undefined) n++;
  if (intent.match !== undefined) n++;
  if (intent.history !== undefined) n++;
  if (intent.at !== undefined) n++;
  return n;
}

function shape(
  entity: Entity,
  attachments: Record<string, Entity[]>,
  projection: Projection | undefined,
): Record<string, Value> {
  if (!projection) {
    // 默认:整 entity + 挂载关系
    const out: Record<string, Value> = {
      id: entity.id,
      type: entity.type,
      attrs: entity.attrs as Value,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    if (entity.deleted) out["deleted"] = true;
    for (const [k, v] of Object.entries(attachments)) {
      out[k] = v as unknown as Value;
    }
    return out;
  }

  const out: Record<string, Value> = {};
  if (projection.id) out["id"] = entity.id;
  if (projection.type) out["type"] = entity.type;
  if (projection.version) out["version"] = entity.version;
  if (projection.createdAt) out["createdAt"] = entity.createdAt;
  if (projection.updatedAt) out["updatedAt"] = entity.updatedAt;

  if (projection.attrs === true) {
    out["attrs"] = entity.attrs as Value;
  } else if (Array.isArray(projection.attrs)) {
    const picked: Attrs = {};
    for (const k of projection.attrs) {
      if (Object.prototype.hasOwnProperty.call(entity.attrs, k)) {
        picked[k] = entity.attrs[k]!;
      }
    }
    out["attrs"] = picked as Value;
  }

  for (const [aliasKey, related] of Object.entries(attachments)) {
    const sub = projection[aliasKey];
    if (sub === undefined) continue;
    if (sub === true) {
      out[aliasKey] = related as unknown as Value;
    } else if (Array.isArray(sub)) {
      // 不会发生:traverse 别名只能匹配 Projection
      continue;
    } else if (typeof sub === "object") {
      out[aliasKey] = related.map((r) => shape(r, {}, sub)) as unknown as Value;
    }
  }
  return out;
}

function matchAttrs(attrs: Attrs, where: MatchWhere): boolean {
  for (const k of Object.keys(where)) {
    if (!deepEqual(attrs[k], where[k])) return false;
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
    for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
    return true;
  }
  return false;
}
