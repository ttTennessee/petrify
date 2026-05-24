import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeStatus, WorkflowGraph } from "@petrify/shared";
import { useAdapterCatalog, useAdapters } from "../../api/adapters";
import {
  CouchBack,
  NorthDeskOverlay,
  OFFICE_VIEWBOX,
  OfficeFloor,
  ZoneLabels,
} from "./OfficeFloor";
import { Robot, type Facing, type RobotProps } from "./Robot";
import { ChatBubble } from "./ChatBubble";
import { useRobotMovements, type AnyTarget } from "./useRobotMovement";
import { planPath, type PathPoint } from "./navigation";
import {
  computeBehaviors,
  wanderingTarget,
  type BehaviorMap,
  type BehaviorState,
  type BehaviorKind,
} from "./behaviors";
import "./style.css";

interface RobotConfig extends Omit<RobotProps, "x" | "y" | "facing"> {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  /** chatting 行为时的对话伙伴 id — ChatBubble 用它做一问一答错峰 */
  partnerId?: string;
  /** 当前依赖的锚点 (peeker 看的人 / chatter 聊的人) — anchor 未到位时藏气泡, 避免对空说话 */
  anchorId?: string;
  /** chatting: true=主动发起聊天 (说 q), false=被聊 (说 a). 非 chatting 不用. */
  isChatInitiator?: boolean;
  /** 当前行为 (仅空闲机器人才有) — ChatBubble 用它选台词库 */
  behavior?: BehaviorKind;
}

/**
 * 静态机器人摆位:
 *  - 3 个在充电桩前 (face south)
 *  - 3 个在 3 人沙发上看电视 (face north, 背对镜头)
 *  - 北排 3 个工位机器人 (face south, 朝中央显示器)
 *  - 南排 3 个工位机器人 (face north, 朝中央显示器)
 */
const STATIC_ROBOTS: RobotConfig[] = [
  // 充电 (4 个充电桩, x=170/240/310/380, 桩前接地)
  { id: "c1", x: 170, y: 196, facing: "south", status: "completed", label: "claude-1", size: 70 },
  { id: "c2", x: 240, y: 196, facing: "south", status: "completed", label: "claude-2", size: 70 },
  { id: "c3", x: 310, y: 196, facing: "south", status: "completed", label: "claude-3", size: 70 },
  { id: "c4", x: 380, y: 196, facing: "south", status: "completed", label: "claude-4", size: 70 },
  // 看电视 (沙发座面 y=300)
  { id: "t1", x: 770, y: 300, facing: "north", status: "idle", label: "watcher", iconText: "CLD", size: 80 },
  { id: "t2", x: 890, y: 300, facing: "north", status: "idle", label: "watcher", iconText: "GPT", size: 80 },
  { id: "t3", x: 1010, y: 300, facing: "north", status: "idle", label: "watcher", iconText: "MCK", size: 80 },
  // 北排工位 (脚下 y=440, 桌北侧, 由 NorthDeskOverlay 遮住机器人下 ~1/3)
  { id: "n1", x: 280, y: 440, facing: "south", status: "running", label: "dev-A", size: 75 },
  { id: "n2", x: 520, y: 440, facing: "south", status: "running", label: "dev-B", size: 75 },
  { id: "n3", x: 760, y: 440, facing: "south", status: "running", label: "dev-C", size: 75 },
  { id: "n4", x: 1000, y: 440, facing: "south", status: "running", label: "dev-D", size: 75 },
  // 南排工位 (脚下 y=640 坐在椅子上, 椅 cy=650, 桌南侧, 4 个) — face north 露出后背
  { id: "s1", x: 280, y: 650, facing: "north", status: "running", label: "dev-E", iconText: "CLD", size: 75 },
  { id: "s2", x: 520, y: 650, facing: "north", status: "running", label: "dev-F", iconText: "GPT", size: 75 },
  { id: "s3", x: 760, y: 650, facing: "north", status: "running", label: "dev-G", iconText: "ACP", size: 75 },
  { id: "s4", x: 1000, y: 650, facing: "north", status: "running", label: "dev-H", iconText: "MCK", size: 75 },
];

// 走动演示机器人沿矩形过道循环:
//   南行: (1040, 320) → (1040, 700)  → face="south" (front view)
//   西行: (1040, 700) → (390, 700)   → face="west"  (side, 朝左)
//   北行: (390, 700)  → (390, 320)   → face="north" (back view)
//   东行: (390, 320)  → (1040, 320)  → face="east"  (side, 朝右)
const WALK_LEG_MS = 4500;
const WALK_CYCLE_MS = WALK_LEG_MS * 4;
const WALK_ROUTE: Array<{ from: [number, number]; to: [number, number]; facing: Facing }> = [
  { from: [1040, 320], to: [1040, 700], facing: "south" },
  { from: [1040, 700], to: [390, 700], facing: "west" },
  { from: [390, 700], to: [390, 320], facing: "north" },
  { from: [390, 320], to: [1040, 320], facing: "east" },
];

function useWalker() {
  const [state, setState] = useState<{ x: number; y: number; facing: Facing }>({
    x: WALK_ROUTE[0]!.from[0],
    y: WALK_ROUTE[0]!.from[1],
    facing: WALK_ROUTE[0]!.facing,
  });
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) % WALK_CYCLE_MS;
      const legIdx = Math.floor(elapsed / WALK_LEG_MS);
      const leg = WALK_ROUTE[legIdx]!;
      const k = (elapsed - legIdx * WALK_LEG_MS) / WALK_LEG_MS;
      const x = leg.from[0] + (leg.to[0] - leg.from[0]) * k;
      const y = leg.from[1] + (leg.to[1] - leg.from[1]) * k;
      setState({ x, y, facing: leg.facing });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return state;
}

function WalkingRobot({ status, label }: { status?: NodeStatus; label?: string }) {
  const { x, y, facing } = useWalker();
  return <Robot x={x} y={y} facing={facing} status={status ?? "running"} label={label ?? "walker"} />;
}

// 把 workflow 节点按状态映射到三个区
const ZONE_SLOTS = {
  // 充电 (4 个充电桩, 紧凑版机器人 size=70 接地 y=196)
  charge: [
    { x: 170, y: 196 },
    { x: 240, y: 196 },
    { x: 310, y: 196 },
    { x: 380, y: 196 },
  ],
  // 沙发看电视 (面朝北 / back view): completed
  sofa: [
    { x: 770, y: 300 },
    { x: 890, y: 300 },
    { x: 1010, y: 300 },
  ],
  // 工位 (running / failed / compensating): 北南交替, 朝中央显示器, 8 个
  // 北排 y=440 (机器人下 1/4 被桌面遮); 南排 y=640 (坐在椅子上)
  desk: [
    { x: 280, y: 440, facing: "south" as Facing },
    { x: 280, y: 650, facing: "north" as Facing },
    { x: 520, y: 440, facing: "south" as Facing },
    { x: 520, y: 650, facing: "north" as Facing },
    { x: 760, y: 440, facing: "south" as Facing },
    { x: 760, y: 650, facing: "north" as Facing },
    { x: 1000, y: 440, facing: "south" as Facing },
    { x: 1000, y: 650, facing: "north" as Facing },
  ],
};

/** 把 adapter name 压成 2-3 字母徽章 (后背标签) */
function adapterIconText(adapterName?: string): string | undefined {
  if (!adapterName) return undefined;
  const n = adapterName.toLowerCase();
  if (n.includes("claude")) return "CLD";
  if (n.includes("openai") || n.includes("gpt")) return "GPT";
  if (n.includes("acp")) return "ACP";
  if (n.includes("mock")) return "MCK";
  // fallback: 取首字母 + 第一个非元音
  const letters = n.replace(/[^a-z]/g, "");
  return letters.slice(0, 3).toUpperCase() || undefined;
}

type ZoneEntry = {
  id: string;
  label: string;
  status: NodeStatus;
  iconUrl?: string;
  iconText?: string;
};

// 工位身后 peek 位置 (站着看屏幕)
const PEEK_BEHIND_NORTH = [380, 340];
const PEEK_BEHIND_SOUTH = [720, 750];

function deskSize(): number { return 75; }

interface MapState {
  /** working 节点 → desk slot index */
  workingSlot: Map<string, number>;
  behaviors: BehaviorMap;
}

export function createMapState(): MapState {
  return { workingSlot: new Map(), behaviors: new Map() };
}

function mapGraphToRobots(
  graph: WorkflowGraph,
  nodeStatus: Record<string, NodeStatus>,
  iconByAdapterName: Map<string, string>,
  state: MapState,
  now: number,
): RobotConfig[] {
  const entries: Record<string, ZoneEntry> = {};
  const working = new Set<string>();
  // resting 已废弃: completed 节点现在和 idle 一样自由活动 (可去沙发/工位/wandering/chatting),
  // 不再被强制塞到沙发上. 保留空 set 是为了兼容 BehaviorContext.resting 字段.
  const resting = new Set<string>();
  const idleIds: string[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));

  for (const node of graph.nodes) {
    const status = nodeStatus[node.id] ?? node.status ?? "idle";
    const label = node.title || node.ref || node.id;
    const adapterName = node.adapter?.name;
    const iconUrl = adapterName ? iconByAdapterName.get(adapterName) : undefined;
    const iconText = iconUrl ? undefined : adapterIconText(adapterName);
    entries[node.id] = { id: node.id, label, status, iconUrl, iconText };

    if (
      status === "running" ||
      status === "failed" ||
      status === "compensating"
    )
      working.add(node.id);
    else idleIds.push(node.id); // idle / completed / pending / skipped 全部进 idleIds
  }

  // --- working 分配 desk slot (持久化, 让出已离开者) ---
  for (const id of state.workingSlot.keys()) {
    if (!working.has(id)) state.workingSlot.delete(id);
  }
  const occupiedDeskSlots = new Set(state.workingSlot.values());
  for (const id of working) {
    if (state.workingSlot.has(id)) continue;
    for (let i = 0; i < ZONE_SLOTS.desk.length; i++) {
      if (!occupiedDeskSlots.has(i)) {
        state.workingSlot.set(id, i);
        occupiedDeskSlots.add(i);
        break;
      }
    }
  }

  // --- 预先把 resting 节点映射到 sofa slot (与下方渲染顺序保持一致), 传给 behavior 引擎避免 watching 撞位 ---
  const restingSofaSlotByNodeId = new Map<string, number>();
  {
    let i = 0;
    for (const id of resting) {
      if (i >= ZONE_SLOTS.sofa.length) break;
      restingSofaSlotByNodeId.set(id, i);
      i++;
    }
  }

  // --- 计算空闲节点的行为 ---
  state.behaviors = computeBehaviors(state.behaviors, {
    now,
    graph,
    nodeStatus,
    working,
    workingDeskSlotByNodeId: state.workingSlot,
    resting,
    restingSofaSlotByNodeId,
    idleIds,
    nodeById,
    capacity: {
      desk: ZONE_SLOTS.desk.length,
      sofa: ZONE_SLOTS.sofa.length,
      charge: ZONE_SLOTS.charge.length,
      peekPerDesk: 2,
    },
  });

  const robots: RobotConfig[] = [];

  // --- working 渲染 ---
  for (const [id, slotIdx] of state.workingSlot) {
    const slot = ZONE_SLOTS.desk[slotIdx]!;
    const e = entries[id];
    if (!e) continue;
    robots.push({
      id: e.id,
      x: slot.x,
      y: slot.y,
      facing: slot.facing,
      status: e.status,
      label: e.label,
      iconUrl: e.iconUrl,
      iconText: e.iconText,
      size: deskSize(),
    });
  }

  // (resting 已废弃 — completed 节点和 idle 一起走 behavior 系统, 不再强制坐沙发)

  // --- 空闲节点按 behavior 渲染 ---
  const peekersByDesk = new Map<number, string[]>();
  for (const [id, beh] of state.behaviors) {
    if (beh.kind === "peeking" && beh.slotKey !== undefined) {
      const list = peekersByDesk.get(beh.slotKey) ?? [];
      list.push(id);
      peekersByDesk.set(beh.slotKey, list);
    }
  }

  // 反查: 谁被谁锚定为 chatting 对象 (anchorId → chatterId)
  // 让被锚定的机器人也以 chatting 表现 (台词库 + 一问一答节拍)
  const chattedBy = new Map<string, string>();
  for (const [chatterId, beh] of state.behaviors) {
    if (beh.kind === "chatting" && beh.anchorId) {
      chattedBy.set(beh.anchorId, chatterId);
    }
  }

  // 两遍循环: 第一遍跳过 chatting (它依赖锚点的最终位置 + 周围空间),
  // 第二遍单独处理 chatting, 选边时避开已占位置
  const placedXY: Array<{ x: number; y: number; size: number; id: string }> = [];
  const placedBefore = robots.length; // working/resting 已渲染, 它们的位置也算占用
  for (let i = 0; i < placedBefore; i++) {
    const r = robots[i]!;
    placedXY.push({ x: r.x, y: r.y, size: r.size ?? 75, id: r.id });
  }

  const chatters: string[] = [];
  for (const id of idleIds) {
    const beh = state.behaviors.get(id);
    const e = entries[id];
    if (!beh || !e) continue;
    if (beh.kind === "chatting") {
      chatters.push(id);
      continue;
    }
    const pos = positionForBehavior(beh, id, peekersByDesk, state.behaviors, now);
    if (!pos) continue;
    const chatterOfMe = chattedBy.get(id);
    const effectiveBehavior: BehaviorKind = chatterOfMe ? "chatting" : beh.kind;
    const partnerId = chatterOfMe;
    // peeker 的锚点 = working 同事; chatting 锚点交给 partnerId 处理
    const anchorId = beh.kind === "peeking" ? beh.anchorId : undefined;
    robots.push({
      id: e.id,
      x: pos.x,
      y: pos.y,
      facing: pos.facing,
      status: e.status,
      label: e.label,
      iconUrl: e.iconUrl,
      iconText: e.iconText,
      size: pos.size,
      behavior: effectiveBehavior,
      partnerId,
      anchorId,
      // 这一遍处理的是 "被别人聊" 的 anchor 那一方, 所以不是发起者
      isChatInitiator: chatterOfMe ? false : undefined,
    });
    placedXY.push({ x: pos.x, y: pos.y, size: pos.size, id: e.id });
  }

  // 第二遍: chatting (主动发起聊天的 chatter)
  for (const id of chatters) {
    const beh = state.behaviors.get(id)!;
    const e = entries[id]!;
    const pos = chattingPosition(beh, peekersByDesk, state.behaviors, now, placedXY);
    if (!pos) continue; // 周围没空位 → 这一帧不渲染该 chatter (下次会重选行为)
    robots.push({
      id: e.id,
      x: pos.x,
      y: pos.y,
      facing: pos.facing,
      status: e.status,
      label: e.label,
      iconUrl: e.iconUrl,
      iconText: e.iconText,
      size: pos.size,
      behavior: "chatting",
      partnerId: beh.anchorId,
      isChatInitiator: true,
    });
    placedXY.push({ x: pos.x, y: pos.y, size: pos.size, id: e.id });
  }

  return robots;
}

function chattingPosition(
  beh: BehaviorState,
  peekersByDesk: Map<number, string[]>,
  allBehaviors: BehaviorMap,
  now: number,
  placedXY: Array<{ x: number; y: number; size: number; id: string }>,
): { x: number; y: number; facing: Facing; size: number } | null {
  if (!beh.anchorId) return null;
  const anchorBeh = allBehaviors.get(beh.anchorId);
  if (!anchorBeh) return null;
  if (anchorBeh.kind !== "watching" && anchorBeh.kind !== "slacking") return null;
  const anchorPos = positionForBehavior(anchorBeh, beh.anchorId, peekersByDesk, allBehaviors, now);
  if (!anchorPos) return null;

  const offset = 60;
  // 碰撞: 与已放置的 (anchor 除外) 任意机器人脚下点距离 < 40 视为重叠
  const collides = (x: number, y: number): boolean => {
    for (const p of placedXY) {
      if (p.id === beh.anchorId) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.hypot(dx, dy) < 40) return true;
    }
    return false;
  };

  const right = { x: anchorPos.x + offset, y: anchorPos.y, facing: "west" as Facing, size: anchorPos.size };
  if (!collides(right.x, right.y)) return right;
  const left = { x: anchorPos.x - offset, y: anchorPos.y, facing: "east" as Facing, size: anchorPos.size };
  if (!collides(left.x, left.y)) return left;
  return null;
}

function positionForBehavior(
  beh: BehaviorState,
  nodeId: string,
  peekersByDesk: Map<number, string[]>,
  allBehaviors: BehaviorMap,
  now: number,
): { x: number; y: number; facing: Facing; size: number } | null {
  switch (beh.kind) {
    case "watching": {
      if (beh.slotKey === undefined) return null;
      const slot = ZONE_SLOTS.sofa[beh.slotKey];
      if (!slot) return null;
      return { x: slot.x, y: slot.y, facing: "north", size: 80 };
    }
    case "charging": {
      if (beh.slotKey === undefined) return null;
      const slot = ZONE_SLOTS.charge[beh.slotKey];
      if (!slot) return null;
      return { x: slot.x, y: slot.y, facing: "south", size: 70 };
    }
    case "slacking": {
      if (beh.slotKey === undefined) return null;
      const slot = ZONE_SLOTS.desk[beh.slotKey];
      if (!slot) return null;
      return { x: slot.x, y: slot.y, facing: slot.facing, size: deskSize() };
    }
    case "peeking": {
      if (beh.slotKey === undefined) return null;
      const slot = ZONE_SLOTS.desk[beh.slotKey];
      if (!slot) return null;
      const isNorth = slot.facing === "south";
      const queueYs = isNorth ? PEEK_BEHIND_NORTH : PEEK_BEHIND_SOUTH;
      const queue = peekersByDesk.get(beh.slotKey) ?? [];
      const idx = Math.max(0, queue.indexOf(nodeId));
      const y = queueYs[Math.min(idx, queueYs.length - 1)]!;
      const xOffset = idx === 0 ? -22 : 22;
      return { x: slot.x + xOffset, y, facing: slot.facing, size: 70 };
    }
    case "chatting": {
      if (!beh.anchorId) return null;
      const anchorBeh = allBehaviors.get(beh.anchorId);
      if (!anchorBeh) return null;
      // 只能聊位置固定 + 周围有空间的人 (charging 桩相邻太近; 不聊 wandering/peeking/其他 chatting)
      if (anchorBeh.kind !== "watching" && anchorBeh.kind !== "slacking") return null;
      const anchorPos = positionForBehavior(anchorBeh, beh.anchorId, peekersByDesk, allBehaviors, now);
      if (!anchorPos) return null;
      // 站到锚点旁边 (x + 60, 朝向 west 与之对视)
      return { x: anchorPos.x + 60, y: anchorPos.y, facing: "west", size: anchorPos.size };
    }
    case "wandering": {
      const t = wanderingTarget(beh.slotKey ?? 0);
      return { x: t.x, y: t.y, facing: t.facing, size: 75 };
    }
  }
}

export interface OfficeCanvasProps {
  /** workflow 图 (传入时按节点状态映射到场景, 否则用静态演示) */
  graph?: WorkflowGraph;
  /** 节点实时状态表 (与 graph 配合) */
  nodeStatus?: Record<string, NodeStatus>;
  /** 完全自定义的机器人列表 (优先级最高) */
  robots?: RobotConfig[];
  /** 是否渲染沿过道循环走动的示例机器人 (默认: 静态场景时显示, 接入 graph 时关闭) */
  showWalker?: boolean;
}

export function OfficeCanvas({ graph, nodeStatus, robots, showWalker }: OfficeCanvasProps) {
  const { data: catalog } = useAdapterCatalog();
  const { data: instances } = useAdapters();
  const iconByAdapterName = useMemo(() => {
    const catalogIcon = new Map<string, string>();
    for (const c of catalog ?? []) if (c.icon) catalogIcon.set(c.id, c.icon);
    const m = new Map<string, string>();
    for (const inst of instances ?? []) {
      const icon = inst.catalog_id ? catalogIcon.get(inst.catalog_id) : undefined;
      if (icon) m.set(inst.name, icon);
    }
    return m;
  }, [catalog, instances]);

  const mapStateRef = useRef<MapState>(createMapState());

  // 低频 tick 驱动行为切换 (按时间检查 nextSwitchAt — 段走完 / 行为到期都靠它)
  const [tickNow, setTickNow] = useState(() => performance.now());
  useEffect(() => {
    if (!graph) return;
    const id = window.setInterval(() => setTickNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [graph]);

  const finalRobots = useMemo<RobotConfig[]>(() => {
    if (robots) return robots;
    if (graph && nodeStatus)
      return mapGraphToRobots(graph, nodeStatus, iconByAdapterName, mapStateRef.current, tickNow);
    return STATIC_ROBOTS;
  }, [robots, graph, nodeStatus, iconByAdapterName, tickNow]);

  const walkerEnabled = showWalker ?? !graph; // 接入 graph 时默认隐藏 walker

  // 目标位置表 (id → path + facing): 用 nav 图 A* 规划绕开桌沙发的路径.
  // 用 ref 缓存"上次规划的目标点"; 只在目标点真的变化时重 plan, 避免 path 引用频繁变 (会重置 segIdx).
  const planCacheRef = useRef<
    Record<string, { goalX: number; goalY: number; path: PathPoint[]; finalFacing: Facing }>
  >({});
  const posesPrevRef = useRef<Record<string, { x: number; y: number }>>({});
  const targets = useMemo<Record<string, AnyTarget>>(() => {
    const m: Record<string, AnyTarget> = {};
    const cache = planCacheRef.current;
    const posesPrev = posesPrevRef.current;
    const seen = new Set<string>();
    for (const r of finalRobots) {
      seen.add(r.id);
      const prev = cache[r.id];
      // 起点用上一帧 pose (若有), 否则用机器人目标 (初次入场, 不需要走)
      const startX = posesPrev[r.id]?.x ?? r.x;
      const startY = posesPrev[r.id]?.y ?? r.y;
      const goalChanged = !prev || prev.goalX !== r.x || prev.goalY !== r.y;
      if (goalChanged) {
        const path = planPath(startX, startY, r.x, r.y);
        cache[r.id] = { goalX: r.x, goalY: r.y, path, finalFacing: r.facing };
      } else if (prev.finalFacing !== r.facing) {
        // 目标点没变但 facing 变了 — 重写 finalFacing, 保留 path
        cache[r.id] = { ...prev, finalFacing: r.facing };
      }
      const entry = cache[r.id]!;
      m[r.id] = { path: entry.path, finalFacing: entry.finalFacing };
    }
    // 清理离场的
    for (const id of Object.keys(cache)) if (!seen.has(id)) delete cache[id];
    return m;
  }, [finalRobots]);
  const poses = useRobotMovements(targets);
  posesPrevRef.current = poses;

  // z-order 按当前 pose y 排序 (越靠近镜头越后画), 移动中也维持正确遮挡
  const sorted = [...finalRobots].sort((a, b) => {
    const ay = poses[a.id]?.y ?? a.y;
    const by = poses[b.id]?.y ?? b.y;
    return ay - by;
  });
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#ede0bf]">
      <svg
        viewBox={`0 0 ${OFFICE_VIEWBOX.w} ${OFFICE_VIEWBOX.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <OfficeFloor />
        {sorted.map((r) => {
          const pose = poses[r.id];
          return (
            <Robot
              key={r.id}
              x={pose?.x ?? r.x}
              y={pose?.y ?? r.y}
              facing={pose?.facing ?? r.facing}
              status={r.status}
              label={r.label}
              iconUrl={r.iconUrl}
              iconText={r.iconText}
              size={r.size}
            />
          );
        })}
        {walkerEnabled && <WalkingRobot />}
        {/* 北排桌画在机器人之后, 遮住北排机器人下 1/3 */}
        <NorthDeskOverlay />
        <CouchBack />
        {/* 聊天气泡画在最上层, 让它浮在桌面和沙发之上 */}
        {sorted.map((r) => {
          const pose = poses[r.id];
          // anchor/partner 还在路上时, 把气泡藏起来, 避免对空说话
          const anchorPartner = r.anchorId ?? r.partnerId;
          const anchorPose = anchorPartner ? poses[anchorPartner] : undefined;
          const anchorMoving = anchorPose?.isMoving ?? false;
          return (
            <ChatBubble
              key={`bubble-${r.id}`}
              id={r.id}
              x={pose?.x ?? r.x}
              y={pose?.y ?? r.y}
              size={r.size ?? 100}
              status={r.status ?? "idle"}
              behavior={r.behavior}
              partnerId={r.partnerId}
              isChatInitiator={r.isChatInitiator}
              visible={!(pose?.isMoving ?? false) && !anchorMoving}
            />
          );
        })}
        <ZoneLabels />
      </svg>
    </div>
  );
}

export { STATIC_ROBOTS };
export type { RobotConfig };
