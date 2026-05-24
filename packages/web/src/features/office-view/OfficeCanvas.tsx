import { useEffect, useMemo, useRef, useState } from "react";
import type { NodeStatus, WorkflowGraph } from "@petrify/shared";
import {
  CouchBack,
  NorthDeskOverlay,
  OFFICE_VIEWBOX,
  OfficeFloor,
  ZoneLabels,
} from "./OfficeFloor";
import { Robot, type Facing, type RobotProps } from "./Robot";
import "./style.css";

interface RobotConfig extends Omit<RobotProps, "x" | "y" | "facing"> {
  id: string;
  x: number;
  y: number;
  facing: Facing;
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
  { id: "n1", x: 200, y: 440, facing: "south", status: "running", label: "dev-A", size: 75 },
  { id: "n2", x: 440, y: 440, facing: "south", status: "running", label: "dev-B", size: 75 },
  { id: "n3", x: 680, y: 440, facing: "south", status: "running", label: "dev-C", size: 75 },
  { id: "n4", x: 920, y: 440, facing: "south", status: "running", label: "dev-D", size: 75 },
  // 南排工位 (脚下 y=640 坐在椅子上, 椅 cy=650, 桌南侧, 4 个) — face north 露出后背
  { id: "s1", x: 200, y: 650, facing: "north", status: "running", label: "dev-E", iconText: "CLD", size: 75 },
  { id: "s2", x: 440, y: 650, facing: "north", status: "running", label: "dev-F", iconText: "GPT", size: 75 },
  { id: "s3", x: 680, y: 650, facing: "north", status: "running", label: "dev-G", iconText: "ACP", size: 75 },
  { id: "s4", x: 920, y: 650, facing: "north", status: "running", label: "dev-H", iconText: "MCK", size: 75 },
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
    { x: 200, y: 440, facing: "south" as Facing },
    { x: 200, y: 650, facing: "north" as Facing },
    { x: 440, y: 440, facing: "south" as Facing },
    { x: 440, y: 650, facing: "north" as Facing },
    { x: 680, y: 440, facing: "south" as Facing },
    { x: 680, y: 650, facing: "north" as Facing },
    { x: 920, y: 440, facing: "south" as Facing },
    { x: 920, y: 650, facing: "north" as Facing },
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
  iconText?: string;
};

function mapGraphToRobots(
  graph: WorkflowGraph,
  nodeStatus: Record<string, NodeStatus>,
): RobotConfig[] {
  const atDesk: ZoneEntry[] = [];
  const atSofa: ZoneEntry[] = [];
  const atDock: ZoneEntry[] = [];

  for (const node of graph.nodes) {
    const status = nodeStatus[node.id] ?? node.status ?? "idle";
    const label = node.title || node.ref || node.id;
    const iconText = adapterIconText(node.adapter?.name);
    const entry: ZoneEntry = { id: node.id, label, status, iconText };
    if (status === "completed") atSofa.push(entry);
    else if (
      status === "running" ||
      status === "failed" ||
      status === "compensating"
    )
      atDesk.push(entry);
    else atDock.push(entry);
  }

  const robots: RobotConfig[] = [];
  for (let i = 0; i < atDock.length && i < ZONE_SLOTS.charge.length; i++) {
    const slot = ZONE_SLOTS.charge[i]!;
    const e = atDock[i]!;
    robots.push({ id: e.id, x: slot.x, y: slot.y, facing: "south", status: e.status, label: e.label, iconText: e.iconText, size: 70 });
  }
  for (let i = 0; i < atSofa.length && i < ZONE_SLOTS.sofa.length; i++) {
    const slot = ZONE_SLOTS.sofa[i]!;
    const e = atSofa[i]!;
    robots.push({ id: e.id, x: slot.x, y: slot.y, facing: "north", status: e.status, label: e.label, iconText: e.iconText, size: 80 });
  }
  for (let i = 0; i < atDesk.length && i < ZONE_SLOTS.desk.length; i++) {
    const slot = ZONE_SLOTS.desk[i]!;
    const e = atDesk[i]!;
    robots.push({
      id: e.id,
      x: slot.x,
      y: slot.y,
      facing: slot.facing,
      status: e.status,
      label: e.label,
      iconText: e.iconText,
      size: 75,
    });
  }
  return robots;
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
  const finalRobots = useMemo<RobotConfig[]>(() => {
    if (robots) return robots;
    if (graph && nodeStatus) return mapGraphToRobots(graph, nodeStatus);
    return STATIC_ROBOTS;
  }, [robots, graph, nodeStatus]);

  const walkerEnabled = showWalker ?? !graph; // 接入 graph 时默认隐藏 walker

  // z-order 按 y 排序 (越靠近镜头越后画), 让前景机器人压住背景机器人
  const sorted = [...finalRobots].sort((a, b) => a.y - b.y);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#ede0bf]">
      <svg
        viewBox={`0 0 ${OFFICE_VIEWBOX.w} ${OFFICE_VIEWBOX.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <OfficeFloor />
        {sorted.map((r) => (
          <Robot
            key={r.id}
            x={r.x}
            y={r.y}
            facing={r.facing}
            status={r.status}
            label={r.label}
            iconUrl={r.iconUrl}
            iconText={r.iconText}
            size={r.size}
          />
        ))}
        {walkerEnabled && <WalkingRobot />}
        {/* 北排桌画在机器人之后, 遮住北排机器人下 1/3 */}
        <NorthDeskOverlay />
        <CouchBack />
        <ZoneLabels />
      </svg>
    </div>
  );
}

export { STATIC_ROBOTS };
export type { RobotConfig };
