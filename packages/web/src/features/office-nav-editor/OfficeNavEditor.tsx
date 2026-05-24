import { useEffect, useRef, useState } from "react";
import { OfficeFloor, OFFICE_VIEWBOX } from "../office-view/OfficeFloor";

interface Node {
  id: string;
  x: number;
  y: number;
}

type Edge = [string, string];

type Mode = "line" | "delete";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const SNAP_DIST = 18; // 鼠标落点距离已有节点 < 此值, 合并到该节点

function nextId(nodes: Node[]): string {
  let i = 0;
  const used = new Set(nodes.map((n) => n.id));
  while (used.has(`n${i}`)) i++;
  return `n${i}`;
}

function findNear(nodes: Node[], x: number, y: number): Node | null {
  let best: Node | null = null;
  let bestD = SNAP_DIST;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** 把 (toX,toY) 相对 (fromX,fromY) 强制为水平或垂直 (取较长一方向) */
function snapAxis(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: toX, y: fromY };
  }
  return { x: fromX, y: toY };
}

export default function OfficeNavEditor() {
  const [mode, setMode] = useState<Mode>("line");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [drag, setDrag] = useState<{
    startId: string;
    fromX: number;
    fromY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pushHistory = () => {
    setHistory((prev) => [...prev, { nodes, edges }].slice(-200));
  };

  const undo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      setNodes(last.nodes);
      setEdges(last.edges);
      setDrag(null);
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  /** 添加 (或复用) 一个节点, 返回 id 和最新 nodes 数组 */
  const ensureNode = (
    list: Node[],
    x: number,
    y: number,
  ): { id: string; nodes: Node[] } => {
    const near = findNear(list, x, y);
    if (near) return { id: near.id, nodes: list };
    const id = nextId(list);
    return { id, nodes: [...list, { id, x, y }] };
  };

  // === 线段绘制 (鼠标拖) ===
  const onMouseDown = (e: React.MouseEvent) => {
    if (mode !== "line") return;
    if (e.button !== 0) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    // 起点 snap 到已有节点
    const near = findNear(nodes, x, y);
    const sx = near ? near.x : x;
    const sy = near ? near.y : y;
    setDrag({
      startId: near?.id ?? "__pending__",
      fromX: sx,
      fromY: sy,
      curX: sx,
      curY: sy,
    });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    const snapped = snapAxis(drag.fromX, drag.fromY, x, y);
    setDrag({ ...drag, curX: snapped.x, curY: snapped.y });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!drag) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    const snapped = snapAxis(drag.fromX, drag.fromY, x, y);
    const tooShort =
      Math.hypot(snapped.x - drag.fromX, snapped.y - drag.fromY) < 8;
    if (tooShort) {
      // 只是单击 — 如果起点不在已有节点上, 加一个孤立节点
      if (drag.startId === "__pending__") {
        pushHistory();
        const id = nextId(nodes);
        setNodes((prev) => [...prev, { id, x: drag.fromX, y: drag.fromY }]);
      }
      setDrag(null);
      return;
    }
    pushHistory();
    let list = nodes;
    const a = ensureNode(list, drag.fromX, drag.fromY);
    list = a.nodes;
    const b = ensureNode(list, snapped.x, snapped.y);
    list = b.nodes;
    setNodes(list);
    if (a.id !== b.id) {
      const exists = edges.some(
        ([p, q]) =>
          (p === a.id && q === b.id) || (p === b.id && q === a.id),
      );
      if (!exists) setEdges((prev) => [...prev, [a.id, b.id]]);
    }
    setDrag(null);
  };

  // === 删除 ===
  const deleteNode = (id: string) => {
    pushHistory();
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter(([a, b]) => a !== id && b !== id));
  };

  const deleteEdge = (idx: number) => {
    pushHistory();
    setEdges((prev) => prev.filter((_, i) => i !== idx));
  };

  const onNodeMouseDown = (id: string, e: React.MouseEvent) => {
    if (mode === "delete") {
      e.stopPropagation();
      deleteNode(id);
      return;
    }
    if (mode === "line" && e.button === 0) {
      // 让节点本身作为拖拽起点
      e.stopPropagation();
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setDrag({
        startId: id,
        fromX: n.x,
        fromY: n.y,
        curX: n.x,
        curY: n.y,
      });
    }
  };

  const onEdgeClick = (idx: number, e: React.MouseEvent) => {
    if (mode !== "delete") return;
    e.stopPropagation();
    deleteEdge(idx);
  };

  const reset = () => {
    pushHistory();
    setNodes([]);
    setEdges([]);
    setDrag(null);
  };

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const exportJson = JSON.stringify({ nodes, edges }, null, 2);
  const copy = () => {
    void navigator.clipboard.writeText(exportJson);
  };

  return (
    <div className="flex h-full w-full">
      <div className="flex flex-1 flex-col items-center justify-center bg-neutral-100 p-4">
        <div className="mb-3 flex gap-2 text-sm">
          <button
            onClick={() => setMode("line")}
            className={`rounded border px-3 py-1 ${mode === "line" ? "bg-blue-600 text-white" : "bg-white"}`}
          >
            画线 (拖拽)
          </button>
          <button
            onClick={() => setMode("delete")}
            className={`rounded border px-3 py-1 ${mode === "delete" ? "bg-red-600 text-white" : "bg-white"}`}
          >
            删除 (点击)
          </button>
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="rounded border bg-white px-3 py-1 disabled:opacity-40"
          >
            撤销 ({history.length})
          </button>
          <button onClick={reset} className="rounded border bg-white px-3 py-1">
            清空
          </button>
          <span className="ml-3 self-center text-xs text-neutral-500">
            节点 {nodes.length} · 边 {edges.length} · 线自动正交, snap{" "}
            {SNAP_DIST}px
          </span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${OFFICE_VIEWBOX.w} ${OFFICE_VIEWBOX.h}`}
          className="max-h-[85vh] w-full max-w-[1240px] border border-neutral-300 bg-white"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => setDrag(null)}
          style={{
            cursor:
              mode === "delete" ? "not-allowed" : drag ? "crosshair" : "crosshair",
          }}
        >
          <OfficeFloor />
          {/* 半透明遮罩, 让 nav 元素更显眼 */}
          <rect
            x={0}
            y={0}
            width={OFFICE_VIEWBOX.w}
            height={OFFICE_VIEWBOX.h}
            fill="white"
            opacity={0.35}
            pointerEvents="none"
          />
          {/* 已确认的边 */}
          {edges.map(([a, b], i) => {
            const na = nodeById.get(a);
            const nb = nodeById.get(b);
            if (!na || !nb) return null;
            return (
              <line
                key={i}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke={mode === "delete" ? "#dc2626" : "#1e40af"}
                strokeWidth={mode === "delete" ? 6 : 4}
                strokeLinecap="round"
                opacity={0.75}
                onClick={(e) => onEdgeClick(i, e)}
                style={{
                  cursor: mode === "delete" ? "pointer" : "default",
                  pointerEvents: "stroke",
                }}
              />
            );
          })}
          {/* 拖拽预览 */}
          {drag && (
            <line
              x1={drag.fromX}
              y1={drag.fromY}
              x2={drag.curX}
              y2={drag.curY}
              stroke="#f59e0b"
              strokeWidth={4}
              strokeDasharray="6 4"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}
          {/* 节点 */}
          {nodes.map((n) => (
            <g
              key={n.id}
              onMouseDown={(e) => onNodeMouseDown(n.id, e)}
              style={{ cursor: mode === "delete" ? "pointer" : "crosshair" }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={8}
                fill={mode === "delete" ? "#dc2626" : "#15803d"}
                stroke="white"
                strokeWidth={2}
              />
              <text
                x={n.x + 11}
                y={n.y - 10}
                fontSize={11}
                fontFamily="monospace"
                fill="#111"
                stroke="white"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {n.id} ({n.x},{n.y})
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex w-[360px] flex-col border-l border-neutral-300 bg-neutral-50">
        <div className="flex items-center justify-between border-b border-neutral-300 p-3">
          <span className="text-sm font-semibold">导出</span>
          <button
            onClick={copy}
            className="rounded border bg-white px-3 py-1 text-xs hover:bg-neutral-100"
          >
            复制
          </button>
        </div>
        <div className="border-b border-neutral-200 p-3 text-xs leading-relaxed text-neutral-600">
          <div>• 画线: 在空白处按下并拖, 松开成线 (自动正交)</div>
          <div>• 从节点起拖: 续连</div>
          <div>• 终点靠近已有节点 ({SNAP_DIST}px 内) 自动合并</div>
          <div>• 删除模式: 点节点删节点, 点线删线</div>
          <div>• Ctrl/Cmd+Z 撤销</div>
        </div>
        <pre className="flex-1 overflow-auto p-3 text-[11px] leading-snug">
          {exportJson}
        </pre>
      </div>
    </div>
  );
}
