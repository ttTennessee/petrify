import type { WorkflowNode } from "@petrify/shared";
import { VIEWBOX, ZONE_GRID, getDeskGridPositions, DESK_TOP_Z, TOILET_ROOM } from "./placement";
import { iso, isoBox, isoFloorRect, ISO } from "./iso";

interface OfficeFloorProps {
  nodes: WorkflowNode[];
}

const C = {
  wallTop: "#f5ead2",
  wallMid: "#ecdcb6",
  wallBot: "#dcc28e",
  wallShade: "#b89461",
  floorTop: "#c9a87a",
  floorTopAlt: "#bf9c6a",
  floorEdge: "#7a5230",
  ink: "#241c14",
  inkSoft: "#5a4a36",
  paper: "#fbf5e4",
  brass: "#c89968",
  brassDark: "#8a6638",
  sage: "#7d9b6a",
  sageDark: "#566c4a",
  terracotta: "#c97a5b",
  terracottaDark: "#8a4d36",
  wood: "#a87b4c",
  woodDark: "#6e4a2a",
  woodTop: "#bb8a55",
  metal: "#8a98a8",
  metalDark: "#4a5460",
  shadow: "#241c14",
};

// 顺序：iso 视角下"南"= 屏幕下方 + 偏左；"东"= 屏幕下方 + 偏右
// 因此东面比南面更亮（光从右上来），南面带中等阴影
function shaded(top: string, south: string, east: string) {
  return { top, south, east };
}

// 一个 iso 立方体（带描边）
function Box({ gx, gy, gw, gd, h, gz = 0, fill, stroke = 1 }: {
  gx: number; gy: number; gw: number; gd: number; h: number; gz?: number;
  fill: { top: string; south: string; east: string };
  stroke?: number;
}) {
  const b = isoBox(gx, gy, gw, gd, h, gz);
  return (
    <g>
      <polygon points={b.east} fill={fill.east} stroke={C.ink} strokeWidth={stroke} strokeLinejoin="round" />
      <polygon points={b.south} fill={fill.south} stroke={C.ink} strokeWidth={stroke} strokeLinejoin="round" />
      <polygon points={b.top} fill={fill.top} stroke={C.ink} strokeWidth={stroke} strokeLinejoin="round" />
    </g>
  );
}

// 在墙上贴片（南墙 / 东墙）
// 南墙：沿 gx 方向，gy 固定为 0 — 即 back-right 内墙
// 东墙：沿 gy 方向，gx 固定为 ISO.gridW — 即 back-left 内墙
type WallTile = { x: number; y: number; w: number; h: number };
function southWallTile(gxStart: number, gxEnd: number, zBottom: number, zTop: number): string {
  // 内墙的"南面"= back wall right side（从 gy=0 平面延伸出来）
  const p1 = iso(gxStart, 0, zBottom);
  const p2 = iso(gxEnd, 0, zBottom);
  const p3 = iso(gxEnd, 0, zTop);
  const p4 = iso(gxStart, 0, zTop);
  return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;
}
function eastWallTile(gyStart: number, gyEnd: number, zBottom: number, zTop: number): string {
  const p1 = iso(0, gyStart, zBottom);
  const p2 = iso(0, gyEnd, zBottom);
  const p3 = iso(0, gyEnd, zTop);
  const p4 = iso(0, gyStart, zTop);
  return `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;
}

export function OfficeFloor({ nodes }: OfficeFloorProps) {
  const desks = getDeskGridPositions(nodes);
  const W = ISO.gridW;
  const D = ISO.gridD;
  const H = ISO.wallH;

  // back-right wall（沿 gx 轴的内墙，gy=0 平面）
  const wallRight = `${iso(0, 0, 0).x},${iso(0, 0, 0).y} ${iso(W, 0, 0).x},${iso(W, 0, 0).y} ${iso(W, 0, H).x},${iso(W, 0, H).y} ${iso(0, 0, H).x},${iso(0, 0, H).y}`;
  // back-left wall（沿 gy 轴的内墙，gx=0 平面）
  const wallLeft = `${iso(0, 0, 0).x},${iso(0, 0, 0).y} ${iso(0, D, 0).x},${iso(0, D, 0).y} ${iso(0, D, H).x},${iso(0, D, H).y} ${iso(0, 0, H).x},${iso(0, 0, H).y}`;

  // 地板
  const floorPoly = isoFloorRect(0, 0, W, D);

  return (
    <g>
      <defs>
        <linearGradient id="iso-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.floorTop} />
          <stop offset="100%" stopColor={C.floorTopAlt} />
        </linearGradient>
        <linearGradient id="iso-wall-right" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.wallMid} />
          <stop offset="100%" stopColor={C.wallShade} />
        </linearGradient>
        <linearGradient id="iso-wall-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.wallTop} />
          <stop offset="100%" stopColor={C.wallMid} />
        </linearGradient>
        <linearGradient id="iso-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e3a2a" />
          <stop offset="100%" stopColor="#06201a" />
        </linearGradient>
        <radialGradient id="iso-screen-glow" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#86efac" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#86efac" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="iso-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbe9f0" />
          <stop offset="100%" stopColor="#f6d8a8" />
        </linearGradient>
        <radialGradient id="iso-vignette" cx="0.5" cy="0.55" r="0.75">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
        <filter id="iso-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5" />
          <feColorMatrix type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0.05 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* 背景 cream */}
      <rect x={0} y={0} width={VIEWBOX.w} height={VIEWBOX.h} fill={C.wallTop} />

      {/* === 内墙（背景层） === */}
      {/* 左后墙（gx=0 面） */}
      <polygon points={wallLeft} fill="url(#iso-wall-left)" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
      {/* 右后墙（gy=0 面） */}
      <polygon points={wallRight} fill="url(#iso-wall-right)" stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />

      {/* 墙脚踢脚线 */}
      <polygon points={southWallTile(0, W, 0, 6)} fill={C.wallShade} opacity={0.7} />
      <polygon points={eastWallTile(0, D, 0, 6)} fill={C.wallShade} opacity={0.55} />

      {/* === 右后墙：窗户 + 挂画 + 时钟 === */}
      {/* 大窗 */}
      <g>
        <polygon points={southWallTile(7.5, 11.5, 50, 95)} fill={C.ink} />
        <polygon points={southWallTile(7.7, 11.3, 52, 93)} fill="url(#iso-sky)" />
        {/* 远山 */}
        {(() => {
          const baseZ = 60;
          const mountains = [
            { gx0: 7.7, gx1: 9.0, z: 72 },
            { gx0: 8.5, gx1: 10.5, z: 78 },
            { gx0: 9.6, gx1: 11.3, z: 70 },
          ];
          return mountains.map((m, i) => {
            const a = iso(m.gx0, 0, baseZ);
            const b = iso(m.gx1, 0, baseZ);
            const peak = iso((m.gx0 + m.gx1) / 2, 0, m.z);
            return (
              <polygon
                key={`mt${i}`}
                points={`${a.x},${a.y} ${b.x},${b.y} ${peak.x},${peak.y}`}
                fill={i === 1 ? C.sage : C.sageDark}
                opacity={0.7}
              />
            );
          });
        })()}
        {/* 太阳 */}
        {(() => {
          const s = iso(10.3, 0, 84);
          return (
            <>
              <circle cx={s.x} cy={s.y} r={18} fill="#ffd089" opacity={0.18} />
              <circle cx={s.x} cy={s.y} r={11} fill="#ffd089" />
            </>
          );
        })()}
        {/* 窗格 */}
        {(() => {
          const mid = iso(9.5, 0, 50);
          const midTop = iso(9.5, 0, 95);
          const horizL = iso(7.7, 0, 72);
          const horizR = iso(11.3, 0, 72);
          return (
            <>
              <line x1={mid.x} y1={mid.y} x2={midTop.x} y2={midTop.y} stroke={C.ink} strokeWidth={2} />
              <line x1={horizL.x} y1={horizL.y} x2={horizR.x} y2={horizR.y} stroke={C.ink} strokeWidth={2} />
            </>
          );
        })()}
      </g>

      {/* 挂画三联（右后墙） */}
      {[
        { gx: 1.0, w: 1.6, zBot: 60, zTop: 92, hue: C.terracotta },
        { gx: 3.0, w: 2.2, zBot: 65, zTop: 90, hue: C.sage },
        { gx: 5.6, w: 1.4, zBot: 62, zTop: 92, hue: C.brass },
      ].map((p, i) => (
        <g key={`art${i}`}>
          <polygon points={southWallTile(p.gx, p.gx + p.w, p.zBot, p.zTop)} fill={C.paper} stroke={C.ink} strokeWidth={1.5} />
          <polygon points={southWallTile(p.gx + 0.15, p.gx + p.w - 0.15, p.zBot + 3, p.zTop - 3)} fill={p.hue} opacity={0.85} />
        </g>
      ))}

      {/* 时钟（左后墙） */}
      {(() => {
        const c = iso(0, 2.5, 75);
        return (
          <g>
            <ellipse cx={c.x} cy={c.y} rx={14} ry={14} fill={C.paper} stroke={C.ink} strokeWidth={1.6} />
            <circle cx={c.x} cy={c.y} r={1.4} fill={C.ink} />
            <line x1={c.x} y1={c.y} x2={c.x} y2={c.y - 9} stroke={C.ink} strokeWidth={1.5} strokeLinecap="round" />
            <line x1={c.x} y1={c.y} x2={c.x + 6} y2={c.y + 1.5} stroke={C.terracotta} strokeWidth={1.5} strokeLinecap="round" />
          </g>
        );
      })()}

      {/* 白板 + 便签（左后墙） */}
      {(() => {
        const tl = iso(0, 4.8, 88);
        const br = iso(0, 7.6, 50);
        const tr = iso(0, 4.8, 50);
        const bl = iso(0, 7.6, 88);
        return (
          <g>
            <polygon points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`} fill={C.paper} stroke={C.ink} strokeWidth={1.6} />
            {/* 便签 */}
            {[
              { gy: 5.0, z: 82, c: "#f6c453" },
              { gy: 5.7, z: 85, c: "#a8d8a0" },
              { gy: 6.4, z: 80, c: "#f5a18a" },
              { gy: 5.3, z: 68, c: "#bcd9eb" },
              { gy: 6.0, z: 64, c: "#f6c453" },
              { gy: 6.8, z: 70, c: "#a8d8a0" },
            ].map((s, i) => {
              const a = iso(0, s.gy, s.z);
              const b = iso(0, s.gy + 0.55, s.z);
              const c = iso(0, s.gy + 0.55, s.z - 9);
              const d = iso(0, s.gy, s.z - 9);
              return <polygon key={i} points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill={s.c} opacity={0.92} />;
            })}
          </g>
        );
      })()}

      {/* === 地板 === */}
      <polygon points={floorPoly} fill="url(#iso-floor)" />
      {/* 地砖网格（菱形） */}
      {Array.from({ length: W }).map((_, i) =>
        Array.from({ length: D }).map((__, j) => {
          if ((i + j) % 2 !== 0) return null;
          return (
            <polygon
              key={`tile${i}-${j}`}
              points={isoFloorRect(i, j, 1, 1)}
              fill={C.floorTopAlt}
              opacity={0.35}
            />
          );
        }),
      )}
      {/* 地砖线 */}
      {Array.from({ length: W + 1 }).map((_, i) => {
        const a = iso(i, 0);
        const b = iso(i, D);
        return <line key={`gx${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.floorEdge} strokeOpacity={0.12} strokeWidth={0.6} />;
      })}
      {Array.from({ length: D + 1 }).map((_, j) => {
        const a = iso(0, j);
        const b = iso(W, j);
        return <line key={`gy${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.floorEdge} strokeOpacity={0.12} strokeWidth={0.6} />;
      })}

      {/* 阳光投射到地板 —— 来自右后窗 */}
      {(() => {
        const a = iso(7.5, 0);
        const b = iso(11.5, 0);
        const c = iso(13, 4);
        const d = iso(8, 5);
        return (
          <polygon
            points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
            fill="#fff3d4"
            opacity={0.22}
          />
        );
      })()}

      {/* === 厕所小屋（不透明 iso 建筑，靠后右角，挡住后面的人） === */}
      {(() => {
        const R = TOILET_ROOM;
        const wallFill = shaded("#5a4a36", "#a89373", "#cdb78a");
        const door = {
          gxL: R.gx + 0.55,
          gxR: R.gx + 1.25,
          gy: R.gy + R.gd,
          zTop: 50,
        };
        const roofFill = shaded("#3a2e22", "#3a2e22", "#3a2e22");
        const sign = iso(R.gx + R.gw - 0.45, R.gy + R.gd, 60);
        const ventA = iso(R.gx + R.gw, R.gy + 0.4, 50);
        const ventB = iso(R.gx + R.gw, R.gy + 0.8, 50);
        return (
          <g>
            <Box gx={R.gx} gy={R.gy} gw={R.gw} gd={R.gd} h={R.h} fill={wallFill} stroke={1.6} />
            <Box gx={R.gx - 0.1} gy={R.gy - 0.1} gw={R.gw + 0.2} gd={R.gd + 0.2} h={6} gz={R.h} fill={roofFill} stroke={1.2} />
            {/* 门框 */}
            <polygon
              points={[
                iso(door.gxL - 0.06, door.gy, 0),
                iso(door.gxR + 0.06, door.gy, 0),
                iso(door.gxR + 0.06, door.gy, door.zTop + 4),
                iso(door.gxL - 0.06, door.gy, door.zTop + 4),
              ].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill={C.brassDark}
            />
            {/* 门体 */}
            <polygon
              points={[
                iso(door.gxL, door.gy, 0),
                iso(door.gxR, door.gy, 0),
                iso(door.gxR, door.gy, door.zTop),
                iso(door.gxL, door.gy, door.zTop),
              ].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="#5a3e26"
              stroke={C.ink}
              strokeWidth={1.4}
            />
            {/* 门把手 */}
            {(() => {
              const k = iso(door.gxR - 0.12, door.gy, 26);
              return <circle cx={k.x} cy={k.y} r={1.8} fill={C.brass} stroke={C.ink} strokeWidth={0.6} />;
            })()}
            {/* "厕所"招牌（贴在门上方墙面） */}
            <rect x={sign.x - 24} y={sign.y - 11} width={48} height={18} rx={2} fill={C.paper} stroke={C.ink} strokeWidth={1.4} />
            <text x={sign.x} y={sign.y + 4} textAnchor="middle" fontSize="12" fill={C.ink}
              fontFamily='"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif' fontWeight="700" letterSpacing="0.08em">
              厕所
            </text>
            <line x1={ventA.x} y1={ventA.y} x2={ventB.x} y2={ventB.y} stroke={C.ink} strokeWidth={0.6} opacity={0.4} />
            {/* 屋顶通风口 */}
            {(() => {
              const v = iso(R.gx + 0.4, R.gy + 0.4, R.h + 18);
              return (
                <g>
                  <rect x={v.x - 8} y={v.y - 4} width={16} height={6} fill={C.metalDark} stroke={C.ink} strokeWidth={0.8} rx={1} />
                  <rect x={v.x - 6} y={v.y - 2} width={12} height={2} fill={C.metal} />
                </g>
              );
            })()}
          </g>
        );
      })()}

      {/* === 出口：门垫 + 立式灯箱 === */}
      {(() => {
        const { gx, gy } = ZONE_GRID.exit;
        return (
          <g>
            <polygon points={isoFloorRect(gx - 0.5, gy - 0.4, 1.2, 0.8)} fill={C.sage} opacity={0.45} stroke={C.ink} strokeWidth={0.8} />
            {/* 立柱 */}
            <Box gx={gx + 0.55} gy={gy - 0.1} gw={0.1} gd={0.1} h={44}
              fill={shaded("#3a342c", "#2a2620", "#4a443a")} stroke={0.8} />
            {/* 灯箱 */}
            {(() => {
              const s = iso(gx + 0.55, gy - 0.05, 42);
              return (
                <g>
                  <rect x={s.x - 14} y={s.y - 10} width={28} height={14} fill={C.ink} stroke={C.brass} strokeWidth={1} rx={1} />
                  <text x={s.x} y={s.y - 1} textAnchor="middle" fontSize="8" fill="#8df0a4" fontFamily='"IBM Plex Mono", monospace' fontWeight="700" letterSpacing="0.2em">EXIT</text>
                  {/* 箭头 */}
                  <path d={`M ${s.x - 6} ${s.y + 6} L ${s.x + 6} ${s.y + 6} L ${s.x + 4} ${s.y + 4} M ${s.x + 6} ${s.y + 6} L ${s.x + 4} ${s.y + 8}`} stroke="#8df0a4" strokeWidth={1} fill="none" strokeLinecap="round" />
                </g>
              );
            })()}
          </g>
        );
      })()}

      {/* === 工位 === */}
      {nodes.map((node, i) => {
        const g = desks[node.id];
        if (!g) return null;
        const gx = g.gx;
        const gy = g.gy;
        return (
          <g key={node.id}>
            {/* 投影 */}
            <ellipse
              cx={iso(gx + 0.8, gy + 0.5).x}
              cy={iso(gx + 0.8, gy + 0.5).y + 3}
              rx={48}
              ry={9}
              fill={C.shadow}
              opacity={0.18}
            />
            {/* 椅子背 */}
            <Box
              gx={gx + 0.55} gy={gy + 0.95} gw={0.7} gd={0.1} h={26}
              fill={shaded(C.metalDark, C.metalDark, "#5a6470")}
              stroke={0.9}
            />
            {/* 椅子座 */}
            <Box
              gx={gx + 0.45} gy={gy + 0.85} gw={0.9} gd={0.5} h={14}
              fill={shaded("#383d44", "#2a2e34", "#43484f")}
              stroke={0.9}
            />
            {/* 桌子主体 */}
            <Box
              gx={gx} gy={gy} gw={1.6} gd={0.9} h={DESK_TOP_Z}
              fill={shaded(C.woodTop, C.woodDark, C.wood)}
              stroke={1.2}
            />
            {/* 桌面高光 */}
            {(() => {
              const tl = iso(gx + 0.05, gy + 0.05, DESK_TOP_Z);
              const tr = iso(gx + 1.55, gy + 0.05, DESK_TOP_Z);
              return <line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="#e9c89a" strokeWidth={1.5} opacity={0.55} />;
            })()}
            {/* 屏幕环境光 */}
            {(() => {
              const c = iso(gx + 0.8, gy + 0.25, DESK_TOP_Z + 20);
              return <ellipse cx={c.x} cy={c.y} rx={50} ry={28} fill="url(#iso-screen-glow)" />;
            })()}
            {/* 显示器（薄盒子立在桌面） */}
            <Box
              gx={gx + 0.35} gy={gy + 0.15} gw={0.9} gd={0.1} h={32} gz={DESK_TOP_Z}
              fill={shaded("#1a1d24", "#0e1116", "#2a2e36")}
              stroke={1}
            />
            {/* 屏幕画面（在显示器正面绘制代码行） */}
            {(() => {
              const a = iso(gx + 0.4, gy + 0.1, DESK_TOP_Z + 4);
              const b = iso(gx + 1.2, gy + 0.1, DESK_TOP_Z + 4);
              const c = iso(gx + 1.2, gy + 0.1, DESK_TOP_Z + 28);
              const d = iso(gx + 0.4, gy + 0.1, DESK_TOP_Z + 28);
              const screenPoly = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
              // 代码行：在 (gx+0.45 .. gx+1.15) 区间，分 5 行
              const codeLines = [0.9, 0.78, 0.66, 0.54, 0.42];
              return (
                <g>
                  <polygon points={screenPoly} fill="url(#iso-screen)" />
                  {codeLines.map((zRel, idx) => {
                    const zAbs = DESK_TOP_Z + 4 + zRel * 24;
                    const len = 0.35 + (idx % 3) * 0.15;
                    const start = iso(gx + 0.45, gy + 0.1, zAbs);
                    const end = iso(gx + 0.45 + len, gy + 0.1, zAbs);
                    return (
                      <line
                        key={idx}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke="#22d3a8"
                        strokeWidth={1}
                        opacity={0.55 + ((idx * 7) % 5) * 0.08}
                      />
                    );
                  })}
                </g>
              );
            })()}
            {/* 桌面便签 + 咖啡杯 */}
            {(() => {
              const noteTop = isoFloorRect(gx + 0.1, gy + 0.55, 0.25, 0.25, DESK_TOP_Z + 0.5);
              const cup = iso(gx + 1.35, gy + 0.5, DESK_TOP_Z + 6);
              return (
                <g>
                  <polygon points={noteTop} fill="#f6c453" stroke={C.ink} strokeWidth={0.6} />
                  <rect x={cup.x - 3} y={cup.y - 8} width={6} height={9} fill={C.paper} stroke={C.ink} strokeWidth={0.7} rx={1} />
                  <rect x={cup.x - 3} y={cup.y - 8} width={6} height={2.5} fill={C.woodDark} />
                  <path d={`M ${cup.x + 3} ${cup.y - 5} Q ${cup.x + 7} ${cup.y - 5} ${cup.x + 7} ${cup.y - 2} Q ${cup.x + 7} ${cup.y} ${cup.x + 3} ${cup.y}`} fill="none" stroke={C.ink} strokeWidth={0.7} />
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* === 咖啡区（前-左） === */}
      {(() => {
        const { gx, gy } = ZONE_GRID.cafe;
        const cgx = gx - 0.9;
        const cgy = gy - 0.4;
        return (
          <g>
            <ellipse cx={iso(cgx + 0.9, cgy + 0.55).x} cy={iso(cgx + 0.9, cgy + 0.55).y + 3} rx={56} ry={10} fill={C.shadow} opacity={0.18} />
            {/* 吧台 */}
            <Box gx={cgx} gy={cgy} gw={1.8} gd={0.7} h={26} fill={shaded(C.woodTop, C.woodDark, C.wood)} />
            {/* 咖啡机 */}
            <Box gx={cgx + 0.15} gy={cgy + 0.15} gw={0.45} gd={0.4} h={20} gz={26} fill={shaded("#2b2620", "#1a1612", "#3a342c")} />
            {(() => {
              const knob = iso(cgx + 0.38, cgy + 0.18, 32);
              return <circle cx={knob.x} cy={knob.y} r={3} fill={C.brass} stroke={C.ink} strokeWidth={0.6} />;
            })()}
            {/* 蒸汽 */}
            {(() => {
              const sp = iso(cgx + 0.38, cgy + 0.2, 50);
              return <path className="office-steam" d={`M ${sp.x} ${sp.y} q -3 -4 0 -8 q 3 -4 0 -8`} stroke={C.paper} strokeWidth={1.4} fill="none" opacity={0.8} strokeLinecap="round" />;
            })()}
            {/* 杯子排列 */}
            {(() => {
              const c1 = iso(cgx + 0.8, cgy + 0.3, 26);
              const c2 = iso(cgx + 1.0, cgy + 0.3, 26);
              const c3 = iso(cgx + 1.2, cgy + 0.3, 26);
              return (
                <g>
                  <rect x={c1.x - 3} y={c1.y - 8} width={6} height={9} fill={C.paper} stroke={C.ink} strokeWidth={0.7} />
                  <rect x={c2.x - 3} y={c2.y - 7} width={6} height={8} fill={C.terracotta} stroke={C.ink} strokeWidth={0.7} />
                  <rect x={c3.x - 3} y={c3.y - 9} width={6} height={10} fill={C.paper} stroke={C.ink} strokeWidth={0.7} />
                </g>
              );
            })()}
            {/* 小盆栽 */}
            <Box gx={cgx + 1.4} gy={cgy + 0.15} gw={0.25} gd={0.25} h={10} gz={26} fill={shaded(C.terracottaDark, C.terracottaDark, C.terracotta)} />
            {(() => {
              const pl = iso(cgx + 1.52, cgy + 0.27, 42);
              return <ellipse cx={pl.x} cy={pl.y} rx={9} ry={11} fill={C.sage} stroke={C.ink} strokeWidth={0.8} />;
            })()}
          </g>
        );
      })()}

      {/* === 饮水机区 === */}
      {(() => {
        const { gx, gy } = ZONE_GRID.watercooler;
        const cgx = gx - 0.35;
        const cgy = gy - 0.35;
        return (
          <g>
            {/* 地毯 */}
            <polygon points={isoFloorRect(cgx - 0.5, cgy - 0.3, 1.7, 1.4, 0.5)} fill={C.terracotta} opacity={0.32} stroke={C.ink} strokeWidth={0.6} strokeOpacity={0.4} />
            {/* 饮水机底座 */}
            <Box gx={cgx} gy={cgy} gw={0.7} gd={0.7} h={24} fill={shaded(C.paper, "#d4c8ab", "#e8dcc0")} />
            {/* 水桶 */}
            <Box gx={cgx + 0.05} gy={cgy + 0.05} gw={0.6} gd={0.6} h={26} gz={24} fill={shaded("#9ccfdf", "#7fb8cc", "#b5dde8")} />
            {/* 气泡 */}
            {(() => {
              const b1 = iso(cgx + 0.35, cgy + 0.35, 38);
              const b2 = iso(cgx + 0.4, cgy + 0.3, 44);
              const b3 = iso(cgx + 0.3, cgy + 0.4, 32);
              return (
                <g>
                  <circle className="office-bubble-1" cx={b1.x} cy={b1.y} r={1.6} fill={C.paper} />
                  <circle className="office-bubble-2" cx={b2.x} cy={b2.y} r={1.2} fill={C.paper} />
                  <circle className="office-bubble-3" cx={b3.x} cy={b3.y} r={1.0} fill={C.paper} />
                </g>
              );
            })()}
            {/* 水龙头 */}
            {(() => {
              const t = iso(cgx + 0.35, cgy + 0.7, 16);
              return <circle cx={t.x} cy={t.y} r={2.5} fill={C.brass} stroke={C.ink} strokeWidth={0.6} />;
            })()}
          </g>
        );
      })()}

      {/* === 跑步机 === */}
      {(() => {
        const { gx, gy } = ZONE_GRID.treadmill;
        const cgx = gx - 0.8;
        const cgy = gy - 0.4;
        return (
          <g>
            <ellipse cx={iso(cgx + 0.8, cgy + 0.4).x} cy={iso(cgx + 0.8, cgy + 0.4).y + 3} rx={54} ry={10} fill={C.shadow} opacity={0.18} />
            {/* 跑带主体 */}
            <Box gx={cgx} gy={cgy} gw={1.6} gd={0.6} h={10} fill={shaded("#1a1612", "#0e0c0a", "#2a2620")} />
            {/* 跑带纹路 */}
            {[0.2, 0.5, 0.8, 1.1, 1.4].map((dx, i) => {
              const a = iso(cgx + dx, cgy, 10);
              const b = iso(cgx + dx, cgy + 0.6, 10);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a352e" strokeWidth={1.2} />;
            })}
            {/* 立柱 + 控制台 */}
            <Box gx={cgx + 1.4} gy={cgy} gw={0.18} gd={0.6} h={28} gz={10} fill={shaded("#4b4339", "#3a342c", "#5a5246")} />
            <Box gx={cgx + 1.32} gy={cgy} gw={0.3} gd={0.6} h={6} gz={38} fill={shaded("#3a342c", "#2a2620", "#4b4339")} />
            {(() => {
              const dp = iso(cgx + 1.48, cgy + 0.32, 42);
              return (
                <g>
                  <rect x={dp.x - 8} y={dp.y - 4} width={16} height={6} fill="#22d3a8" opacity={0.2} stroke="#22d3a8" strokeWidth={0.6} />
                  <text x={dp.x} y={dp.y + 1} textAnchor="middle" fontSize="5" fill="#22d3a8" fontFamily='"IBM Plex Mono", monospace'>5.5</text>
                </g>
              );
            })()}
          </g>
        );
      })()}

      {/* === 前景植物（不在 grid 内，舞台幕布） === */}
      <g transform="translate(40, 280)">
        <path d="M -2 100 L 36 100 L 32 150 L 2 150 Z" fill={C.terracotta} stroke={C.ink} strokeWidth={1.5} />
        <rect x={-4} y={96} width={42} height={8} fill={C.terracottaDark} stroke={C.ink} strokeWidth={1.2} />
        <g className="office-leaves">
          <path d="M 17 100 Q 0 60 -20 30 Q -10 30 17 80 Z" fill={C.sage} stroke={C.ink} strokeWidth={1.2} />
          <path d="M 17 100 Q 36 50 60 20 Q 50 30 17 80 Z" fill={C.sageDark} stroke={C.ink} strokeWidth={1.2} />
          <path d="M 17 100 Q 17 40 24 -20 Q 30 20 17 80 Z" fill={C.sage} stroke={C.ink} strokeWidth={1.2} />
          <path d="M 17 100 Q -10 50 -32 60 Q -12 50 17 80 Z" fill="#9ec293" stroke={C.ink} strokeWidth={1.2} />
        </g>
      </g>
      <g transform="translate(890, 300)">
        <path d="M -2 80 L 36 80 L 32 120 L 2 120 Z" fill={C.terracotta} stroke={C.ink} strokeWidth={1.5} />
        <rect x={-4} y={76} width={42} height={6} fill={C.terracottaDark} stroke={C.ink} strokeWidth={1.2} />
        <ellipse cx={17} cy={66} rx={22} ry={28} fill={C.sage} stroke={C.ink} strokeWidth={1.2} />
        <ellipse cx={6} cy={56} rx={12} ry={16} fill={C.sageDark} />
        <ellipse cx={28} cy={60} rx={11} ry={14} fill="#9ec293" />
      </g>

      {/* === 颗粒纸感 + vignette === */}
      <rect x={0} y={0} width={VIEWBOX.w} height={VIEWBOX.h} fill={C.paper} opacity={0.05} filter="url(#iso-grain)" pointerEvents="none" />
      <rect x={0} y={0} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#iso-vignette)" pointerEvents="none" />
    </g>
  );
}
