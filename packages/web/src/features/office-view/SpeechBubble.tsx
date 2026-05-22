interface SpeechBubbleProps {
  text: string;
  x: number;
  y: number;
}

// 报纸风格便签气泡
export function SpeechBubble({ text, x, y }: SpeechBubbleProps) {
  const padX = 10;
  const padY = 6;
  const charW = /[一-鿿]/.test(text) ? 11 : 6.5;
  const w = Math.min(180, Math.max(48, text.length * charW + padX * 2));
  const h = 26;
  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h - 12})`}
      className="office-bubble"
      style={{ pointerEvents: "none" }}
    >
      {/* 投影 */}
      <rect x={1.5} y={2} width={w} height={h} rx={4} fill="#241c14" opacity={0.18} />
      {/* 主体 */}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={4}
        fill="#fbf5e4"
        stroke="#241c14"
        strokeWidth={1.4}
      />
      {/* 顶部装饰条 */}
      <rect x={0} y={0} width={w} height={3} rx={4} fill="#c97a5b" opacity={0.85} />
      {/* 尾巴 */}
      <polygon
        points={`${w / 2 - 5},${h - 0.5} ${w / 2 + 5},${h - 0.5} ${w / 2 + 1},${h + 7}`}
        fill="#fbf5e4"
        stroke="#241c14"
        strokeWidth={1.4}
      />
      <line
        x1={w / 2 - 4}
        y1={h - 0.5}
        x2={w / 2 + 4}
        y2={h - 0.5}
        stroke="#fbf5e4"
        strokeWidth={2}
      />
      <text
        x={w / 2}
        y={h / 2 + 5}
        textAnchor="middle"
        fontSize="11"
        fontFamily='"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif'
        fontWeight="500"
        fill="#241c14"
        letterSpacing="0.01em"
      >
        {text}
      </text>
    </g>
  );
}
