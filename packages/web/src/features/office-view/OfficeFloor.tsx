import { useEffect, useState } from "react";

const C = {
  wall: "#f5ead2",
  wallShade: "#e0cb98",
  wallTrim: "#c4a26b",
  floor: "#e6cf9a",
  floorLine: "#c4a878",
  wood: "#8a6a40",
  woodDark: "#5c4423",
  woodPlank: "#d4b378",
  woodPlankDark: "#b8965c",
  rug: "#8a3a3a",
  rugDark: "#5c2424",
  rugTrim: "#d4a850",
  grate: "#7a8590",
  grateDark: "#4a5560",
  desk: "#c8a370",
  deskEdge: "#8c6c44",
  deskFront: "#a07c4c",
  deskFrontDark: "#6c4e2a",
  chair: "#4a5a68",
  chairDark: "#2f3e4a",
  sofa: "#b08864",
  sofaDark: "#7e5e40",
  dock: "#6b7a85",
  dockDark: "#455260",
  dockEdge: "#57646f",
  tvFrame: "#2a2620",
  ink: "#241c14",
  inkSoft: "#5a4a36",
  paper: "#fbf5e4",
  green: "#5fae6a",
  brass: "#c89968",
  plant: "#3f7a45",
  plantDark: "#2a5230",
  plantPot: "#a85a3a",
  plantPotDark: "#743b25",
  lampShade: "#e8c870",
  lampGlow: "#ffe9a0",
  mug: "#d4c8b4",
  mugDark: "#8a7a60",
  window: "#a8d4e8",
  windowDark: "#6a9cb4",
  sunlight: "#fff4c0",
};

export const OFFICE_VIEWBOX = { w: 1240, h: 760 };

// 充电桩 (墙上主体 + 突入地面的底座) — 紧凑版, 总宽 60
function Dock({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 50)`}>
      <rect
        x={6}
        y={0}
        width={48}
        height={70}
        fill={C.dock}
        stroke={C.ink}
        strokeWidth={1.2}
      />
      <rect x={6} y={0} width={48} height={4} fill={C.brass} opacity={0.85} />
      <rect x={6} y={0} width={4} height={70} fill={C.dockEdge} opacity={0.6} />
      <rect
        x={12}
        y={8}
        width={36}
        height={12}
        rx={1.5}
        fill={C.ink}
        stroke={C.ink}
        strokeWidth={0.8}
      />
      <text
        x={30}
        y={17}
        textAnchor="middle"
        fontSize={7}
        fontFamily="ui-monospace, monospace"
        fill={C.green}
        fontWeight="700"
      >
        CHARGE
      </text>
      <rect
        x={12}
        y={24}
        width={36}
        height={22}
        rx={1.5}
        fill="#1a1410"
        stroke={C.ink}
        strokeWidth={0.8}
      />
      <circle cx={20} cy={30} r={1.4} fill={C.brass} />
      <circle cx={30} cy={30} r={1.4} fill={C.brass} />
      <circle cx={40} cy={30} r={1.4} fill={C.brass} />
      <rect x={16} y={35} width={28} height={2} fill={C.brass} opacity={0.6} />
      <rect x={16} y={39} width={28} height={2} fill={C.brass} opacity={0.4} />
      <circle
        cx={30}
        cy={60}
        r={2.4}
        className="of-dock-led"
        stroke={C.ink}
        strokeWidth={0.6}
      />
      {/* 底座: 顶面 + 正面立面 */}
      <rect
        x={4}
        y={70}
        width={52}
        height={7}
        fill={C.dockDark}
        stroke={C.ink}
        strokeWidth={1}
      />
      <rect
        x={4}
        y={77}
        width={52}
        height={10}
        fill={C.dock}
        stroke={C.ink}
        strokeWidth={1}
      />
      <rect x={4} y={77} width={52} height={2} fill="#fff" opacity={0.18} />
      <ellipse cx={30} cy={90} rx={28} ry={3.5} fill={C.ink} opacity={0.22} />
    </g>
  );
}

// 北排桌子 (用户从北侧使用; 显示器在桌南端朝中央) — 宽 140
// 镜头从南看, 北排桌的正面 (南侧边) 朝向镜头, 北侧立面被桌面遮挡 → 只画一条桌沿描边
function DeskN({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 420)`}>
      {/* 桌底阴影 (落在桌南侧地面) */}
      <ellipse cx={70} cy={62} rx={68} ry={3} fill={C.ink} opacity={0.16} />
      <rect
        x={0}
        y={0}
        width={140}
        height={56}
        rx={2.5}
        fill={C.desk}
        stroke={C.ink}
        strokeWidth={1.1}
      />
      <line
        x1={8}
        y1={8}
        x2={132}
        y2={8}
        stroke={C.deskEdge}
        strokeWidth={0.5}
        opacity={0.4}
      />
      <line
        x1={8}
        y1={46}
        x2={132}
        y2={46}
        stroke={C.deskEdge}
        strokeWidth={0.5}
        opacity={0.4}
      />
      {/* 桌沿一条 (南侧, 朝镜头) */}
      <rect
        x={0}
        y={56}
        width={140}
        height={3}
        fill={C.deskEdge}
        stroke={C.ink}
        strokeWidth={0.9}
      />
      {/* 南侧桌腿 (朝镜头, 露在桌面下方) */}
      <rect
        x={3}
        y={59}
        width={5}
        height={5}
        fill={C.deskFrontDark}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <rect
        x={132}
        y={59}
        width={5}
        height={5}
        fill={C.deskFrontDark}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      {/* 显示器 (桌南端) */}
      <rect
        x={44}
        y={32}
        width={52}
        height={20}
        rx={1}
        fill={C.ink}
        stroke={C.ink}
        strokeWidth={0.9}
      />
      <rect x={47} y={34} width={46} height={16} fill="#0a1a0d" />
      <g className="of-monitor" fill={C.green}>
        <rect x={50} y={37} width={28} height={1.6} opacity={0.75} />
        <rect x={50} y={40} width={38} height={1.6} opacity={0.55} />
        <rect x={50} y={43} width={22} height={1.6} opacity={0.75} />
        <rect x={50} y={46} width={34} height={1.6} opacity={0.55} />
      </g>
      <rect x={66} y={28} width={8} height={4} fill={C.inkSoft} />
      {/* 键盘 */}
      <rect
        x={54}
        y={15}
        width={32}
        height={10}
        rx={1}
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <line
        x1={57}
        y1={18.5}
        x2={83}
        y2={18.5}
        stroke={C.inkSoft}
        strokeWidth={0.4}
        opacity={0.5}
      />
      <line
        x1={57}
        y1={21.5}
        x2={83}
        y2={21.5}
        stroke={C.inkSoft}
        strokeWidth={0.4}
        opacity={0.5}
      />
      <Mug cx={20} cy={20} />
      <DeskLamp cx={36} cy={18} />
      {/* 文件 (右侧) */}
      <rect
        x={108}
        y={15}
        width={18}
        height={12}
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <line
        x1={111}
        y1={19}
        x2={123}
        y2={19}
        stroke={C.inkSoft}
        strokeWidth={0.4}
      />
      <line
        x1={111}
        y1={22}
        x2={123}
        y2={22}
        stroke={C.inkSoft}
        strokeWidth={0.4}
      />
    </g>
  );
}

// 南排桌子 (用户从南侧使用; 显示器在桌北端朝中央) — 宽 140
function DeskS({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 540)`}>
      <rect
        x={0}
        y={0}
        width={140}
        height={56}
        rx={2.5}
        fill={C.desk}
        stroke={C.ink}
        strokeWidth={1.1}
      />
      <line
        x1={8}
        y1={10}
        x2={132}
        y2={10}
        stroke={C.deskEdge}
        strokeWidth={0.5}
        opacity={0.4}
      />
      <line
        x1={8}
        y1={48}
        x2={132}
        y2={48}
        stroke={C.deskEdge}
        strokeWidth={0.5}
        opacity={0.4}
      />
      <rect
        x={0}
        y={56}
        width={140}
        height={3}
        fill={C.deskEdge}
        stroke={C.ink}
        strokeWidth={0.9}
      />
      <rect
        x={0}
        y={59}
        width={140}
        height={11}
        fill={C.deskFront}
        stroke={C.ink}
        strokeWidth={0.9}
      />
      <rect x={0} y={59} width={140} height={2.5} fill="#fff" opacity={0.22} />
      <rect
        x={3}
        y={70}
        width={5}
        height={5}
        fill={C.deskFrontDark}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <rect
        x={132}
        y={70}
        width={5}
        height={5}
        fill={C.deskFrontDark}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <ellipse cx={70} cy={78} rx={66} ry={2.5} fill={C.ink} opacity={0.18} />
      {/* 显示器 (桌北端) */}
      <rect
        x={44}
        y={4}
        width={52}
        height={20}
        rx={1}
        fill={C.ink}
        stroke={C.ink}
        strokeWidth={0.9}
      />
      <rect x={47} y={6} width={46} height={16} fill="#0a1a0d" />
      <g className="of-monitor" fill={C.green}>
        <rect x={50} y={9} width={28} height={1.6} opacity={0.75} />
        <rect x={50} y={12} width={38} height={1.6} opacity={0.55} />
        <rect x={50} y={15} width={22} height={1.6} opacity={0.75} />
        <rect x={50} y={18} width={34} height={1.6} opacity={0.55} />
      </g>
      <rect x={66} y={24} width={8} height={4} fill={C.inkSoft} />
      {/* 键盘 */}
      <rect
        x={54}
        y={32}
        width={32}
        height={10}
        rx={1}
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <line
        x1={57}
        y1={35.5}
        x2={83}
        y2={35.5}
        stroke={C.inkSoft}
        strokeWidth={0.4}
        opacity={0.5}
      />
      <line
        x1={57}
        y1={38.5}
        x2={83}
        y2={38.5}
        stroke={C.inkSoft}
        strokeWidth={0.4}
        opacity={0.5}
      />
      <Mug cx={20} cy={38} />
      <DeskLamp cx={36} cy={34} />
      <rect
        x={108}
        y={32}
        width={18}
        height={12}
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={0.7}
      />
      <line
        x1={111}
        y1={36}
        x2={123}
        y2={36}
        stroke={C.inkSoft}
        strokeWidth={0.4}
      />
      <line
        x1={111}
        y1={40}
        x2={123}
        y2={40}
        stroke={C.inkSoft}
        strokeWidth={0.4}
      />
    </g>
  );
}

function Chair({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 20}, ${cy - 20})`}>
      <ellipse
        cx={20}
        cy={20}
        rx={16}
        ry={9}
        fill={C.chair}
        stroke={C.ink}
        strokeWidth={1}
      />
      <ellipse
        cx={20}
        cy={18}
        rx={13}
        ry={6}
        fill={C.chairDark}
        opacity={0.65}
      />
      <circle cx={20} cy={36} r={1.6} fill={C.inkSoft} />
    </g>
  );
}

// 咖啡杯 (顶视: 圆盘 + 杯口圈 + 把手)
function Mug({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle r={5.5} fill={C.mug} stroke={C.ink} strokeWidth={0.8} />
      <circle r={3.5} fill={C.mugDark} opacity={0.55} />
      <path
        d="M 5 -1 Q 9 0 9 3 Q 9 5 5 4"
        fill="none"
        stroke={C.ink}
        strokeWidth={0.8}
      />
    </g>
  );
}

// 台灯 (顶视: 灯罩 + 暖光晕)
function DeskLamp({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <circle className="of-lamp-glow" r={22} fill={C.lampGlow} opacity={0.22} />
      <circle className="of-lamp-glow of-lamp-glow-inner" r={12} fill={C.lampGlow} opacity={0.5} />
      <circle r={4} fill={C.lampShade} stroke={C.ink} strokeWidth={0.8} />
      <circle r={1.5} fill={C.lampGlow} />
    </g>
  );
}

// 盆栽 (顶视: 叶子团 + 花盆边)
function Plant({
  cx,
  cy,
  size = 1,
}: {
  cx: number;
  cy: number;
  size?: number;
}) {
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${size})`}>
      <ellipse cx={0} cy={6} rx={20} ry={5} fill={C.ink} opacity={0.22} />
      {/* 花盆侧面 */}
      <rect
        x={-14}
        y={-2}
        width={28}
        height={10}
        fill={C.plantPot}
        stroke={C.ink}
        strokeWidth={1}
      />
      <rect
        x={-14}
        y={-2}
        width={28}
        height={3}
        fill={C.plantPotDark}
        opacity={0.5}
      />
      {/* 叶子团 */}
      <circle
        cx={-8}
        cy={-6}
        r={10}
        fill={C.plantDark}
        stroke={C.ink}
        strokeWidth={1}
      />
      <circle
        cx={6}
        cy={-8}
        r={11}
        fill={C.plant}
        stroke={C.ink}
        strokeWidth={1}
      />
      <circle
        cx={-2}
        cy={-12}
        r={9}
        fill={C.plant}
        stroke={C.ink}
        strokeWidth={1}
      />
      <circle cx={4} cy={-4} r={6} fill={C.plantDark} opacity={0.6} />
      {/* 叶脉高光 */}
      <path
        d="M -2 -14 L -2 -4"
        stroke={C.plantDark}
        strokeWidth={0.6}
        opacity={0.5}
        fill="none"
      />
      <path
        d="M 6 -10 L 6 -2"
        stroke={C.plantDark}
        strokeWidth={0.6}
        opacity={0.5}
        fill="none"
      />
    </g>
  );
}

// 白板 (挂墙)
function Whiteboard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={0}
        y={0}
        width={110}
        height={56}
        fill={C.paper}
        stroke={C.ink}
        strokeWidth={1.4}
      />
      <rect x={0} y={0} width={110} height={4} fill={C.inkSoft} opacity={0.3} />
      <rect
        x={0}
        y={52}
        width={110}
        height={4}
        fill={C.inkSoft}
        opacity={0.3}
      />
      {/* 涂鸦 */}
      <line x1={8} y1={14} x2={50} y2={14} stroke="#3a6ab8" strokeWidth={1.4} />
      <line x1={8} y1={22} x2={42} y2={22} stroke="#3a6ab8" strokeWidth={1.4} />
      <rect
        x={60}
        y={10}
        width={20}
        height={14}
        fill="none"
        stroke="#c25450"
        strokeWidth={1.2}
      />
      <path
        d="M 64 17 L 68 21 L 76 13"
        fill="none"
        stroke="#5fae6a"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={8}
        y1={34}
        x2={94}
        y2={34}
        stroke={C.inkSoft}
        strokeWidth={0.8}
        opacity={0.4}
      />
      <line
        x1={8}
        y1={42}
        x2={70}
        y2={42}
        stroke={C.inkSoft}
        strokeWidth={0.8}
        opacity={0.4}
      />
    </g>
  );
}

// 窗户 (北墙)
function Window({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 50)`}>
      <rect
        x={0}
        y={0}
        width={70}
        height={48}
        fill={C.windowDark}
        stroke={C.ink}
        strokeWidth={1.4}
      />
      <rect x={3} y={3} width={64} height={42} fill={C.window} />
      {/* 径向暖光 (从玻璃透进来) */}
      <rect x={3} y={3} width={64} height={42} fill="url(#of-window-glow)" />
      <line x1={35} y1={3} x2={35} y2={45} stroke={C.ink} strokeWidth={1.2} />
      <line x1={3} y1={24} x2={67} y2={24} stroke={C.ink} strokeWidth={1.2} />
      {/* 玻璃高光 */}
      <polygon points="6,6 18,6 8,20" fill="#fff" opacity={0.5} />
      <polygon points="38,28 50,28 40,42" fill="#fff" opacity={0.35} />
    </g>
  );
}

const JOKE_LINES = ["WHY DO BOTS DREAM?", "FOR REM SLEEP."];

/** 电视屏内的逐字打字笑话, 循环 */
function TypewriterJoke() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const total = JOKE_LINES.reduce((sum, l) => sum + l.length, 0);
    const charMs = 110;
    const typeMs = total * charMs;
    const holdMs = 3000;
    const gapMs = 1500;
    const cycle = typeMs + holdMs + gapMs;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) % cycle;
      if (t < typeMs) setCount(Math.floor(t / charMs));
      else if (t < typeMs + holdMs) setCount(total);
      else setCount(0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  let remaining = count;
  const yPos = [30, 52];
  return (
    <g
      fontFamily="ui-monospace, monospace"
      fontSize={13}
      fontWeight={700}
      fill={C.green}
      letterSpacing="0.05em"
      textAnchor="middle"
    >
      {JOKE_LINES.map((line, i) => {
        const show = Math.max(0, Math.min(remaining, line.length));
        remaining -= line.length;
        const text =
          line.slice(0, show) + (show < line.length && show > 0 ? "▌" : "");
        return (
          <text key={i} x={160} y={yPos[i]}>
            {text}
          </text>
        );
      })}
    </g>
  );
}

/**
 * 背景层: 墙 / 地板 / 区域分割 / 走道路径 / 电视 / 充电桩 / 沙发座面 / 工位
 * 注意: 沙发靠背 (CouchBack) 单独导出, 由调用方在机器人之后渲染.
 */
export function OfficeFloor() {
  return (
    <>
      <defs>
        {/* 阳光斑渐变: 中心亮黄, 边缘透明, 营造柔光 */}
        <linearGradient id="of-sunlight" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={C.sunlight} stopOpacity={0.55} />
          <stop offset="60%" stopColor={C.sunlight} stopOpacity={0.28} />
          <stop offset="100%" stopColor={C.sunlight} stopOpacity={0} />
        </linearGradient>
        {/* 窗户内玻璃径向高光 */}
        <radialGradient id="of-window-glow" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.6} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* 北墙 */}
      <rect
        x={100}
        y={40}
        width={1040}
        height={80}
        fill={C.wall}
        stroke={C.ink}
        strokeWidth={1.4}
      />
      <rect x={100} y={100} width={1040} height={20} fill={C.wallShade} />
      <line
        x1={100}
        y1={100}
        x2={1140}
        y2={100}
        stroke={C.wallTrim}
        strokeWidth={1}
      />
      <rect
        x={100}
        y={118}
        width={1040}
        height={6}
        fill={C.ink}
        opacity={0.18}
      />

      {/* 地板基底 (轻微梯形透视) */}
      <polygon
        points="100,120 1140,120 1200,720 40,720"
        fill={C.floor}
        stroke={C.ink}
        strokeWidth={1.2}
      />

      {/* 充电区: 金属格栅地面 (x: ~60-620, y: 120-370) */}
      <g>
        <polygon
          points="100,120 624,120 628,370 78,370"
          fill={C.grate}
          opacity={0.55}
        />
        <g stroke={C.grateDark} strokeWidth={0.8} opacity={0.5} fill="none">
          {Array.from({ length: 9 }).map((_, i) => {
            const y = 140 + i * 28;
            return <line key={`gh-${i}`} x1={88} y1={y} x2={626} y2={y} />;
          })}
          {Array.from({ length: 11 }).map((_, i) => {
            const x = 120 + i * 50;
            return <line key={`gv-${i}`} x1={x} y1={120} x2={x + 3} y2={370} />;
          })}
        </g>
      </g>

      {/* 休息区: 圆角地毯 (沙发与电视之间, x: 690-1090, y: 230-360) */}
      <g>
        <rect
          x={690}
          y={230}
          width={400}
          height={130}
          rx={18}
          fill={C.rug}
          stroke={C.ink}
          strokeWidth={1.4}
        />
        <rect
          x={698}
          y={238}
          width={384}
          height={114}
          rx={14}
          fill="none"
          stroke={C.rugTrim}
          strokeWidth={1.2}
          opacity={0.8}
        />
        <rect
          x={706}
          y={246}
          width={368}
          height={98}
          rx={10}
          fill="none"
          stroke={C.rugDark}
          strokeWidth={0.8}
          strokeDasharray="6 4"
          opacity={0.7}
        />
        {/* 地毯中心菱形装饰 */}
        <g
          transform="translate(890, 295)"
          fill="none"
          stroke={C.rugTrim}
          strokeWidth={1}
          opacity={0.7}
        >
          <path d="M 0 -16 L 18 0 L 0 16 L -18 0 Z" />
          <path d="M 0 -8 L 9 0 L 0 8 L -9 0 Z" />
        </g>
      </g>

      {/* 工位区: 木地板 (整个南半部, y: 370-720) */}
      <g>
        <polygon
          points="68,370 1172,370 1200,720 40,720"
          fill={C.woodPlank}
          opacity={0.7}
        />
        {/* 木纹竖线 (按梯形透视微微外扩) */}
        <g
          stroke={C.woodPlankDark}
          strokeWidth={0.9}
          opacity={0.55}
          fill="none"
        >
          <line x1={220} y1={370} x2={210} y2={720} />
          <line x1={380} y1={370} x2={375} y2={720} />
          <line x1={540} y1={370} x2={540} y2={720} />
          <line x1={700} y1={370} x2={705} y2={720} />
          <line x1={860} y1={370} x2={870} y2={720} />
          <line x1={1020} y1={370} x2={1035} y2={720} />
        </g>
        {/* 木地板横向接缝 (随机错位) */}
        <g stroke={C.woodDark} strokeWidth={0.6} opacity={0.35} fill="none">
          <line x1={68} y1={460} x2={300} y2={460} />
          <line x1={400} y1={460} x2={700} y2={460} />
          <line x1={800} y1={460} x2={1172} y2={460} />
          <line x1={68} y1={560} x2={500} y2={560} />
          <line x1={600} y1={560} x2={900} y2={560} />
          <line x1={1000} y1={560} x2={1172} y2={560} />
          <line x1={68} y1={660} x2={250} y2={660} />
          <line x1={350} y1={660} x2={780} y2={660} />
          <line x1={880} y1={660} x2={1172} y2={660} />
        </g>
      </g>

      {/* 区域分割 (保留一条细虚线, 强化"功能边界") */}
      <g
        stroke={C.woodDark}
        strokeWidth={1.2}
        strokeDasharray="6 5"
        fill="none"
        opacity={0.25}
      >
        <line x1={624} y1={120} x2={628} y2={370} />
      </g>

      {/* 走动路径 (流动虚线) */}
      <g
        stroke={C.brass}
        strokeWidth={3.5}
        strokeDasharray="10 18"
        fill="none"
        opacity={0.45}
        strokeLinecap="round"
      >
        <path className="of-path-dash" d="M 60 360 L 1180 360" />
        <path
          className="of-path-dash"
          d="M 60 705 L 1180 705"
          style={{ animationDelay: "-1200ms" }}
        />
        <path
          className="of-path-dash"
          d="M 390 320 L 390 700"
          style={{ animationDelay: "-800ms" }}
        />
        <path
          className="of-path-dash"
          d="M 690 320 L 690 700"
          style={{ animationDelay: "-1600ms" }}
        />
        <path
          className="of-path-dash"
          d="M 1040 320 L 1040 705"
          style={{ animationDelay: "-400ms" }}
        />
      </g>

      {/* 北墙窗户 (电视两侧) */}
      <Window x={560} />
      <Window x={1020} />

      {/* 阳光斑 (窗下, 投到地板上) — 用渐变柔边, 延伸到工位区上沿 */}
      <g fill="url(#of-sunlight)">
        <polygon points="560,118 630,118 710,310 480,310" />
        <polygon points="1020,118 1090,118 1170,310 940,310" />
      </g>
      {/* 阳光斑高光中心 (更亮的内核) */}
      <g fill={C.sunlight} opacity={0.35} className="of-sun-pulse">
        <ellipse cx={595} cy={170} rx={42} ry={28} />
        <ellipse cx={1055} cy={170} rx={42} ry={28} />
      </g>

      {/* 电视 (北墙中部, 屏幕朝南; 内含弹字笑话) — 宽 320, 居中 x=780 */}
      <g transform="translate(660, 46)">
        <rect
          x={148}
          y={-4}
          width={24}
          height={6}
          fill={C.woodDark}
          stroke={C.ink}
          strokeWidth={0.8}
        />
        <rect
          x={0}
          y={0}
          width={320}
          height={70}
          rx={4}
          fill={C.tvFrame}
          stroke={C.ink}
          strokeWidth={1.5}
        />
        <rect
          x={0}
          y={0}
          width={320}
          height={70}
          rx={4}
          fill="none"
          stroke="#4a4035"
          strokeWidth={2}
        />
        <rect x={8} y={8} width={304} height={54} fill="#0a1a0d" />
        <TypewriterJoke />
        <rect
          x={280}
          y={10}
          width={30}
          height={12}
          rx={1.5}
          fill={C.ink}
          stroke={C.green}
          strokeWidth={0.8}
        />
        <text
          x={295}
          y={19}
          textAnchor="middle"
          fontSize={8}
          fontFamily="ui-monospace, monospace"
          fill={C.green}
          fontWeight={700}
        >
          CH·1
        </text>
        <circle cx={312} cy={66} r={2} fill={C.green} />
      </g>

      {/* 白板 (充电桩与电视之间) */}
      <Whiteboard x={440} y={56} />

      {/* 充电桩 4 个 (北墙西半, 集中靠左, 间距 70, x=140/210/280/350) */}
      <Dock x={140} />
      <Dock x={210} />
      <Dock x={280} />
      <Dock x={350} />

      {/* 角落盆栽 (4 个) */}
      <Plant cx={80} cy={356} size={1.0} />
      <Plant cx={1160} cy={356} size={1.1} />
      <Plant cx={60} cy={710} size={1.2} />
      <Plant cx={1180} cy={710} size={1.2} />

      {/* 3 人沙发座面 (在 TV 区, 机器人之下) - 中心 x=890 宽 360 */}
      <ellipse cx={780} cy={314} rx={48} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse cx={890} cy={316} rx={50} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse cx={1000} cy={314} rx={48} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse
        cx={890}
        cy={300}
        rx={172}
        ry={14}
        fill={C.sofa}
        stroke={C.ink}
        strokeWidth={1}
      />

      {/* 沙发旁茶几小盆栽 */}
      <Plant cx={680} cy={310} size={0.6} />
      <Plant cx={1100} cy={310} size={0.6} />

      {/* 工位 北排: 椅子在这里画 (会被 NorthDeskOverlay 桌面遮上半, 模拟椅推进桌底);
          北排桌 DeskN 已挪到 NorthDeskOverlay, 在机器人之后渲染以遮住机器人下 1/3 */}
      <Chair cx={200} cy={430} />
      <Chair cx={440} cy={430} />
      <Chair cx={680} cy={430} />
      <Chair cx={920} cy={430} />

      {/* 工位 南排: 桌在前, 椅在后 (椅子从镜头侧"坐进"桌底, 桌前画椅压住桌沿) */}
      <DeskS x={130} />
      <DeskS x={370} />
      <DeskS x={610} />
      <DeskS x={850} />
      <Chair cx={200} cy={650} />
      <Chair cx={440} cy={650} />
      <Chair cx={680} cy={650} />
      <Chair cx={920} cy={650} />

      {/* 工位区点缀盆栽 (桌间空隙) */}
      <Plant cx={310} cy={500} size={0.6} />
      <Plant cx={550} cy={500} size={0.6} />
      <Plant cx={790} cy={500} size={0.6} />
      <Plant cx={1030} cy={500} size={0.6} />
    </>
  );
}

/** 北排桌覆盖层 (在机器人之后渲染, 遮住北排机器人下 1/3 模拟"站在桌后") */
export function NorthDeskOverlay() {
  return (
    <>
      <DeskN x={130} />
      <DeskN x={370} />
      <DeskN x={610} />
      <DeskN x={850} />
    </>
  );
}

/** 3 人沙发的靠背 (在机器人之上, 遮挡机器人下半身, 营造"坐进沙发"的视觉) */
export function CouchBack() {
  return (
    <g>
      <rect
        x={710}
        y={284}
        width={360}
        height={40}
        rx={12}
        fill={C.sofaDark}
        stroke={C.ink}
        strokeWidth={1.4}
      />
      <rect
        x={714}
        y={288}
        width={352}
        height={4}
        rx={2}
        fill="#fff"
        opacity={0.18}
      />
      <line
        x1={830}
        y1={294}
        x2={830}
        y2={320}
        stroke={C.ink}
        strokeWidth={0.6}
        opacity={0.4}
      />
      <line
        x1={950}
        y1={294}
        x2={950}
        y2={320}
        stroke={C.ink}
        strokeWidth={0.6}
        opacity={0.4}
      />
    </g>
  );
}

/** 墙顶区域文字标签 */
export function ZoneLabels() {
  return (
    <g
      fontFamily="ui-monospace, monospace"
      fontWeight={700}
      letterSpacing="0.18em"
      fill={C.inkSoft}
    >
      <text x={420} y={32} textAnchor="middle" fontSize={10}>
        — CHARGE —
      </text>
      <text x={890} y={32} textAnchor="middle" fontSize={10}>
        — BREAK —
      </text>
    </g>
  );
}
