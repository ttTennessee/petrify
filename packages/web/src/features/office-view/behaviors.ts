import type { NodeStatus, WorkflowGraph, WorkflowNode } from "@petrify/shared";
import type { Facing } from "./Robot";

export type BehaviorKind =
  | "watching" // 沙发看电视
  | "peeking" // 工位身后看别人屏幕
  | "slacking" // 占空工位摸鱼
  | "charging" // 充电桩
  | "wandering" // 走道循环
  | "chatting"; // 站到另一个机器人附近

export interface BehaviorState {
  kind: BehaviorKind;
  /** peeking: 看的那个 working 节点 id; chatting: 聊天对象 id (取它的当前坐标作为锚点) */
  anchorId?: string;
  /** 该行为分配到的具体 slot: charge slot idx / sofa slot idx / desk slot idx (peeking 时是被看者的 desk slot) / wandering route seed */
  slotKey?: number;
  /** 下次允许切换的时间戳 (ms) */
  nextSwitchAt: number;
}

export type BehaviorMap = Map<string, BehaviorState>;

/** 场景资源容量, 与 OfficeCanvas 的 ZONE_SLOTS 保持一致 */
export interface ZoneCapacity {
  desk: number;
  sofa: number;
  charge: number;
  peekPerDesk: number; // 每个工位身后最多挂几个 peeker (北排 2, 南排 2, 这里取最小值方便统一)
}

export interface BehaviorContext {
  now: number;
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
  /** working 节点 id 集合 (running/failed/compensating) */
  working: Set<string>;
  /** 当前已经 *锁定* 给具体节点的 slot — 用来检测容量 */
  workingDeskSlotByNodeId: Map<string, number>;
  /** completed 节点 id 集合 (这些占着沙发) */
  resting: Set<string>;
  /** 空闲节点 id 列表 (其余) */
  idleIds: string[];
  /** node id → node (for dependencies lookup) */
  nodeById: Map<string, WorkflowNode>;
  capacity: ZoneCapacity;
  /** 上一帧 behavior 表 — wandering 接段时用 */
  prevBehavior?: BehaviorMap;
}

// 活跃: 有节点在 working 时, 行为切换更频繁 (场景显得忙)
// 安静: 全员空闲时, 切换很慢 (没人在干活, 整个办公室就该静下来)
const SWITCH_ACTIVE_MIN_MS = 5000;
const SWITCH_ACTIVE_MAX_MS = 12000;
const SWITCH_IDLE_MIN_MS = 20000;
const SWITCH_IDLE_MAX_MS = 45000;

function rand(seed: number): number {
  // simple LCG for deterministic-ish randomness
  const x = (seed * 1103515245 + 12345) | 0;
  return ((x >>> 0) % 100000) / 100000;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function nextSwitchTime(now: number, seed: number, active: boolean): number {
  const r = rand(seed ^ now);
  const min = active ? SWITCH_ACTIVE_MIN_MS : SWITCH_IDLE_MIN_MS;
  const max = active ? SWITCH_ACTIVE_MAX_MS : SWITCH_IDLE_MAX_MS;
  return now + min + r * (max - min);
}

/**
 * 找当前节点的"正在 working 的直接前置"列表 (用于 peeking).
 */
function workingPredecessors(nodeId: string, ctx: BehaviorContext): string[] {
  const node = ctx.nodeById.get(nodeId);
  if (!node) return [];
  return (node.dependencies ?? []).filter((depId) => ctx.working.has(depId));
}

/**
 * 该行为对当前帧是否仍然合法.
 * 不合法时调用方需要立即转移 (不等到 nextSwitchAt).
 */
function isLegal(state: BehaviorState, nodeId: string, ctx: BehaviorContext, usage: ZoneUsage): boolean {
  switch (state.kind) {
    case "peeking": {
      const preds = workingPredecessors(nodeId, ctx);
      if (preds.length === 0) return false;
      // 锚点必须还在 working
      if (!state.anchorId || !ctx.working.has(state.anchorId)) return false;
      // 锚点必须仍是自己的直接前置
      if (!preds.includes(state.anchorId)) return false;
      return true;
    }
    case "slacking": {
      // 必须有空工位 (或自己已占着)
      if (state.slotKey === undefined) return false;
      const occupant = usage.deskSlots.get(state.slotKey);
      return occupant === nodeId || occupant === undefined;
    }
    case "charging": {
      if (state.slotKey === undefined) return false;
      const occupant = usage.dockSlots.get(state.slotKey);
      return occupant === nodeId || occupant === undefined;
    }
    case "watching": {
      if (state.slotKey === undefined) return false;
      const occupant = usage.sofaSlots.get(state.slotKey);
      return occupant === nodeId || occupant === undefined;
    }
    case "chatting": {
      // 聊天对象必须还存在且是某个位置稳定的机器人 (不能聊正在干活的或走动的)
      if (!state.anchorId) return false;
      const anchorBeh = usage.behaviorOf.get(state.anchorId);
      if (!anchorBeh) return false;
      if (anchorBeh.kind !== "charging" && anchorBeh.kind !== "watching" && anchorBeh.kind !== "slacking")
        return false;
      // 同一锚点已被别的 chatter 占用 → 不合法 (避免两人完全重叠在 anchor 右侧)
      for (const [otherId, otherBeh] of usage.behaviorOf) {
        if (otherId === nodeId) continue;
        if (otherBeh.kind === "chatting" && otherBeh.anchorId === state.anchorId) return false;
      }
      return true;
    }
    case "wandering":
      return true;
  }
}

interface ZoneUsage {
  deskSlots: Map<number, string>; // slotIdx → nodeId
  sofaSlots: Map<number, string>;
  dockSlots: Map<number, string>;
  peekersBehindDesk: Map<number, string[]>; // desk slotIdx → nodeIds in queue
  behaviorOf: Map<string, BehaviorState>; // 已确定的行为 (chatting 判断锚点)
}

function newUsage(): ZoneUsage {
  return {
    deskSlots: new Map(),
    sofaSlots: new Map(),
    dockSlots: new Map(),
    peekersBehindDesk: new Map(),
    behaviorOf: new Map(),
  };
}

function claim(state: BehaviorState, nodeId: string, usage: ZoneUsage): void {
  switch (state.kind) {
    case "slacking":
      if (state.slotKey !== undefined) usage.deskSlots.set(state.slotKey, nodeId);
      break;
    case "charging":
      if (state.slotKey !== undefined) usage.dockSlots.set(state.slotKey, nodeId);
      break;
    case "watching":
      if (state.slotKey !== undefined) usage.sofaSlots.set(state.slotKey, nodeId);
      break;
    case "peeking": {
      if (state.slotKey !== undefined) {
        const list = usage.peekersBehindDesk.get(state.slotKey) ?? [];
        list.push(nodeId);
        usage.peekersBehindDesk.set(state.slotKey, list);
      }
      break;
    }
  }
  usage.behaviorOf.set(nodeId, state);
}

/**
 * 给一个空闲节点挑选一个新行为.
 * @param forbidKinds 禁用的行为种类 (例如 peeking 出场只能去 slacking, 这里传非 slacking 集合)
 */
function pickBehavior(
  nodeId: string,
  ctx: BehaviorContext,
  usage: ZoneUsage,
  forceKind?: BehaviorKind,
  allowedKinds?: Set<BehaviorKind>,
): BehaviorState | null {
  const seed = hash(nodeId) + Math.floor(ctx.now / 1000);
  const active = ctx.working.size > 0;
  // 收集所有合法选项 + 权重 (wandering 比其他行为冷门 10x)
  const options: Array<{ state: BehaviorState; weight: number }> = [];
  const add = (state: BehaviorState, weight = 1) => options.push({ state, weight });

  // 检查锚点是否已被别人 claim 为 chatting 目标 (同一锚点最多 1 个 chatter).
  // 每次 chatting 候选时重新扫 usage, 因为前面的 claim 会动态加入.
  const isAnchorTaken = (anchorId: string): boolean => {
    for (const beh of usage.behaviorOf.values()) {
      if (beh.kind === "chatting" && beh.anchorId === anchorId) return true;
    }
    return false;
  };

  const tryAdd = (kind: BehaviorKind) => {
    if (allowedKinds && !allowedKinds.has(kind)) return;
    if (forceKind && forceKind !== kind) return;
    switch (kind) {
      case "slacking": {
        for (let i = 0; i < ctx.capacity.desk; i++) {
          if (!usage.deskSlots.has(i)) {
            add({ kind: "slacking", slotKey: i, nextSwitchAt: nextSwitchTime(ctx.now, seed, active) });
            break;
          }
        }
        break;
      }
      case "charging": {
        for (let i = 0; i < ctx.capacity.charge; i++) {
          if (!usage.dockSlots.has(i)) {
            add({ kind: "charging", slotKey: i, nextSwitchAt: nextSwitchTime(ctx.now, seed, active) });
            break;
          }
        }
        break;
      }
      case "watching": {
        for (let i = 0; i < ctx.capacity.sofa; i++) {
          if (!usage.sofaSlots.has(i)) {
            add({ kind: "watching", slotKey: i, nextSwitchAt: nextSwitchTime(ctx.now, seed, active) });
            break;
          }
        }
        break;
      }
      case "peeking": {
        const preds = workingPredecessors(nodeId, ctx);
        for (const depId of preds) {
          const deskSlot = ctx.workingDeskSlotByNodeId.get(depId);
          if (deskSlot === undefined) continue;
          const queue = usage.peekersBehindDesk.get(deskSlot) ?? [];
          if (queue.length < ctx.capacity.peekPerDesk) {
            add(
              {
                kind: "peeking",
                anchorId: depId,
                slotKey: deskSlot,
                nextSwitchAt: nextSwitchTime(ctx.now, seed, active),
              },
              5, // 直接前置正在运行时优先去看屏幕
            );
            break;
          }
        }
        break;
      }
      case "chatting": {
        // 找一个 already-placed 且未被别人锚定的可聊对象 (charging / watching / slacking)
        for (const [otherId, otherBeh] of usage.behaviorOf) {
          if (otherId === nodeId) continue;
          if (isAnchorTaken(otherId)) continue;
          if (otherBeh.kind === "charging" || otherBeh.kind === "watching" || otherBeh.kind === "slacking") {
            add({
              kind: "chatting",
              anchorId: otherId,
              nextSwitchAt: nextSwitchTime(ctx.now, seed, active),
            });
            break;
          }
        }
        break;
      }
      case "wandering": {
        // wandering 走 WALK_ROUTE 的一段, 走完 (nextSwitchAt 到点) 再重选
        // 如果上一帧已经在 wandering, 接着下一段; 否则随机起点
        const prev = ctx.prevBehavior?.get(nodeId);
        const startLeg = prev?.kind === "wandering" && prev.slotKey !== undefined
          ? (prev.slotKey + 1) % WALK_ROUTE.length
          : hash(nodeId) % WALK_ROUTE.length;
        add(
          {
            kind: "wandering",
            slotKey: startLeg,
            nextSwitchAt: ctx.now + WALK_ROUTE[startLeg]!.durationMs,
          },
          0.1, // wandering 出现得稀有些, 大部分时间在工位/沙发/充电
        );
        break;
      }
    }
  };

  if (forceKind) {
    tryAdd(forceKind);
  } else {
    tryAdd("peeking"); // peeking 优先 — 有 working 前置时先看屏幕
    tryAdd("watching");
    tryAdd("slacking");
    tryAdd("chatting");
    tryAdd("charging");
    tryAdd("wandering");
  }

  if (options.length === 0) return null;
  const totalWeight = options.reduce((s, o) => s + o.weight, 0);
  let r = rand(seed) * totalWeight;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.state;
  }
  return options[options.length - 1]!.state;
}

/**
 * 主入口: 计算这一帧所有空闲节点的行为.
 * 输出的 BehaviorMap 应该被调用方持久化 (用 ref 跨 render 保存).
 */
export function computeBehaviors(
  prev: BehaviorMap,
  ctx: BehaviorContext,
): BehaviorMap {
  ctx = { ...ctx, prevBehavior: prev };
  const next: BehaviorMap = new Map();
  const usage = newUsage();
  // 把 working 节点占的 desk slot 先标记, 避免空闲机器人坐到 working 同事身上
  for (const [workingId, slot] of ctx.workingDeskSlotByNodeId) {
    usage.deskSlots.set(slot, workingId);
  }

  // 1) 先把"必须保留"的行为放上去: 锚点合法 + 没到切换时间 + 当前帧仍合法
  //    分两轮: 第一轮先处理非 chatting (因为 chatting 依赖其他人的 behaviorOf)
  const ordered = [...ctx.idleIds].sort((a, b) => {
    // 上一帧已有 behavior 的优先 (维持稳定); chatting 最后处理 (依赖别人就位)
    const ap = prev.get(a);
    const bp = prev.get(b);
    const aIsChat = ap?.kind === "chatting" ? 1 : 0;
    const bIsChat = bp?.kind === "chatting" ? 1 : 0;
    if (aIsChat !== bIsChat) return aIsChat - bIsChat;
    if (ap && !bp) return -1;
    if (!ap && bp) return 1;
    return 0;
  });

  for (const id of ordered) {
    const old = prev.get(id);
    let state: BehaviorState | null = null;

    if (old) {
      const legal = isLegal(old, id, ctx, usage);
      if (legal && ctx.now < old.nextSwitchAt) {
        state = old;
      } else if (!legal) {
        // 触发强制转移
        if (old.kind === "peeking") {
          // peeking 出场只能 slacking; slacking 不行就 charging (但语义上更接近"接班")
          state = pickBehavior(id, ctx, usage, "slacking");
          if (!state) state = pickBehavior(id, ctx, usage, "charging");
          if (!state) state = pickBehavior(id, ctx, usage); // 兜底
        } else {
          state = pickBehavior(id, ctx, usage);
        }
      } else {
        // 合法但到点了: 重新选 (允许保持相同 kind)
        state = pickBehavior(id, ctx, usage);
        if (!state) state = old; // 没合法选项就先沿用
      }
    } else {
      // 新节点: 自由选
      state = pickBehavior(id, ctx, usage);
    }

    if (!state) continue;
    claim(state, id, usage);
    next.set(id, state);
  }

  return next;
}

// === 漫步路线 ===
// 环形 4 段过道: 南→西→北→东, 每段一次性走完 (走路速度由 useRobotMovement 控制, 这里给出预期段时长用于
// 决定 wandering 何时切换). 速度 280 px/s — 段距离 380 或 650, 加 1s 缓冲让 movement 真正到达再重选.
const WANDER_SPEED = 280;
function legDuration(from: [number, number], to: [number, number]): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return (Math.hypot(dx, dy) / WANDER_SPEED) * 1000 + 800;
}

interface WalkLeg {
  from: [number, number];
  to: [number, number];
  facing: Facing;
  durationMs: number;
}

const RAW_LEGS: Array<Omit<WalkLeg, "durationMs">> = [
  { from: [1040, 320], to: [1040, 700], facing: "south" },
  { from: [1040, 700], to: [390, 700], facing: "west" },
  { from: [390, 700], to: [390, 320], facing: "north" },
  { from: [390, 320], to: [1040, 320], facing: "east" },
];
const WALK_ROUTE: WalkLeg[] = RAW_LEGS.map((leg) => ({
  ...leg,
  durationMs: legDuration(leg.from, leg.to),
}));

/** 给定 wandering state 的 slotKey (legIdx), 返回该段终点 + facing — 直接喂给 movement hook 作目标 */
export function wanderingTarget(legIdx: number): { x: number; y: number; facing: Facing } {
  const leg = WALK_ROUTE[legIdx % WALK_ROUTE.length]!;
  return { x: leg.to[0], y: leg.to[1], facing: leg.facing };
}
