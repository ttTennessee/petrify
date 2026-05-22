interface SpeechBubbleProps {
  text: string;
  x: number;
  y: number;
}

// 简单的卡通对话框：圆角矩形 + 小尾巴
export function SpeechBubble({ text, x, y }: SpeechBubbleProps) {
  const padX = 8;
  const padY = 5;
  // 估算宽度：中文字符 ~ 11px，英文 ~ 7px。粗略平均 10px。
  const w = Math.min(160, Math.max(40, text.length * 11 + padX * 2));
  const h = 24;
  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h - 10})`}
      className="office-bubble"
      style={{ pointerEvents: "none" }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill="#fffdf5"
        stroke="#3b3a36"
        strokeWidth={1.5}
      />
      <polygon
        points={`${w / 2 - 5},${h} ${w / 2 + 5},${h} ${w / 2 + 1},${h + 6}`}
        fill="#fffdf5"
        stroke="#3b3a36"
        strokeWidth={1.5}
      />
      <text
        x={w / 2}
        y={h / 2 + 4}
        textAnchor="middle"
        fontSize="11"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="#3b3a36"
      >
        {text}
      </text>
    </g>
  );
}
