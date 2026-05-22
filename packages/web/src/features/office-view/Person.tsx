import type { Mood, Placement } from "./placement";

// 8 套配色：[shirt, hair, skin]
const PALETTE: Array<{ shirt: string; hair: string; skin: string }> = [
  { shirt: "#ef4444", hair: "#2c1810", skin: "#fcd9b6" },
  { shirt: "#3b82f6", hair: "#3a2410", skin: "#f5cfa1" },
  { shirt: "#10b981", hair: "#1a0d05", skin: "#f7d6b8" },
  { shirt: "#f59e0b", hair: "#7a4a1a", skin: "#fbe0c4" },
  { shirt: "#a855f7", hair: "#000000", skin: "#ecc7a2" },
  { shirt: "#ec4899", hair: "#a8581a", skin: "#fdd9b5" },
  { shirt: "#14b8a6", hair: "#2c1810", skin: "#e5b88f" },
  { shirt: "#f97316", hair: "#3a2410", skin: "#fbd2a8" },
];

interface PersonProps {
  placement: Placement;
}

// 一个 ~44x60 的卡通小人，原点在脚底中心
export function Person({ placement }: PersonProps) {
  const { x, y, facing, mood, paletteIdx, title, status } = placement;
  const c = PALETTE[paletteIdx]!;
  const flip = facing === "left" ? -1 : 1;

  // 状态环（呼应 DAG 颜色）
  const ringColor =
    status === "running"
      ? "#10b981"
      : status === "failed"
        ? "#ef4444"
        : status === "completed"
          ? "#6366f1"
          : status === "blocked"
            ? "#f59e0b"
            : "transparent";

  return (
    <g
      className="office-person"
      transform={`translate(${x}, ${y})`}
      style={{ transitionProperty: "transform" }}
    >
      {/* label 名牌 */}
      <g transform="translate(0, -68)">
        <rect
          x={-26}
          y={-9}
          width={52}
          height={14}
          rx={3}
          fill="#fff"
          stroke="#3b3a36"
          strokeWidth={1}
          opacity={0.92}
        />
        <text
          x={0}
          y={1}
          textAnchor="middle"
          fontSize="9"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="#3b3a36"
        >
          {title.length > 7 ? title.slice(0, 6) + "…" : title}
        </text>
      </g>

      {/* mood 动画的子组（脚不动，身体动） */}
      <g className={`office-mood-${mood}`} transform={`scale(${flip}, 1)`}>
        {/* 状态光环 */}
        {ringColor !== "transparent" && (
          <circle cx={0} cy={-32} r={20} fill={ringColor} opacity={0.18} />
        )}

        {/* 腿 */}
        <rect x={-6} y={-12} width={4} height={12} fill="#2c3e50" rx={1} />
        <rect x={2} y={-12} width={4} height={12} fill="#2c3e50" rx={1} />

        {/* 身体（衬衫） */}
        <path
          d="M -10 -32 L -10 -14 Q -10 -10 -6 -10 L 6 -10 Q 10 -10 10 -14 L 10 -32 Z"
          fill={c.shirt}
          stroke="#3b3a36"
          strokeWidth={1.2}
        />

        {/* 手臂 */}
        {mood === "working" || mood === "compensating" ? (
          <>
            <rect x={-13} y={-30} width={5} height={10} fill={c.shirt} stroke="#3b3a36" strokeWidth={1} rx={1.5} />
            <rect x={8} y={-30} width={5} height={10} fill={c.shirt} stroke="#3b3a36" strokeWidth={1} rx={1.5} />
          </>
        ) : mood === "celebrating" ? (
          <>
            <path d="M -10 -30 L -16 -42" stroke={c.shirt} strokeWidth={5} strokeLinecap="round" />
            <path d="M 10 -30 L 16 -42" stroke={c.shirt} strokeWidth={5} strokeLinecap="round" />
            <circle cx={-16} cy={-44} r={3} fill="#ffd700" stroke="#3b3a36" strokeWidth={1} />
            <circle cx={16} cy={-44} r={3} fill="#ffd700" stroke="#3b3a36" strokeWidth={1} />
          </>
        ) : mood === "crying" ? (
          <>
            <path d="M -10 -28 L -8 -18" stroke={c.shirt} strokeWidth={4} strokeLinecap="round" />
            <path d="M 10 -28 L 8 -18" stroke={c.shirt} strokeWidth={4} strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x={-13} y={-30} width={4} height={14} fill={c.shirt} stroke="#3b3a36" strokeWidth={1} rx={1.5} />
            <rect x={9} y={-30} width={4} height={14} fill={c.shirt} stroke="#3b3a36" strokeWidth={1} rx={1.5} />
          </>
        )}

        {/* 头 */}
        <circle cx={0} cy={-40} r={11} fill={c.skin} stroke="#3b3a36" strokeWidth={1.2} />
        {/* 头发 */}
        <path
          d="M -11 -42 Q -11 -52 0 -52 Q 11 -52 11 -42 L 9 -38 Q 0 -42 -9 -38 Z"
          fill={c.hair}
        />

        {/* 表情 */}
        {mood === "crying" ? (
          <>
            <path d="M -5 -41 L -3 -39 M -5 -39 L -3 -41" stroke="#3b3a36" strokeWidth={1.2} strokeLinecap="round" />
            <path d="M 3 -41 L 5 -39 M 3 -39 L 5 -41" stroke="#3b3a36" strokeWidth={1.2} strokeLinecap="round" />
            <path d="M -3 -34 Q 0 -36 3 -34" stroke="#3b3a36" strokeWidth={1.2} fill="none" />
            {/* 眼泪 */}
            <ellipse cx={-4} cy={-35} rx={1.2} ry={2} fill="#67e8f9" />
            <ellipse cx={4} cy={-35} rx={1.2} ry={2} fill="#67e8f9" />
          </>
        ) : mood === "celebrating" ? (
          <>
            <path d="M -5 -41 Q -4 -43 -3 -41" stroke="#3b3a36" strokeWidth={1.4} fill="none" />
            <path d="M 3 -41 Q 4 -43 5 -41" stroke="#3b3a36" strokeWidth={1.4} fill="none" />
            <path d="M -4 -35 Q 0 -31 4 -35" stroke="#3b3a36" strokeWidth={1.4} fill="none" />
          </>
        ) : (
          <>
            <circle cx={-4} cy={-40} r={1.2} fill="#3b3a36" />
            <circle cx={4} cy={-40} r={1.2} fill="#3b3a36" />
            <path
              d={mood === "slacking" || mood === "idle" ? "M -3 -35 L 3 -35" : "M -3 -35 Q 0 -33 3 -35"}
              stroke="#3b3a36"
              strokeWidth={1.2}
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}

        {/* 汗滴 — running */}
        {(mood === "working" || mood === "compensating") && (
          <ellipse
            className="office-sweat-drop"
            cx={-14}
            cy={-44}
            rx={1.8}
            ry={3}
            fill="#67e8f9"
          />
        )}

        {/* 咖啡杯 — slacking 在咖啡区 */}
        {mood === "slacking" && placement.zone === "cafe" && (
          <g transform="translate(11, -22)">
            <rect x={0} y={0} width={7} height={8} fill="#8b4513" stroke="#3b3a36" strokeWidth={1} rx={1} />
            <path d="M 7 2 Q 11 2 11 5 Q 11 7 7 7" fill="none" stroke="#3b3a36" strokeWidth={1} />
            <path d="M 2 -2 Q 3 -4 2 -6" stroke="#a8a29e" strokeWidth={1} fill="none" />
            <path d="M 5 -2 Q 6 -4 5 -6" stroke="#a8a29e" strokeWidth={1} fill="none" />
          </g>
        )}

        {/* ZZZ — 厕所摸鱼 */}
        {mood === "slacking" && placement.zone === "toilet" && (
          <text
            className="office-zzz"
            x={12}
            y={-50}
            fontSize="11"
            fill="#3b3a36"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            z
          </text>
        )}

        {/* 跑步腿动画 */}
        {mood === "slacking" && placement.zone === "treadmill" && (
          <g className="office-treadmill-running">
            <rect x={-7} y={-13} width={4} height={13} fill="#1f2937" rx={1} />
            <rect x={3} y={-12} width={4} height={11} fill="#1f2937" rx={1} />
          </g>
        )}

        {/* 扫帚 — compensating */}
        {mood === "compensating" && (
          <g transform="translate(13, -28) rotate(-20)">
            <rect x={0} y={0} width={2} height={20} fill="#92400e" />
            <path d="M -2 18 L 6 18 L 8 26 L -4 26 Z" fill="#fbbf24" stroke="#3b3a36" strokeWidth={0.8} />
          </g>
        )}
      </g>
    </g>
  );
}
