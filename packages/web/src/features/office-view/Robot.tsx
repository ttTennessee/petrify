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
  /** 机器人显示高度 (像素); 默认 100 */
  size?: number;
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
  size = 100,
}: RobotProps) {
  const s = size / 120;
  const tx = x - 60 * s;
  const ty = y - 112 * s;

  let content: React.ReactNode;
  if (facing === "south") {
    content = <MachineFront status={status} label={label} />;
  } else if (facing === "north") {
    content = <MachineBack status={status} iconUrl={iconUrl} label={label} />;
  } else {
    content = <MachineSide status={status} facing={facing === "west" ? "left" : "right"} />;
  }

  return (
    <g transform={`translate(${tx}, ${ty}) scale(${s})`}>{content}</g>
  );
}
