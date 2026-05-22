import type { Mood, Placement, Zone } from "./placement";

const PALETTE: Array<{ shirt: string; hair: string; skin: string }> = [
  { shirt: "#c97a5b", hair: "#2c1810", skin: "#f3d1ad" },
  { shirt: "#5b7a8d", hair: "#3a2410", skin: "#ecc7a2" },
  { shirt: "#7d9b6a", hair: "#1a0d05", skin: "#f3d1ad" },
  { shirt: "#c89968", hair: "#6e4220", skin: "#f5dbb6" },
  { shirt: "#8a6691", hair: "#161013", skin: "#e6c39e" },
  { shirt: "#b85c5c", hair: "#a8581a", skin: "#f3d1ad" },
  { shirt: "#4d8a86", hair: "#2c1810", skin: "#deba8f" },
  { shirt: "#a08a3e", hair: "#3a2410", skin: "#ecc7a2" },
];

const INK = "#241c14";
const INK_SOFT = "#5a4a36";
const PAPER = "#fbf5e4";

type View = "front" | "back" | "side";

function getView(mood: Mood, zone: Zone): View {
  if (mood === "leaving") return "side";
  if (mood === "slacking" && zone === "treadmill") return "side";
  if (mood === "working" || mood === "compensating" || mood === "watching") return "back";
  return "front";
}

interface PersonProps {
  placement: Placement;
}

export function Person({ placement }: PersonProps) {
  const { x, y, facing, mood, paletteIdx, title, status, zone } = placement;
  const c = PALETTE[paletteIdx]!;
  const flip = facing === "left" ? -1 : 1;
  const view = getView(mood, zone);

  // 厕所内：只显示名字漂浮在屋顶上方
  if (zone === "toilet") {
    return (
      <g
        className="office-person"
        transform={`translate(${x}, ${y})`}
        style={{ transitionProperty: "transform" }}
      >
        <g transform="translate(0, -70)">
          <rect x={-30} y={-9} width={60} height={15} rx={2} fill={PAPER} stroke={INK} strokeWidth={1} opacity={0.96} />
          <circle cx={-26} cy={-2} r={1.2} fill="#c97a5b" stroke={INK} strokeWidth={0.4} />
          <circle cx={26} cy={-2} r={1.2} fill="#c97a5b" stroke={INK} strokeWidth={0.4} />
          {/* 厕纸卷小图标 */}
          <g transform="translate(-22, -3)">
            <circle r={3.2} fill={PAPER} stroke={INK} strokeWidth={0.7} />
            <circle r={1.1} fill={INK_SOFT} />
            <path d="M 3.2 0 Q 5 2 4 4" stroke={INK} strokeWidth={0.6} fill="none" />
          </g>
          <text
            x={4}
            y={2}
            textAnchor="middle"
            fontSize="9"
            fontFamily='"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif'
            fontWeight="500"
            fill={INK}
            letterSpacing="0.02em"
          >
            {title.length > 6 ? title.slice(0, 5) + "…" : title}
          </text>
        </g>
      </g>
    );
  }

  const ringColor =
    status === "running"
      ? "#3a8a5f"
      : status === "failed"
        ? "#b14444"
        : status === "completed"
          ? "#5b6fb3"
          : status === "blocked"
            ? "#c89968"
            : "transparent";

  return (
    <g
      className="office-person"
      transform={`translate(${x}, ${y})`}
      style={{ transitionProperty: "transform" }}
    >
      <ellipse cx={0} cy={2} rx={11} ry={2.4} fill={INK} opacity={0.28} />

      <g transform="translate(0, -70)">
        <rect x={-28} y={-9} width={56} height={15} rx={2} fill={PAPER} stroke={INK} strokeWidth={1} opacity={0.96} />
        <circle cx={-24} cy={-2} r={1.2} fill="#c97a5b" stroke={INK} strokeWidth={0.4} />
        <circle cx={24} cy={-2} r={1.2} fill="#c97a5b" stroke={INK} strokeWidth={0.4} />
        <text
          x={0}
          y={2}
          textAnchor="middle"
          fontSize="9"
          fontFamily='"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif'
          fontWeight="500"
          fill={INK}
          letterSpacing="0.02em"
        >
          {title.length > 7 ? title.slice(0, 6) + "…" : title}
        </text>
      </g>

      <g className={`office-mood-${mood}`} transform={`scale(${flip}, 1)`}>
        {ringColor !== "transparent" && (
          <>
            <circle cx={0} cy={-32} r={22} fill={ringColor} opacity={0.12} />
            <circle cx={0} cy={-32} r={22} fill="none" stroke={ringColor} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.55} />
          </>
        )}

        {/* 腿 + 鞋（带走路 anim 类） */}
        <g className="office-walk-legs">
          <g className="office-walk-leg-l">
            <rect x={-6} y={-12} width={4} height={12} fill="#2a2620" rx={1} />
            <rect x={-7} y={-2} width={6} height={3} fill={INK} rx={1} />
          </g>
          <g className="office-walk-leg-r">
            <rect x={2} y={-12} width={4} height={12} fill="#2a2620" rx={1} />
            <rect x={1} y={-2} width={6} height={3} fill={INK} rx={1} />
          </g>
        </g>

        {/* 身体（衬衫） */}
        <path
          d="M -10 -32 L -10 -14 Q -10 -10 -6 -10 L 6 -10 Q 10 -10 10 -14 L 10 -32 Z"
          fill={c.shirt}
          stroke={INK}
          strokeWidth={1.2}
        />
        {/* 衬衫高光（背面不画） */}
        {view !== "back" && (
          <path d="M -8 -30 L -8 -14" stroke="#fff" strokeWidth={1} opacity={0.18} />
        )}
        {/* 领口 / 后领 / 侧领 */}
        {view === "front" && (
          <>
            <path d="M -4 -32 L 0 -28 L 4 -32" stroke={INK_SOFT} strokeWidth={0.9} fill="none" />
            {/* 胸前一行扣子 */}
            <circle cx={0} cy={-22} r={0.6} fill={INK_SOFT} />
            <circle cx={0} cy={-18} r={0.6} fill={INK_SOFT} />
          </>
        )}
        {view === "back" && (
          <>
            <line x1={0} y1={-30} x2={0} y2={-12} stroke={INK} strokeWidth={0.7} opacity={0.4} />
            <path d="M -5 -32 Q 0 -30 5 -32" stroke={INK_SOFT} strokeWidth={0.8} fill="none" />
          </>
        )}
        {view === "side" && (
          <path d="M -2 -32 L 3 -30" stroke={INK_SOFT} strokeWidth={0.8} fill="none" />
        )}

        {/* 手臂 */}
        {mood === "working" || mood === "compensating" ? (
          // 工作姿：双手前伸（背面看 → 不画手）
          <>
            <rect x={-13} y={-30} width={5} height={11} fill={c.shirt} stroke={INK} strokeWidth={1} rx={1.5} />
            <rect x={8} y={-30} width={5} height={11} fill={c.shirt} stroke={INK} strokeWidth={1} rx={1.5} />
            {view === "front" && (
              <>
                <circle cx={-10.5} cy={-19} r={1.8} fill={c.skin} stroke={INK} strokeWidth={0.6} />
                <circle cx={10.5} cy={-19} r={1.8} fill={c.skin} stroke={INK} strokeWidth={0.6} />
              </>
            )}
          </>
        ) : mood === "celebrating" ? (
          <>
            <path d="M -10 -30 L -16 -42" stroke={c.shirt} strokeWidth={5} strokeLinecap="round" />
            <path d="M 10 -30 L 16 -42" stroke={c.shirt} strokeWidth={5} strokeLinecap="round" />
            <path d="M -10 -30 L -16 -42" stroke={INK} strokeWidth={1} fill="none" />
            <path d="M 10 -30 L 16 -42" stroke={INK} strokeWidth={1} fill="none" />
            <circle cx={-16} cy={-44} r={3} fill="#f6c453" stroke={INK} strokeWidth={1} />
            <circle cx={16} cy={-44} r={3} fill="#f6c453" stroke={INK} strokeWidth={1} />
          </>
        ) : mood === "crying" ? (
          <>
            <path d="M -10 -28 L -8 -18" stroke={c.shirt} strokeWidth={4} strokeLinecap="round" />
            <path d="M 10 -28 L 8 -18" stroke={c.shirt} strokeWidth={4} strokeLinecap="round" />
          </>
        ) : (
          // 默认双臂下垂 + 走路时摆臂
          <>
            <g className="office-walk-arm-l">
              <rect x={-13} y={-30} width={4} height={15} fill={c.shirt} stroke={INK} strokeWidth={1} rx={1.5} />
              {view !== "back" && <circle cx={-11} cy={-14} r={1.6} fill={c.skin} stroke={INK} strokeWidth={0.5} />}
            </g>
            <g className="office-walk-arm-r">
              <rect x={9} y={-30} width={4} height={15} fill={c.shirt} stroke={INK} strokeWidth={1} rx={1.5} />
              {view !== "back" && <circle cx={11} cy={-14} r={1.6} fill={c.skin} stroke={INK} strokeWidth={0.5} />}
            </g>
          </>
        )}

        {/* 脖子 */}
        <rect x={-2.5} y={-34} width={5} height={4} fill={c.skin} stroke={INK} strokeWidth={0.8} />

        {/* === 头 / 头发 / 脸 —— 按视角 === */}
        {view === "front" && (
          <>
            <circle cx={0} cy={-41} r={11} fill={c.skin} stroke={INK} strokeWidth={1.2} />
            {/* 两侧小耳 */}
            <ellipse cx={-10.5} cy={-40} rx={1.4} ry={2} fill={c.skin} stroke={INK} strokeWidth={0.6} />
            <ellipse cx={10.5} cy={-40} rx={1.4} ry={2} fill={c.skin} stroke={INK} strokeWidth={0.6} />
            {/* 头发：顶 + 两侧鬓 */}
            <path
              d="M -11 -43 Q -11 -53 0 -53 Q 11 -53 11 -43 L 9 -38 Q 4 -42 0 -41 Q -4 -42 -9 -38 Z"
              fill={c.hair}
              stroke={INK}
              strokeWidth={0.8}
            />
            <path d="M -6 -50 Q -4 -52 -1 -51" stroke="#fff" strokeWidth={0.8} fill="none" opacity={0.25} />
            {/* 脸 */}
            {mood === "crying" ? (
              <>
                <path d="M -5 -42 L -3 -40 M -5 -40 L -3 -42" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
                <path d="M 3 -42 L 5 -40 M 3 -40 L 5 -42" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
                <path d="M -3 -35 Q 0 -37 3 -35" stroke={INK} strokeWidth={1.2} fill="none" />
                <ellipse cx={-4} cy={-36} rx={1.2} ry={2} fill="#7fc3df" />
                <ellipse cx={4} cy={-36} rx={1.2} ry={2} fill="#7fc3df" />
              </>
            ) : mood === "celebrating" ? (
              <>
                <path d="M -5 -42 Q -4 -44 -3 -42" stroke={INK} strokeWidth={1.4} fill="none" />
                <path d="M 3 -42 Q 4 -44 5 -42" stroke={INK} strokeWidth={1.4} fill="none" />
                <path d="M -4 -36 Q 0 -32 4 -36" stroke={INK} strokeWidth={1.4} fill="none" />
              </>
            ) : (
              <>
                <circle cx={-4} cy={-41} r={1.2} fill={INK} />
                <circle cx={4} cy={-41} r={1.2} fill={INK} />
                <circle cx={-3.6} cy={-41.4} r={0.4} fill="#fff" />
                <circle cx={4.4} cy={-41.4} r={0.4} fill="#fff" />
                <path
                  d={mood === "slacking" || mood === "idle" ? "M -3 -36 L 3 -36" : "M -3 -36 Q 0 -34 3 -36"}
                  stroke={INK}
                  strokeWidth={1.2}
                  fill="none"
                  strokeLinecap="round"
                />
              </>
            )}
          </>
        )}

        {view === "back" && (
          <>
            <circle cx={0} cy={-41} r={11} fill={c.skin} stroke={INK} strokeWidth={1.2} />
            {/* 头发覆盖头颅大部分 */}
            <path
              d="M -11 -47 Q -11 -53 0 -53 Q 11 -53 11 -47 L 11 -33 Q 6 -29 0 -29 Q -6 -29 -11 -33 Z"
              fill={c.hair}
              stroke={INK}
              strokeWidth={0.8}
            />
            {/* 后脑发流 */}
            <path d="M -4 -50 Q 0 -45 4 -50" stroke={INK} strokeWidth={0.6} fill="none" opacity={0.35} />
            <path d="M -5 -42 Q 0 -38 5 -42" stroke={INK} strokeWidth={0.5} fill="none" opacity={0.3} />
            {/* 两侧外露的小耳 */}
            <ellipse cx={-11} cy={-39} rx={1.1} ry={2.4} fill={c.skin} stroke={INK} strokeWidth={0.5} />
            <ellipse cx={11} cy={-39} rx={1.1} ry={2.4} fill={c.skin} stroke={INK} strokeWidth={0.5} />
            {/* 后颈阴影 */}
            <path d="M -4 -32 Q 0 -30 4 -32" stroke={INK} strokeWidth={0.5} fill="none" opacity={0.4} />
          </>
        )}

        {view === "side" && (
          <>
            {/* 头 */}
            <circle cx={1} cy={-41} r={11} fill={c.skin} stroke={INK} strokeWidth={1.2} />
            {/* 头发：覆盖后半 + 顶 */}
            <path
              d="M -10 -42 Q -10 -53 1 -53 Q 12 -53 12 -42 L 10 -37 L 0 -38 L -5 -36 L -10 -38 Z"
              fill={c.hair}
              stroke={INK}
              strokeWidth={0.8}
            />
            {/* 鬓角 */}
            <path d="M -8 -38 L -8 -33" stroke={c.hair} strokeWidth={1.6} strokeLinecap="round" />
            {/* 远端耳（朝后） */}
            <ellipse cx={-7} cy={-40} rx={1} ry={2.2} fill={c.skin} stroke={INK} strokeWidth={0.5} />
            {/* 鼻子（朝前突出） */}
            <path d="M 11 -41 L 13.5 -39.5 L 11 -38 Z" fill={c.skin} stroke={INK} strokeWidth={0.7} />
            {/* 一只眼（朝前那侧） */}
            <circle cx={5} cy={-41} r={1.1} fill={INK} />
            <circle cx={5.3} cy={-41.3} r={0.35} fill="#fff" />
            {/* 嘴角 */}
            {mood === "crying" ? (
              <path d="M 4 -35 Q 8 -33 11 -35" stroke={INK} strokeWidth={1.2} fill="none" />
            ) : mood === "celebrating" ? (
              <path d="M 4 -36 Q 7 -32 11 -36" stroke={INK} strokeWidth={1.4} fill="none" />
            ) : (
              <path d="M 5 -36 Q 8 -34 11 -36" stroke={INK} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            )}
            {/* 下巴弧线 */}
            <path d="M 9 -33 Q 6 -31 2 -32" stroke={INK} strokeWidth={0.5} fill="none" opacity={0.4} />
          </>
        )}

        {/* 汗滴（背面也能看到右肩） */}
        {(mood === "working" || mood === "compensating") && (
          <ellipse className="office-sweat-drop" cx={-14} cy={-44} rx={1.8} ry={3} fill="#7fc3df" />
        )}

        {/* 咖啡杯（cafe + slacking + front view） */}
        {mood === "slacking" && zone === "cafe" && (
          <g transform="translate(11, -22)">
            <rect x={0} y={0} width={7} height={8} fill={PAPER} stroke={INK} strokeWidth={0.8} rx={1} />
            <rect x={0} y={0} width={7} height={2} fill="#6b4423" />
            <path d="M 7 2 Q 11 2 11 5 Q 11 7 7 7" fill="none" stroke={INK} strokeWidth={0.8} />
            <path d="M 2 -2 Q 3 -4 2 -6" stroke="#a8a29e" strokeWidth={0.8} fill="none" />
            <path d="M 5 -2 Q 6 -4 5 -6" stroke="#a8a29e" strokeWidth={0.8} fill="none" />
          </g>
        )}

        {/* 跑步腿（治疗系：双腿小幅抖） */}
        {mood === "slacking" && zone === "treadmill" && (
          <g className="office-treadmill-running">
            <rect x={-7} y={-13} width={4} height={13} fill="#2a2620" rx={1} />
            <rect x={3} y={-12} width={4} height={11} fill="#2a2620" rx={1} />
          </g>
        )}

        {/* 扫帚 */}
        {mood === "compensating" && (
          <g transform="translate(13, -28) rotate(-20)">
            <rect x={0} y={0} width={2} height={20} fill="#92400e" stroke={INK} strokeWidth={0.4} />
            <path d="M -2 18 L 6 18 L 8 26 L -4 26 Z" fill="#f6c453" stroke={INK} strokeWidth={0.8} />
            <line x1={-2} y1={22} x2={8} y2={22} stroke={INK} strokeWidth={0.4} />
          </g>
        )}
      </g>
    </g>
  );
}
