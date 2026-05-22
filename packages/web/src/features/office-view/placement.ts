import type { NodeStatus, WorkflowGraph, WorkflowNode } from "@petrify/shared";
import { iso, ISO } from "./iso";

export type Zone =
  | "desk"
  | "behind-desk"
  | "cafe"
  | "toilet"
  | "treadmill"
  | "watercooler"
  | "exit";

export type Mood =
  | "working"
  | "watching"
  | "slacking"
  | "celebrating"
  | "crying"
  | "leaving"
  | "idle"
  | "compensating";

export interface Placement {
  nodeId: string;
  title: string;
  zone: Zone;
  x: number;
  y: number;
  facing: "left" | "right";
  anchorNodeId?: string;
  mood: Mood;
  status: NodeStatus;
  paletteIdx: number;
  speech?: { kind: "nag" | "blocked" | "cry"; idx: number };
}

export const VIEWBOX = { w: 960, h: 540 };

const DESK_GY = 2.3;
const DESK_GX_MIN = 2.2;
const DESK_GX_MAX = 11.8;
const DESK_GAP_MIN = 1.6;
const DESK_GAP_MAX = 2.6;
const DESK_TOP_Z = 26;

// 厕所小屋（OfficeFloor 也用这份常量画屋）
export const TOILET_ROOM = {
  gx: 11.6,
  gy: 0.1,
  gw: 2.0,
  gd: 1.6,
  h: 70,
} as const;

export const ZONE_GRID: Record<Exclude<Zone, "desk" | "behind-desk">, { gx: number; gy: number }> = {
  cafe: { gx: 1.5, gy: 6.6 },
  watercooler: { gx: 5.5, gy: 6.8 },
  treadmill: { gx: 9.2, gy: 6.8 },
  // toilet 的 grid 仅作"接近点"，实际坐标在 computePlacements 里替换为屋顶
  toilet: { gx: 12.6, gy: 1.8 },
  exit: { gx: 13.2, gy: 5.4 },
};

const ZONE_CENTERS: Record<Exclude<Zone, "desk" | "behind-desk">, { x: number; y: number }> =
  Object.fromEntries(
    Object.entries(ZONE_GRID).map(([k, v]) => [k, iso(v.gx, v.gy)]),
  ) as Record<Exclude<Zone, "desk" | "behind-desk">, { x: number; y: number }>;

const PALETTE_SIZE = 8;
const NAG_LINES_COUNT = 7;
const BLOCKED_LINES_COUNT = 3;
const CRY_LINES_COUNT = 3;

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function getDeskGridPositions(nodes: WorkflowNode[]): Record<string, { gx: number; gy: number }> {
  const n = nodes.length;
  const span = DESK_GX_MAX - DESK_GX_MIN;
  const gap = n <= 1 ? 0 : Math.max(DESK_GAP_MIN, Math.min(DESK_GAP_MAX, span / (n - 1)));
  const totalW = gap * Math.max(0, n - 1);
  const startGx = (DESK_GX_MIN + DESK_GX_MAX) / 2 - totalW / 2;
  const result: Record<string, { gx: number; gy: number }> = {};
  for (let i = 0; i < n; i++) {
    result[nodes[i]!.id] = { gx: startGx + i * gap, gy: DESK_GY };
  }
  return result;
}

function deskScreenPositions(nodes: WorkflowNode[]) {
  const grid = getDeskGridPositions(nodes);
  const result: Record<string, { x: number; y: number; gx: number; gy: number }> = {};
  for (const id in grid) {
    const g = grid[id]!;
    const standGx = g.gx + 0.6;
    const standGy = g.gy + 0.45;
    const p = iso(standGx, standGy);
    result[id] = { x: p.x, y: p.y, gx: g.gx, gy: g.gy };
  }
  return result;
}

interface PlacementInput {
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
  watchingSince: Record<string, number>;
  now: number;
}

function watchingPhase(elapsedMs: number): "calm" | "nag" | "away" {
  const t = elapsedMs % 50000;
  if (t < 12000) return "calm";
  if (t < 22000) return "nag";
  if (t < 40000) return "away";
  return "calm";
}

// 厕所屋顶上方的"名字浮点"屏幕坐标（顶面前沿中央，再向上 8px）
const TOILET_NAME_ANCHOR = iso(
  TOILET_ROOM.gx + TOILET_ROOM.gw / 2,
  TOILET_ROOM.gy + TOILET_ROOM.gd,
  TOILET_ROOM.h + 8,
);

export function computePlacements(input: PlacementInput): Placement[] {
  const { graph, nodeStatus, watchingSince, now } = input;
  const nodes = graph.nodes;
  const desk = deskScreenPositions(nodes);
  const placements: Placement[] = [];

  const watchersByAnchor: Record<string, string[]> = {};

  type Decision = {
    node: WorkflowNode;
    zone: Zone;
    mood: Mood;
    anchor?: string;
    speech?: { kind: "nag" | "blocked" | "cry"; idx: number };
  };
  const decisions: Decision[] = [];

  for (const node of nodes) {
    const status = nodeStatus[node.id] ?? node.status ?? "idle";
    const h = hash32(node.id);

    switch (status) {
      case "running":
        decisions.push({ node, zone: "desk", mood: "working" });
        break;
      case "failed":
        decisions.push({
          node,
          zone: "desk",
          mood: "crying",
          speech: { kind: "cry", idx: h % CRY_LINES_COUNT },
        });
        break;
      case "compensating":
        decisions.push({ node, zone: "desk", mood: "compensating" });
        break;
      case "completed": {
        const since = watchingSince[`done:${node.id}`];
        const elapsed = since ? now - since : 0;
        if (elapsed > 5000) decisions.push({ node, zone: "exit", mood: "leaving" });
        else decisions.push({ node, zone: "watercooler", mood: "celebrating" });
        break;
      }
      case "skipped":
        decisions.push({ node, zone: "exit", mood: "leaving" });
        break;
      case "blocked":
        decisions.push({
          node,
          zone: "cafe",
          mood: "slacking",
          speech: { kind: "blocked", idx: h % BLOCKED_LINES_COUNT },
        });
        break;
      case "pending":
      case "idle":
      default: {
        const directRunning = node.dependencies.find((dep) => nodeStatus[dep] === "running");
        if (directRunning) {
          const since = watchingSince[`watch:${node.id}:${directRunning}`];
          const elapsed = since ? now - since : 0;
          const phase = watchingPhase(elapsed);
          if (phase === "away") {
            const opts: Zone[] = ["cafe", "toilet", "treadmill"];
            decisions.push({ node, zone: opts[h % 3]!, mood: "slacking" });
          } else {
            decisions.push({
              node,
              zone: "behind-desk",
              anchor: directRunning,
              mood: "watching",
              speech: phase === "nag" ? { kind: "nag", idx: h % NAG_LINES_COUNT } : undefined,
            });
          }
        } else {
          // 一切 idle/pending 且无 running 依赖 → 都在饮水机闲聊
          decisions.push({ node, zone: "watercooler", mood: "idle" });
        }
        break;
      }
    }
  }

  for (const d of decisions) {
    if (d.zone === "behind-desk" && d.anchor) {
      (watchersByAnchor[d.anchor] ??= []).push(d.node.id);
    }
  }

  // 计数：厕所内人按到达顺序堆叠名字
  let toiletIdx = 0;

  for (const d of decisions) {
    const h = hash32(d.node.id);
    let x = 0;
    let y = 0;
    let facing: "left" | "right" = "right";

    if (d.zone === "desk") {
      const pos = desk[d.node.id]!;
      x = pos.x;
      y = pos.y;
    } else if (d.zone === "behind-desk" && d.anchor) {
      const anchor = desk[d.anchor]!;
      const watchers = watchersByAnchor[d.anchor] ?? [];
      const idx = watchers.indexOf(d.node.id);
      const total = watchers.length;
      // 更大角度、更大半径、奇偶错落 y 偏移以拉开气泡
      const angle = total === 1 ? 0 : (idx - (total - 1) / 2) * 0.95;
      const radius = 56;
      x = anchor.x + Math.sin(angle) * radius;
      y = anchor.y + 28 + (idx % 2) * 18 + Math.abs(Math.cos(angle)) * 4;
      facing = "right";
    } else if (d.zone === "toilet") {
      // 在厕所小屋内 —— 仅在屋顶上方堆叠名字
      x = TOILET_NAME_ANCHOR.x + ((h % 24) - 12);
      // 名字 tag 在 Person 内绘制于 y-70 处，所以 placement.y = anchorY + 70
      // 用 toiletIdx 让多个名字向下堆叠
      y = TOILET_NAME_ANCHOR.y + 70 + toiletIdx * 16;
      toiletIdx++;
    } else {
      const c = ZONE_CENTERS[d.zone as Exclude<Zone, "desk" | "behind-desk">];
      // 饮水机区铺得最宽（初始所有人都在这里）
      if (d.zone === "watercooler") {
        x = c.x + ((h % 160) - 80);
        y = c.y + (((h >> 7) % 56) - 28);
      } else {
        const offset = ((h % 50) - 25);
        x = c.x + offset;
        y = c.y + ((h >> 6) % 14) - 7;
      }
      if (d.zone === "exit") facing = "right";
      if (d.zone === "cafe") facing = (h & 1) ? "left" : "right";
    }

    placements.push({
      nodeId: d.node.id,
      title: d.node.title || d.node.ref || d.node.id,
      zone: d.zone,
      x,
      y,
      facing,
      anchorNodeId: d.anchor,
      mood: d.mood,
      status: nodeStatus[d.node.id] ?? d.node.status ?? "idle",
      paletteIdx: h % PALETTE_SIZE,
      speech: d.speech,
    });
  }

  return placements;
}

export { PALETTE_SIZE };
export const DESK_Y = iso(0, DESK_GY).y;
export { ISO, DESK_TOP_Z };
