// 2.5D 等距投影工具
// 网格 (gx, gy, gz) → 屏幕 (x, y)
//   gx 向右-下方向延伸；gy 向左-下方向延伸；gz 向上抬升
// 比例 halfW : halfH = 2 : 1（标准 iso）

export const ISO = {
  halfW: 32,
  halfH: 16,
  baseX: 480,
  baseY: 130,
  wallH: 110,
  gridW: 14,
  gridD: 8,
} as const;

export interface Point {
  x: number;
  y: number;
}

export function iso(gx: number, gy: number, gz = 0): Point {
  return {
    x: (gx - gy) * ISO.halfW + ISO.baseX,
    y: (gx + gy) * ISO.halfH + ISO.baseY - gz,
  };
}

function fmt(p: Point) {
  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
}

// 长方体三可见面（顶/南/东），返回 polygon points 字符串
export function isoBox(
  gx: number,
  gy: number,
  gw: number,
  gd: number,
  h: number,
  gz = 0,
): { top: string; south: string; east: string } {
  const top = [
    iso(gx, gy, gz + h),
    iso(gx + gw, gy, gz + h),
    iso(gx + gw, gy + gd, gz + h),
    iso(gx, gy + gd, gz + h),
  ].map(fmt).join(" ");
  const south = [
    iso(gx, gy + gd, gz + h),
    iso(gx + gw, gy + gd, gz + h),
    iso(gx + gw, gy + gd, gz),
    iso(gx, gy + gd, gz),
  ].map(fmt).join(" ");
  const east = [
    iso(gx + gw, gy, gz + h),
    iso(gx + gw, gy + gd, gz + h),
    iso(gx + gw, gy + gd, gz),
    iso(gx + gw, gy, gz),
  ].map(fmt).join(" ");
  return { top, south, east };
}

// 地板矩形面（仅顶面菱形）
export function isoFloorRect(gx: number, gy: number, gw: number, gd: number, gz = 0): string {
  return [
    iso(gx, gy, gz),
    iso(gx + gw, gy, gz),
    iso(gx + gw, gy + gd, gz),
    iso(gx, gy + gd, gz),
  ].map(fmt).join(" ");
}
