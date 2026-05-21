// 涌现 schema registry。
//
// 规则:
// - 首次写某 entity type:观察 attrs,沉淀 (attrName → primitive) 形状。
// - 后续写入:
//     · 完全吻合 → 通过
//     · 新增字段 → 漂移,引擎自动注入 ShapeExtended 事件(由 writer 处理)
//     · 类型冲突 → IntentRejected
// - null 视为不约束(允许后来确定类型)。
// - 注册表本身也是事件驱动的:replay 时由 ShapeExtended 重建。

import type { Attrs, Primitive, Value } from "../types.js";
import { IntentRejected } from "../types.js";

export type Conflict = {
  entityType: string;
  attr: string;
  existing: Primitive;
  incoming: Primitive;
};

export type DriftEntry = {
  entityType: string;
  attr: string;
  primitive: Primitive;
};

export type ValidationResult =
  | { ok: true; drift: DriftEntry[] }
  | { ok: false; conflicts: Conflict[] };

export class ShapeRegistry {
  /** Map<entityType, Map<attrName, primitive>> */
  private readonly shapes = new Map<string, Map<string, Primitive>>();

  /** 应用一条 ShapeExtended:把 (entityType, attr, primitive) 写入 registry。 */
  applyExtended(entityType: string, attr: string, primitive: Primitive): void {
    let shape = this.shapes.get(entityType);
    if (!shape) {
      shape = new Map();
      this.shapes.set(entityType, shape);
    }
    if (!shape.has(attr)) shape.set(attr, primitive);
  }

  shapeOf(entityType: string): ReadonlyMap<string, Primitive> {
    return this.shapes.get(entityType) ?? EMPTY_SHAPE;
  }

  /**
   * 检查一组 attrs 是否与已沉淀的 shape 相容。
   * - 完全相容(含 null 占位):drift 为空
   * - 出现新 attr:drift 中标注其推断 primitive
   * - 类型冲突:返回 conflicts(调用方自行决定是否抛 IntentRejected)
   *
   * 同一次校验内若多个 entity 同 type 同 attr 推断到不同 primitive,也算冲突。
   */
  validate(
    entityType: string,
    attrs: Attrs,
    /** 同一意图内的暂存扩展(尚未落库,但已被前序事件计入)。 */
    pending: Map<string, Primitive> = new Map(),
  ): ValidationResult {
    const drift: DriftEntry[] = [];
    const conflicts: Conflict[] = [];
    const known = this.shapes.get(entityType);

    for (const [attr, value] of Object.entries(attrs)) {
      const incoming = primitiveOf(value);
      if (incoming === null) continue; // null 不约束

      const existing = known?.get(attr) ?? pending.get(attr);
      if (existing === undefined) {
        drift.push({ entityType, attr, primitive: incoming });
        pending.set(attr, incoming);
      } else if (existing !== incoming) {
        conflicts.push({ entityType, attr, existing, incoming });
      }
    }

    return conflicts.length === 0
      ? { ok: true, drift }
      : { ok: false, conflicts };
  }

  /** 一站式:校验 + 失败抛出。 */
  validateOrThrow(
    entityType: string,
    attrs: Attrs,
    pending?: Map<string, Primitive>,
  ): DriftEntry[] {
    const res = this.validate(entityType, attrs, pending);
    if (!res.ok) {
      throw new IntentRejected("shape-conflict", { conflicts: res.conflicts });
    }
    return res.drift;
  }
}

const EMPTY_SHAPE: ReadonlyMap<string, Primitive> = new Map();

export function primitiveOf(v: Value): Primitive | null {
  if (v === null) return null;
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return "object";
  return null;
}
