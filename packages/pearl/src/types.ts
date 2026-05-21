// Pearl 核心数据原语
//
// 整个数据库只有三种东西:Entity / Event / Edge。
// Edge 类型在 W1 已声明,索引与遍历在 W2 实现。

export type Value =
  | string
  | number
  | boolean
  | null
  | Value[]
  | { [key: string]: Value };

export type Attrs = Record<string, Value>;

export type Entity = {
  id: string;
  type: string;
  attrs: Attrs;
  version: number; // 当前事件序号(最近一次作用于该 entity 的 event.seq)
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // 软删除标记
};

// 内建事件类型 + 任意自定义字符串
export type BuiltinEventType =
  | "Created"
  | "AttrSet"
  | "AttrUnset"
  | "Deleted";

export type Event = {
  id: string;
  seq: number; // 全库单调递增
  entityId: string;
  type: BuiltinEventType | string;
  payload: Attrs;
  ts: number;
  causedBy?: string[]; // W2+: 因果父事件
  intentId: string; // 同一意图内的事件共享此 ID
};

export type Edge = {
  from: string;
  to: string;
  type: string;
  attrs?: Attrs;
  createdBySeq: number;
  deletedBySeq?: number;
};

// 写意图:一次 commit 的输入(W1 只有 events)
export type CommitIntent = {
  events: Array<{
    entityId: string;
    type: BuiltinEventType | string;
    payload?: Attrs;
  }>;
};

export type CommitReceipt = {
  intentId: string;
  fromSeq: number; // 此意图首个 event 的 seq
  toSeq: number; // 此意图末个 event 的 seq
  count: number;
};

// 读意图(W1 只用到平的 match/get;留口给 W2 traverse/project)
export type MatchWhere = Record<string, Value>;
