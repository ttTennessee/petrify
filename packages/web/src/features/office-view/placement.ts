import type { NodeStatus, WorkflowGraph, WorkflowNode } from "@petrify/shared";

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
  // 屏幕坐标 (在 VIEWBOX 内)。已考虑围观/摸鱼时多人散开避免重叠。
  x: number;
  y: number;
  facing: "left" | "right";
  anchorNodeId?: string;
  mood: Mood;
  status: NodeStatus;
  // 调色板索引 0..PALETTE_SIZE-1，hash 自 node.id
  paletteIdx: number;
  speech?: { kind: "nag" | "blocked" | "cry"; idx: number };
}

export const VIEWBOX = { w: 960, h: 540 };

// 工位区上半部分；底部留给咖啡/厕所/跑步机/饮水机/出口
const DESK_ROW_Y = 170;
const DESK_SPACING_MIN = 110;
const DESK_LEFT_PAD = 90;

const ZONE_CENTERS: Record<Exclude<Zone, "desk" | "behind-desk">, { x: number; y: number }> = {
  cafe: { x: 130, y: 420 },
  watercooler: { x: 340, y: 430 },
  treadmill: { x: 540, y: 430 },
  toilet: { x: 740, y: 420 },
  exit: { x: 900, y: 430 },
};

const PALETTE_SIZE = 8;

// 文案行数（必须与 i18n 资源里 office.nag_lines/blocked_lines/cry_lines 数组长度对齐）
const NAG_LINES_COUNT = 7;
const BLOCKED_LINES_COUNT = 3;
const CRY_LINES_COUNT = 3;

// FNV-1a 32-bit hash —— 稳定、不依赖运行时
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function deskPositions(nodes: WorkflowNode[]) {
  const n = nodes.length;
  const usable = VIEWBOX.w - DESK_LEFT_PAD * 2;
  const spacing = n <= 1 ? 0 : Math.max(DESK_SPACING_MIN, Math.min(160, usable / (n - 1)));
  const totalWidth = spacing * Math.max(0, n - 1);
  const startX = VIEWBOX.w / 2 - totalWidth / 2;
  const result: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < n; i++) {
    result[nodes[i]!.id] = { x: startX + i * spacing, y: DESK_ROW_Y };
  }
  return result;
}

interface PlacementInput {
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
  // 进入"等待围观"的时间戳，用于决定催促/暂离
  watchingSince: Record<string, number>;
  now: number;
}

interface PlacementHints {
  // 哪些 node 在催促 / 离场摸鱼周期内
  shouldNag: (nodeId: string) => boolean;
  shouldStepOut: (nodeId: string) => boolean;
}

// 围观 → 催促 → 暂离 → 回来 的简单时序：
// 0-12s: 安静围观
// 12-22s: 头上冒催促泡泡
// 22-40s: 离开 (去 cafe/toilet)
// 40-50s: 回到 behind-desk
// 50s 后: 周期重置
function watchingPhase(elapsedMs: number): "calm" | "nag" | "away" {
  const t = elapsedMs % 50000;
  if (t < 12000) return "calm";
  if (t < 22000) return "nag";
  if (t < 40000) return "away";
  return "calm";
}

export function computePlacements(input: PlacementInput): Placement[] {
  const { graph, nodeStatus, watchingSince, now } = input;
  const nodes = graph.nodes;
  const desk = deskPositions(nodes);
  const placements: Placement[] = [];

  // 先按 anchor 分组围观者，以便散开
  const watchersByAnchor: Record<string, string[]> = {};

  // 第一遍：决定每个 node 的 zone + anchor
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
        // 完成后短暂庆祝再去 exit；用 watchingSince 复用计时
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
        // 找直接依赖中是否有 running，没有就找未完成依赖中最浅的
        const directRunning = node.dependencies.find((dep) => nodeStatus[dep] === "running");
        if (directRunning) {
          // 默认围观；超时进入 nag/away
          const since = watchingSince[`watch:${node.id}:${directRunning}`];
          const elapsed = since ? now - since : 0;
          const phase = watchingPhase(elapsed);
          if (phase === "away") {
            const opts: Zone[] = ["cafe", "toilet", "treadmill"];
            decisions.push({
              node,
              zone: opts[h % 3]!,
              mood: "slacking",
            });
          } else {
            decisions.push({
              node,
              zone: "behind-desk",
              anchor: directRunning,
              mood: "watching",
              speech:
                phase === "nag"
                  ? { kind: "nag", idx: h % NAG_LINES_COUNT }
                  : undefined,
            });
          }
        } else {
          // 没有 running 的直接依赖：看依赖链深度
          const unresolved = node.dependencies.some((dep) => {
            const st = nodeStatus[dep] ?? "idle";
            return st !== "completed" && st !== "skipped";
          });
          if (unresolved) {
            // 深层等待 —— 摸鱼
            const opts: Zone[] = ["cafe", "toilet", "treadmill"];
            decisions.push({ node, zone: opts[h % 3]!, mood: "slacking" });
          } else if (node.dependencies.length === 0 && status === "idle") {
            // 完全 idle + 没依赖：在饮水机闲聊
            decisions.push({ node, zone: "watercooler", mood: "idle" });
          } else {
            // 依赖已 done 但还没起跑：饮水机预备
            decisions.push({ node, zone: "watercooler", mood: "idle" });
          }
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

  // 第二遍：计算坐标
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
      const anchorPos = desk[d.anchor]!;
      const watchers = watchersByAnchor[d.anchor] ?? [];
      const idx = watchers.indexOf(d.node.id);
      const total = watchers.length;
      // 围在工位后方扇形散开
      const angle = total === 1 ? 0 : (idx - (total - 1) / 2) * 0.45;
      const radius = 64;
      x = anchorPos.x + Math.sin(angle) * radius;
      y = anchorPos.y - 52 - Math.abs(Math.cos(angle)) * 8;
      facing = "right";
    } else {
      const c = ZONE_CENTERS[d.zone as Exclude<Zone, "desk" | "behind-desk">];
      // 同区多人散开
      const offset = ((h % 60) - 30);
      x = c.x + offset;
      y = c.y + ((h >> 6) % 20) - 10;
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
export const DESK_Y = DESK_ROW_Y;
