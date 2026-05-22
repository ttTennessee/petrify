import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeStatus, WorkflowGraph } from "@petrify/shared";
import { OfficeFloor } from "./OfficeFloor";
import { Person } from "./Person";
import { SpeechBubble } from "./SpeechBubble";
import { computePlacements, VIEWBOX } from "./placement";
import "./style.css";

interface OfficeCanvasProps {
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
}

// 状态摘要：右上角小信息条
function StatusSummary({ nodeStatus }: { nodeStatus: Record<string, NodeStatus> }) {
  const { t } = useTranslation("workflow");
  const counts: Partial<Record<NodeStatus, number>> = {};
  for (const s of Object.values(nodeStatus)) counts[s] = (counts[s] ?? 0) + 1;
  const items: Array<[NodeStatus, string, string]> = [
    ["running", t("office.status_running"), "bg-emerald-500"],
    ["pending", t("office.status_pending"), "bg-amber-400"],
    ["blocked", t("office.status_blocked"), "bg-orange-500"],
    ["completed", t("office.status_completed"), "bg-indigo-500"],
    ["failed", t("office.status_failed"), "bg-red-500"],
  ];
  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-md border border-border bg-card/80 px-2 py-1.5 font-mono text-[10px] backdrop-blur">
      {items.map(([k, label, color]) =>
        counts[k] ? (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
            <span className="text-muted-foreground">{label}</span>
            <span className="ml-auto text-foreground">{counts[k]}</span>
          </div>
        ) : null,
      )}
    </div>
  );
}

export function OfficeCanvas({ graph, nodeStatus }: OfficeCanvasProps) {
  const { t } = useTranslation("workflow");
  // 用 tick 强制每秒 re-compute placement（催促/暂离/庆祝有时序）
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // 记录每个 node 进入某状态的起始时间
  const watchingSinceRef = useRef<Record<string, number>>({});
  const prevStatusRef = useRef<Record<string, NodeStatus>>({});

  // 在 placement 计算前先更新计时表
  const watchingSince = useMemo(() => {
    const map = { ...watchingSinceRef.current };
    const prev = prevStatusRef.current;
    for (const node of graph.nodes) {
      const status = nodeStatus[node.id] ?? "idle";
      const wasStatus = prev[node.id];

      // pending → 围观计时（key = watch:{node}:{runningDep}）
      if (status === "pending" || status === "idle") {
        const runningDep = node.dependencies.find((d) => nodeStatus[d] === "running");
        if (runningDep) {
          const key = `watch:${node.id}:${runningDep}`;
          if (!(key in map)) map[key] = now;
          // 清掉这个 node 的其他 watch key
          for (const k of Object.keys(map)) {
            if (k.startsWith(`watch:${node.id}:`) && k !== key) delete map[k];
          }
        } else {
          for (const k of Object.keys(map)) {
            if (k.startsWith(`watch:${node.id}:`)) delete map[k];
          }
        }
      } else {
        for (const k of Object.keys(map)) {
          if (k.startsWith(`watch:${node.id}:`)) delete map[k];
        }
      }

      // completed → 庆祝计时
      if (status === "completed") {
        const key = `done:${node.id}`;
        if (!(key in map)) map[key] = now;
      } else {
        delete map[`done:${node.id}`];
      }

      prev[node.id] = status;
    }
    prevStatusRef.current = prev;
    watchingSinceRef.current = map;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, nodeStatus, now]);

  const placements = useMemo(
    () => computePlacements({ graph, nodeStatus, watchingSince, now }),
    [graph, nodeStatus, watchingSince, now],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/30">
      <svg
        viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <OfficeFloor nodes={graph.nodes} />
        {placements.map((p) => (
          <Person key={p.nodeId} placement={p} />
        ))}
        {placements.map((p) => {
          if (!p.speech) return null;
          const arrKey =
            p.speech.kind === "nag"
              ? "office.nag_lines"
              : p.speech.kind === "blocked"
                ? "office.blocked_lines"
                : "office.cry_lines";
          const lines = t(arrKey, { returnObjects: true }) as string[];
          const text = lines[p.speech.idx % lines.length] ?? "";
          return (
            <SpeechBubble key={`sp-${p.nodeId}`} text={text} x={p.x} y={p.y - 70} />
          );
        })}
      </svg>
      <StatusSummary nodeStatus={nodeStatus} />
      <div className="absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground">
        {t("office.footer", { count: graph.nodes.length })}
      </div>
    </div>
  );
}
