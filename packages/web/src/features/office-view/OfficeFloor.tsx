import { useTranslation } from "react-i18next";
import type { WorkflowNode } from "@petrify/shared";
import { DESK_Y, VIEWBOX } from "./placement";

interface OfficeFloorProps {
  nodes: WorkflowNode[];
}

// 房间背景：地板、墙、工位（按 node 数量动态）、咖啡角、跑步机、厕所门、饮水机、出口
export function OfficeFloor({ nodes }: OfficeFloorProps) {
  const { t } = useTranslation("workflow");
  const n = nodes.length;
  const DESK_LEFT_PAD = 90;
  const usable = VIEWBOX.w - DESK_LEFT_PAD * 2;
  const spacing = n <= 1 ? 0 : Math.max(110, Math.min(160, usable / (n - 1)));
  const totalWidth = spacing * Math.max(0, n - 1);
  const startX = VIEWBOX.w / 2 - totalWidth / 2;

  return (
    <g>
      {/* 墙 */}
      <rect
        className="office-room-wall"
        x={0}
        y={0}
        width={VIEWBOX.w}
        height={VIEWBOX.h}
        fill="#f3e9d8"
      />
      {/* 地板 */}
      <rect
        className="office-room-floor"
        x={0}
        y={290}
        width={VIEWBOX.w}
        height={VIEWBOX.h - 290}
        fill="#d9c9a8"
      />
      {/* 地板格子 */}
      {Array.from({ length: 16 }).map((_, i) => (
        <line
          key={`gx${i}`}
          x1={i * 60}
          y1={290}
          x2={i * 60}
          y2={VIEWBOX.h}
          stroke="#c4b48a"
          strokeWidth={0.6}
        />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={`gy${i}`}
          x1={0}
          y1={290 + i * 60}
          x2={VIEWBOX.w}
          y2={290 + i * 60}
          stroke="#c4b48a"
          strokeWidth={0.6}
        />
      ))}

      {/* 工位（每个 node 一张桌子） */}
      {nodes.map((node, i) => {
        const cx = startX + i * spacing;
        return (
          <g key={node.id} transform={`translate(${cx}, ${DESK_Y})`}>
            {/* 桌子 */}
            <rect
              className="office-room-desk"
              x={-44}
              y={-2}
              width={88}
              height={30}
              rx={3}
              fill="#a08560"
              stroke="#3b3a36"
              strokeWidth={1.2}
            />
            {/* 桌腿 */}
            <rect x={-40} y={28} width={4} height={20} fill="#7a6242" />
            <rect x={36} y={28} width={4} height={20} fill="#7a6242" />
            {/* 显示器 */}
            <rect
              className="office-room-monitor"
              x={-26}
              y={-36}
              width={52}
              height={34}
              rx={3}
              fill="#1a1d24"
              stroke="#3b3a36"
              strokeWidth={1.2}
            />
            <rect x={-4} y={-4} width={8} height={4} fill="#3b3a36" />
            <rect x={-12} y={0} width={24} height={2.5} fill="#3b3a36" />
            {/* 屏幕内容（随机三行） */}
            <line x1={-22} y1={-30} x2={-2} y2={-30} stroke="#10b981" strokeWidth={1} />
            <line x1={-22} y1={-25} x2={14} y2={-25} stroke="#10b981" strokeWidth={1} />
            <line x1={-22} y1={-20} x2={8} y2={-20} stroke="#10b981" strokeWidth={1} />
            {/* 工位名 */}
            <text
              x={0}
              y={45}
              textAnchor="middle"
              fontSize="9"
              fill="#5c4a2a"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              opacity={0.7}
            >
              {t("office.desk_label", { n: i + 1 })}
            </text>
          </g>
        );
      })}

      {/* 咖啡角 (左下) */}
      <g transform="translate(80, 380)">
        <rect x={0} y={0} width={120} height={40} rx={4} fill="#6b4423" stroke="#3b3a36" strokeWidth={1.2} />
        <rect x={10} y={-22} width={18} height={22} fill="#374151" stroke="#3b3a36" strokeWidth={1} rx={2} />
        <circle cx={19} cy={-11} r={4} fill="#a16207" />
        <rect x={40} y={-15} width={10} height={15} fill="#9ca3af" stroke="#3b3a36" strokeWidth={1} rx={1} />
        <rect x={60} y={-18} width={14} height={18} fill="#dc2626" stroke="#3b3a36" strokeWidth={1} rx={2} />
        <text x={60} y={56} textAnchor="middle" fontSize="11" fill="#5c4a2a" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {t("office.cafe_label")}
        </text>
      </g>

      {/* 饮水机 + 闲聊区 */}
      <g transform="translate(330, 380)">
        <rect x={-10} y={-30} width={20} height={50} rx={3} fill="#60a5fa" stroke="#3b3a36" strokeWidth={1.2} />
        <rect x={-14} y={-32} width={28} height={6} fill="#3b82f6" stroke="#3b3a36" strokeWidth={1} />
        <circle cx={0} cy={-10} r={4} fill="#e0f2fe" stroke="#3b3a36" strokeWidth={1} />
        <text x={0} y={56} textAnchor="middle" fontSize="11" fill="#5c4a2a" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {t("office.watercooler_label")}
        </text>
      </g>

      {/* 跑步机 */}
      <g transform="translate(500, 380)">
        <rect x={0} y={0} width={80} height={20} rx={2} fill="#1f2937" stroke="#3b3a36" strokeWidth={1.2} />
        <rect x={0} y={-30} width={4} height={30} fill="#4b5563" stroke="#3b3a36" strokeWidth={1} />
        <rect x={0} y={-32} width={80} height={5} fill="#374151" stroke="#3b3a36" strokeWidth={1} rx={1} />
        <text x={3} y={-22} fontSize="6" fill="#10b981" fontFamily="ui-monospace, monospace">
          5.5 km/h
        </text>
        <text x={40} y={56} textAnchor="middle" fontSize="11" fill="#5c4a2a" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {t("office.treadmill_label")}
        </text>
      </g>

      {/* 厕所门 */}
      <g transform="translate(700, 350)">
        <rect x={0} y={0} width={50} height={80} rx={3} fill="#7c5e3a" stroke="#3b3a36" strokeWidth={1.5} />
        <rect x={4} y={4} width={42} height={50} fill="#5a4326" stroke="#3b3a36" strokeWidth={1} />
        <circle cx={40} cy={35} r={2} fill="#fbbf24" />
        <text x={25} y={42} textAnchor="middle" fontSize="14" fill="#fff" fontFamily="ui-sans-serif, system-ui, sans-serif">
          WC
        </text>
        <text x={25} y={100} textAnchor="middle" fontSize="11" fill="#5c4a2a" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {t("office.toilet_label")}
        </text>
      </g>

      {/* 出口门 */}
      <g transform="translate(870, 350)">
        <rect x={0} y={0} width={40} height={80} rx={2} fill="#15803d" stroke="#3b3a36" strokeWidth={1.5} />
        <rect x={4} y={4} width={32} height={50} fill="#166534" stroke="#3b3a36" strokeWidth={1} />
        <text x={20} y={36} textAnchor="middle" fontSize="9" fill="#fff" fontFamily="ui-sans-serif, system-ui, sans-serif">
          EXIT
        </text>
        <circle cx={30} cy={42} r={1.5} fill="#fbbf24" />
        <text x={20} y={100} textAnchor="middle" fontSize="11" fill="#5c4a2a" fontFamily="ui-sans-serif, system-ui, sans-serif">
          {t("office.exit_label")}
        </text>
      </g>

      {/* 装饰：墙上的钟 */}
      <g transform="translate(480, 50)">
        <circle cx={0} cy={0} r={20} fill="#fff" stroke="#3b3a36" strokeWidth={2} />
        <circle cx={0} cy={0} r={1.5} fill="#3b3a36" />
        <line x1={0} y1={0} x2={0} y2={-12} stroke="#3b3a36" strokeWidth={1.5} strokeLinecap="round" />
        <line x1={0} y1={0} x2={8} y2={2} stroke="#3b3a36" strokeWidth={1.5} strokeLinecap="round" />
      </g>

      {/* 装饰：盆栽 */}
      <g transform="translate(40, 260)">
        <rect x={-8} y={20} width={16} height={14} fill="#92400e" stroke="#3b3a36" strokeWidth={1} />
        <ellipse cx={0} cy={10} rx={14} ry={18} fill="#16a34a" stroke="#3b3a36" strokeWidth={1} />
        <ellipse cx={-6} cy={2} rx={8} ry={10} fill="#22c55e" />
        <ellipse cx={7} cy={5} rx={7} ry={9} fill="#22c55e" />
      </g>
    </g>
  );
}
