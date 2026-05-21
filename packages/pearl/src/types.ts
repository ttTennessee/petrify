// Pearl 核心数据原语
//
// 整个数据库只有三种东西:Entity / Event / Edge。
// 一切写入都是事件;edge 操作、shape 漂移、意图边界都被建模为事件。

export type Value =
  | string
  | number
  | boolean
  | null
  | Value[]
  | { [key: string]: Value };

export type Attrs = Record<string, Value>;

/** Shape 推断用的粗粒度类型(null 不参与约束)。 */
export type Primitive =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object";

export type Entity = {
  id: string;
  type: string;
  attrs: Attrs;
  version: number; // 最近一次作用于该 entity 的 event.seq
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
};

// 内建事件类型(payload 形态因类型而异;见 indexes.ts fold)
//
// - Created       payload = { entityType: string, attrs?: Attrs }
// - AttrSet       payload = Attrs (要 merge 的属性)
// - AttrUnset     payload = { keys: string[] }
// - Deleted       payload = {}
// - EdgeAdded     payload = { to: string, edgeType: string, attrs?: Attrs }
// - EdgeRemoved   payload = { to: string, edgeType: string }
// - ShapeExtended payload = { entityType: string, attr: string, primitive: Primitive }
// - IntentCommitted payload = {}    意图边界标记,本身不修改任何 entity/edge
export type BuiltinEventType =
  | "Created"
  | "AttrSet"
  | "AttrUnset"
  | "Deleted"
  | "EdgeAdded"
  | "EdgeRemoved"
  | "ShapeExtended"
  | "IntentCommitted";

export type Event = {
  id: string;
  seq: number; // 全库单调递增
  entityId: string; // IntentCommitted/ShapeExtended 用占位 "__pearl__"
  type: BuiltinEventType | string;
  payload: Attrs;
  ts: number;
  causedBy?: string[]; // 留口
  intentId: string;
};

export type Edge = {
  from: string;
  to: string;
  type: string;
  attrs?: Attrs;
  createdBySeq: number;
  deletedBySeq?: number;
};

/** 写意图 */
export type CommitIntent = {
  events?: Array<{
    entityId: string;
    type: BuiltinEventType | string;
    payload?: Attrs;
  }>;
  edges?: {
    add?: Array<{ from: string; to: string; type: string; attrs?: Attrs }>;
    remove?: Array<{ from: string; to: string; type: string }>;
  };
  /** 客户端硬性 shape 约束,引擎据此提前拒绝。 */
  expectedShape?: Record<string, Record<string, Primitive>>;
};

export type CommitReceipt = {
  intentId: string;
  fromSeq: number; // 此意图首个 USER event 的 seq(不含 ShapeExtended/IntentCommitted)
  toSeq: number; // 末个 USER event 的 seq
  count: number; // user 事件数(不含自动注入的 ShapeExtended/IntentCommitted)
  driftAttrs: Array<{ entityType: string; attr: string; primitive: Primitive }>;
};

/** 读意图原语参数 */
export type MatchWhere = Record<string, Value>;

export type TraverseOptions = {
  direction?: "out" | "in"; // 默认 out
  edgeType?: string; // 默认所有类型
  /** 时间旅行:只看 seq <= asOfSeq 时存在的 edge。默认 = 现在。 */
  asOfSeq?: number;
  limit?: number;
};

export type HistoryOptions = {
  fromSeq?: number;
  toSeq?: number;
  /** 反向(最新在前)。 */
  reverse?: boolean;
  limit?: number;
  /** 只返回这些事件类型。 */
  types?: string[];
};

/** Pearl 自用占位 entityId(系统事件)。 */
export const SYSTEM_ENTITY_ID = "__pearl__";

/** 错误类型:shape 冲突或其他验证失败,意图整体被拒。 */
export class IntentRejected extends Error {
  constructor(
    public readonly reason: string,
    public readonly detail?: unknown,
  ) {
    super(`IntentRejected: ${reason}`);
    this.name = "IntentRejected";
  }
}
