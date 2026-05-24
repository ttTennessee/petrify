import type { NodeStatus } from "@petrify/shared";
import { MachineBack } from "./MachineBack";
import { MachineFront } from "./MachineFront";
import { MachineSide } from "./MachineSide";

export type Facing = "north" | "south" | "east" | "west";

export interface RobotProps {
  /** 屏幕 x: 机器人横向中心 */
  x: number;
  /** 屏幕 y: 机器人脚下接地点 */
  y: number;
  facing: Facing;
  status?: NodeStatus;
  label?: string;
  iconUrl?: string;
  /** 后背名牌的短文字徽章 (iconUrl 缺失时用; 1-3 字符) */
  iconText?: string;
  /** 机器人显示高度 (像素); 默认 100 */
  size?: number;
  /** 是否显示头顶状态气泡 (默认 true) */
  showBubble?: boolean;
}

type BubbleStyle = {
  text: string;
  color: string;
  animClass?: string;
};

const BUBBLE_INK = "#241c14";

function bubbleFor(status: NodeStatus): BubbleStyle | null {
  switch (status) {
    case "running":
      return { text: "⚙", color: "#5fae6a", animClass: "of-bubble-spin" };
    case "completed":
      return { text: "✓", color: "#5fae6a" };
    case "failed":
      return { text: "!", color: "#c25450", animClass: "of-bubble-shake" };
    case "blocked":
      return { text: "…", color: "#e0a040" };
    case "compensating":
      return { text: "⟲", color: "#e0a040", animClass: "of-bubble-spin" };
    case "skipped":
      return { text: "→", color: "#5a4a36" };
    case "idle":
    case "pending":
      return { text: "Zz", color: "#5a4a36", animClass: "of-bubble-float" };
    default:
      return null;
  }
}

/** 头顶状态气泡: 云朵背景 + 居中字符. 在 viewBox 0-120 体系内, 锚点 (cx, cy). */
function StatusBubble({ status }: { status: NodeStatus }) {
  const b = bubbleFor(status);
  if (!b) return null;
  const cx = 92;
  const cy = 12;
  return (
    <g>
      {/* 气泡尾巴 (小圆点指向头顶) — 不旋转 */}
      <circle cx={cx - 12} cy={cy + 14} r={2} fill="#fff" stroke={BUBBLE_INK} strokeWidth={1} />
      <circle cx={cx - 8} cy={cy + 10} r={2.6} fill="#fff" stroke={BUBBLE_INK} strokeWidth={1} />
      {/* 云朵主体 — 不旋转 */}
      <ellipse cx={cx} cy={cy} rx={13} ry={11} fill="#fff" stroke={BUBBLE_INK} strokeWidth={1.4} />
      {/* 内部图标 — 只让它绕自身中心旋转/抖动 */}
      <g transform={`translate(${cx}, ${cy})`}>
        <text
          className={b.animClass}
          x={0}
          y={4}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize={b.text.length > 1 ? 10 : 14}
          fontWeight={700}
          fill={b.color}
        >
          {b.text}
        </text>
      </g>
    </g>
  );
}

/**
 * 根据朝向自动在 front / back / side 三视图间切换:
 *  - facing="south" → 脸朝镜头, 用 MachineFront
 *  - facing="north" → 背对镜头, 用 MachineBack
 *  - facing="east"  → 侧身向右, MachineSide(right)
 *  - facing="west"  → 侧身向左, MachineSide(left)
 *
 * 用 <g transform> 把 viewBox 0-120 的机器人摆到 (x,y) 上 ——
 * y 对应机器人脚下 (viewBox y=112), 中心对齐 x.
 */
export function Robot({
  x,
  y,
  facing,
  status = "idle",
  label,
  iconUrl,
  iconText,
  size = 100,
  showBubble = true,
}: RobotProps) {
  const s = size / 120;
  const tx = x - 60 * s;
  const ty = y - 112 * s;

  let content: React.ReactNode;
  if (facing === "south") {
    content = <MachineFront status={status} label={label} />;
  } else if (facing === "north") {
    content = <MachineBack status={status} iconUrl={iconUrl} iconText={iconText} label={label} />;
  } else {
    content = <MachineSide status={status} facing={facing === "west" ? "left" : "right"} />;
  }

  return (
    <g transform={`translate(${tx}, ${ty}) scale(${s})`}>
      {content}
      {showBubble && <StatusBubble status={status} />}
    </g>
  );
}
