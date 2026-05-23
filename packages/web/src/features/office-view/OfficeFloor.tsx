import { useEffect, useState } from "react";

const C = {
  wall: "#f5ead2",
  wallShade: "#e0cb98",
  wallTrim: "#c4a26b",
  floor: "#e6cf9a",
  floorLine: "#c4a878",
  wood: "#8a6a40",
  woodDark: "#5c4423",
  desk: "#c8a370",
  deskEdge: "#8c6c44",
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
};

export const OFFICE_VIEWBOX = { w: 1240, h: 760 };

// 充电桩 (墙上主体 + 突入地面的底座)
function Dock({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 38)`}>
      <rect x={10} y={0} width={80} height={100} fill={C.dock} stroke={C.ink} strokeWidth={1.4} />
      <rect x={10} y={0} width={80} height={6} fill={C.brass} opacity={0.85} />
      <rect x={10} y={0} width={6} height={100} fill={C.dockEdge} opacity={0.6} />
      <rect x={22} y={14} width={56} height={20} rx={2} fill={C.ink} stroke={C.ink} strokeWidth={1} />
      <text x={50} y={29} textAnchor="middle" fontSize={11} fontFamily="ui-monospace, monospace" fill={C.green} fontWeight="700">CHARGE</text>
      <rect x={22} y={42} width={56} height={34} rx={2} fill="#1a1410" stroke={C.ink} strokeWidth={1} />
      <circle cx={35} cy={52} r={2} fill={C.brass} />
      <circle cx={50} cy={52} r={2} fill={C.brass} />
      <circle cx={65} cy={52} r={2} fill={C.brass} />
      <rect x={28} y={60} width={44} height={3} fill={C.brass} opacity={0.6} />
      <rect x={28} y={66} width={44} height={3} fill={C.brass} opacity={0.4} />
      <circle cx={50} cy={90} r={3.5} className="of-dock-led" stroke={C.ink} strokeWidth={0.8} />
      <rect x={6} y={100} width={88} height={14} fill={C.dockDark} stroke={C.ink} strokeWidth={1.2} />
      <ellipse cx={50} cy={118} rx={44} ry={5} fill={C.ink} opacity={0.18} />
    </g>
  );
}

// 北排桌子 (用户从北侧使用; 显示器在桌南端朝中央)
function DeskN({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 420)`}>
      <rect x={0} y={0} width={200} height={76} rx={3} fill={C.desk} stroke={C.ink} strokeWidth={1.2} />
      <rect x={0} y={76} width={200} height={6} fill={C.deskEdge} stroke={C.ink} strokeWidth={1} />
      <ellipse cx={100} cy={86} rx={98} ry={3} fill={C.ink} opacity={0.18} />
      <line x1={10} y1={12} x2={190} y2={12} stroke={C.deskEdge} strokeWidth={0.5} opacity={0.4} />
      <line x1={10} y1={60} x2={190} y2={60} stroke={C.deskEdge} strokeWidth={0.5} opacity={0.4} />
      <rect x={64} y={46} width={72} height={26} rx={1} fill={C.ink} stroke={C.ink} strokeWidth={1} />
      <rect x={68} y={48} width={64} height={22} fill="#0a1a0d" />
      <g className="of-monitor" fill={C.green}>
        <rect x={72} y={52} width={40} height={2} opacity={0.75} />
        <rect x={72} y={56} width={52} height={2} opacity={0.55} />
        <rect x={72} y={60} width={32} height={2} opacity={0.75} />
        <rect x={72} y={64} width={48} height={2} opacity={0.55} />
      </g>
      <rect x={94} y={40} width={12} height={6} fill={C.inkSoft} />
      <rect x={76} y={20} width={48} height={14} rx={1.5} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <line x1={80} y1={25} x2={120} y2={25} stroke={C.inkSoft} strokeWidth={0.4} opacity={0.5} />
      <line x1={80} y1={29} x2={120} y2={29} stroke={C.inkSoft} strokeWidth={0.4} opacity={0.5} />
      <circle cx={32} cy={28} r={6} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <circle cx={32} cy={28} r={3} fill={C.wood} />
      <rect x={160} y={20} width={22} height={16} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <line x1={164} y1={25} x2={178} y2={25} stroke={C.inkSoft} strokeWidth={0.5} />
      <line x1={164} y1={29} x2={178} y2={29} stroke={C.inkSoft} strokeWidth={0.5} />
      <line x1={164} y1={33} x2={178} y2={33} stroke={C.inkSoft} strokeWidth={0.5} />
    </g>
  );
}

// 南排桌子 (用户从南侧使用; 显示器在桌北端朝中央)
function DeskS({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 510)`}>
      <rect x={0} y={0} width={200} height={76} rx={3} fill={C.desk} stroke={C.ink} strokeWidth={1.2} />
      <rect x={0} y={76} width={200} height={6} fill={C.deskEdge} stroke={C.ink} strokeWidth={1} />
      <ellipse cx={100} cy={86} rx={98} ry={3} fill={C.ink} opacity={0.18} />
      <line x1={10} y1={14} x2={190} y2={14} stroke={C.deskEdge} strokeWidth={0.5} opacity={0.4} />
      <line x1={10} y1={60} x2={190} y2={60} stroke={C.deskEdge} strokeWidth={0.5} opacity={0.4} />
      <rect x={64} y={4} width={72} height={26} rx={1} fill={C.ink} stroke={C.ink} strokeWidth={1} />
      <rect x={68} y={6} width={64} height={22} fill="#0a1a0d" />
      <g className="of-monitor" fill={C.green}>
        <rect x={72} y={10} width={40} height={2} opacity={0.75} />
        <rect x={72} y={14} width={52} height={2} opacity={0.55} />
        <rect x={72} y={18} width={32} height={2} opacity={0.75} />
        <rect x={72} y={22} width={48} height={2} opacity={0.55} />
      </g>
      <rect x={94} y={30} width={12} height={6} fill={C.inkSoft} />
      <rect x={76} y={42} width={48} height={14} rx={1.5} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <line x1={80} y1={47} x2={120} y2={47} stroke={C.inkSoft} strokeWidth={0.4} opacity={0.5} />
      <line x1={80} y1={51} x2={120} y2={51} stroke={C.inkSoft} strokeWidth={0.4} opacity={0.5} />
      <circle cx={32} cy={48} r={6} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <circle cx={32} cy={48} r={3} fill={C.wood} />
      <rect x={160} y={40} width={22} height={16} fill={C.paper} stroke={C.ink} strokeWidth={0.8} />
      <line x1={164} y1={45} x2={178} y2={45} stroke={C.inkSoft} strokeWidth={0.5} />
      <line x1={164} y1={49} x2={178} y2={49} stroke={C.inkSoft} strokeWidth={0.5} />
      <line x1={164} y1={53} x2={178} y2={53} stroke={C.inkSoft} strokeWidth={0.5} />
    </g>
  );
}

function Chair({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 20}, ${cy - 20})`}>
      <ellipse cx={20} cy={20} rx={16} ry={9} fill={C.chair} stroke={C.ink} strokeWidth={1} />
      <ellipse cx={20} cy={18} rx={13} ry={6} fill={C.chairDark} opacity={0.65} />
      <circle cx={20} cy={36} r={1.6} fill={C.inkSoft} />
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
  const yPos = [38, 62];
  const xPos = [100, 120];
  return (
    <g
      fontFamily="ui-monospace, monospace"
      fontSize={14}
      fontWeight={700}
      fill={C.green}
      letterSpacing="0.05em"
    >
      {JOKE_LINES.map((line, i) => {
        const show = Math.max(0, Math.min(remaining, line.length));
        remaining -= line.length;
        return (
          <text key={i} x={xPos[i]} y={yPos[i]}>
            {line.slice(0, show)}
            {show < line.length && show > 0 ? "▌" : ""}
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
      {/* 北墙 */}
      <rect x={100} y={40} width={1040} height={80} fill={C.wall} stroke={C.ink} strokeWidth={1.4} />
      <rect x={100} y={100} width={1040} height={20} fill={C.wallShade} />
      <line x1={100} y1={100} x2={1140} y2={100} stroke={C.wallTrim} strokeWidth={1} />
      <rect x={100} y={118} width={1040} height={6} fill={C.ink} opacity={0.18} />

      {/* 地板 (轻微梯形透视) */}
      <polygon
        points="100,120 1140,120 1200,720 40,720"
        fill={C.floor}
        stroke={C.ink}
        strokeWidth={1.2}
      />

      {/* 地砖横线 */}
      <g stroke={C.floorLine} strokeWidth={1} opacity={0.5} fill="none">
        <line x1={93} y1={190} x2={1147} y2={190} />
        <line x1={83} y1={290} x2={1157} y2={290} />
        <line x1={73} y1={390} x2={1167} y2={390} />
        <line x1={63} y1={490} x2={1177} y2={490} />
        <line x1={53} y1={590} x2={1187} y2={590} />
        <line x1={46} y1={680} x2={1194} y2={680} />
      </g>

      {/* 区域分割虚线 */}
      <g stroke={C.woodDark} strokeWidth={1.2} strokeDasharray="6 5" fill="none" opacity={0.35}>
        <line x1={624} y1={120} x2={628} y2={330} />
        <line x1={60} y1={370} x2={1180} y2={370} />
      </g>

      {/* 走动路径 (流动虚线) */}
      <g
        stroke={C.brass}
        strokeWidth={3.5}
        strokeDasharray="10 18"
        fill="none"
        opacity={0.5}
        strokeLinecap="round"
      >
        <path className="of-path-dash" d="M 60 360 L 1180 360" />
        <path className="of-path-dash" d="M 60 705 L 1180 705" style={{ animationDelay: "-1200ms" }} />
        <path className="of-path-dash" d="M 390 320 L 390 700" style={{ animationDelay: "-800ms" }} />
        <path className="of-path-dash" d="M 690 320 L 690 700" style={{ animationDelay: "-1600ms" }} />
        <path className="of-path-dash" d="M 1040 320 L 1040 705" style={{ animationDelay: "-400ms" }} />
      </g>

      {/* 电视 (北墙东半, 屏幕朝南; 内含弹字笑话) */}
      <g transform="translate(700, 46)">
        <rect x={178} y={-4} width={20} height={6} fill={C.woodDark} stroke={C.ink} strokeWidth={0.8} />
        <rect x={0} y={0} width={380} height={80} rx={4} fill={C.tvFrame} stroke={C.ink} strokeWidth={1.5} />
        <rect x={0} y={0} width={380} height={80} rx={4} fill="none" stroke="#4a4035" strokeWidth={2} />
        <rect x={8} y={8} width={364} height={64} fill="#0a1a0d" />
        <TypewriterJoke />
        <rect x={338} y={12} width={30} height={14} rx={1.5} fill={C.ink} stroke={C.green} strokeWidth={0.8} />
        <text x={353} y={22} textAnchor="middle" fontSize={9} fontFamily="ui-monospace, monospace" fill={C.green} fontWeight={700}>CH·1</text>
        <circle cx={372} cy={76} r={2} fill={C.green} />
      </g>

      {/* 充电桩 3 个 (北墙西半) */}
      <Dock x={140} />
      <Dock x={280} />
      <Dock x={420} />

      {/* 3 人沙发座面 (在 TV 区, 机器人之下) - 中心 x=890 宽 360 */}
      <ellipse cx={780} cy={314} rx={48} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse cx={890} cy={316} rx={50} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse cx={1000} cy={314} rx={48} ry={6} fill={C.ink} opacity={0.22} />
      <ellipse cx={890} cy={300} rx={172} ry={14} fill={C.sofa} stroke={C.ink} strokeWidth={1} />

      {/* 工位 北排 (3 张桌 + 3 把椅子) */}
      <DeskN x={140} />
      <DeskN x={440} />
      <DeskN x={740} />
      <Chair cx={240} cy={420} />
      <Chair cx={540} cy={420} />
      <Chair cx={840} cy={420} />

      {/* 工位 南排 (与北排背靠背, 显示器朝中央) */}
      <DeskS x={140} />
      <DeskS x={440} />
      <DeskS x={740} />
      <Chair cx={240} cy={700} />
      <Chair cx={540} cy={700} />
      <Chair cx={840} cy={700} />
    </>
  );
}

/** 3 人沙发的靠背 (在机器人之上, 遮挡机器人下半身, 营造"坐进沙发"的视觉) */
export function CouchBack() {
  return (
    <g>
      <rect
        x={710}
        y={258}
        width={360}
        height={66}
        rx={16}
        fill={C.sofaDark}
        stroke={C.ink}
        strokeWidth={1.4}
      />
      <rect x={714} y={262} width={352} height={5} rx={2} fill="#fff" opacity={0.18} />
      {/* 三段缝线划分 3 人位 */}
      <line x1={830} y1={270} x2={830} y2={320} stroke={C.ink} strokeWidth={0.6} opacity={0.4} />
      <line x1={950} y1={270} x2={950} y2={320} stroke={C.ink} strokeWidth={0.6} opacity={0.4} />
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
      <text x={330} y={32} textAnchor="middle" fontSize={10}>— CHARGE —</text>
      <text x={890} y={32} textAnchor="middle" fontSize={10}>— BREAK —</text>
    </g>
  );
}
