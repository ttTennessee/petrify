import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeStatus, WorkflowGraph } from "@petrify/shared";
import { OfficeFloor } from "./OfficeFloor";
import { Person } from "./Person";
import { SpeechBubble } from "./SpeechBubble";
import { computePlacements, VIEWBOX } from "./placement";

// 状态变更的延迟缓冲：非 running 的过渡都拖 0-3s 才生效
interface DelaySchedule {
  target: NodeStatus;
  scheduledAt: number;
  delay: number;
}
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
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  return (
    <div className="absolute right-4 top-4 min-w-[160px] rounded-sm border border-border bg-card/85 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-baseline justify-between border-b border-border/60 pb-1.5">
        <span className="font-display text-[11px] italic tracking-wide text-muted-foreground">
          {t("office.title", { defaultValue: "Studio" })}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/80">
          {total} ppl
        </span>
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-[10px]">
        {items.map(([k, label, color]) =>
          counts[k] ? (
            <div key={k} className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${color} shadow-[0_0_0_2px_hsl(var(--card))]`} />
              <span className="text-muted-foreground">{label}</span>
              <span className="ml-auto tabular-nums text-foreground">{counts[k]}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function OfficeCanvas({ graph, nodeStatus }: OfficeCanvasProps) {
  const { t } = useTranslation("workflow");
  // 250ms tick：让 0-3s 随机延时的过渡更顺滑
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // 状态延时缓冲层：real → effective（running 立即；其他 0-3s 随机延时）
  const effectiveStatusRef = useRef<Record<string, NodeStatus>>({});
  const scheduledRef = useRef<Record<string, DelaySchedule>>({});

  const effectiveStatus = useMemo(() => {
    const eff = { ...effectiveStatusRef.current };
    const sched = scheduledRef.current;
    for (const node of graph.nodes) {
      const real = nodeStatus[node.id] ?? "idle";
      if (!(node.id in eff)) {
        // 首次见到节点：直接对齐（保证 unmount/remount 不会卡）
        eff[node.id] = real;
        continue;
      }
      if (eff[node.id] === real) {
        if (sched[node.id]) delete sched[node.id];
        continue;
      }
      if (real === "running") {
        // 干活的人没空延时
        eff[node.id] = real;
        delete sched[node.id];
        continue;
      }
      const cur = sched[node.id];
      if (!cur || cur.target !== real) {
        sched[node.id] = {
          target: real,
          scheduledAt: now,
          delay: Math.floor(Math.random() * 3000),
        };
      } else if (now - cur.scheduledAt >= cur.delay) {
        eff[node.id] = real;
        delete sched[node.id];
      }
    }
    effectiveStatusRef.current = eff;
    return eff;
  }, [graph.nodes, nodeStatus, now]);

  // 记录每个 node 进入某状态的起始时间（用 effectiveStatus）
  const watchingSinceRef = useRef<Record<string, number>>({});
  const prevStatusRef = useRef<Record<string, NodeStatus>>({});

  // 在 placement 计算前先更新计时表
  const watchingSince = useMemo(() => {
    const map = { ...watchingSinceRef.current };
    const prev = prevStatusRef.current;
    for (const node of graph.nodes) {
      const status = effectiveStatus[node.id] ?? "idle";

      // pending → 围观计时（key = watch:{node}:{runningDep}）
      if (status === "pending" || status === "idle") {
        const runningDep = node.dependencies.find((d) => effectiveStatus[d] === "running");
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
  }, [graph.nodes, effectiveStatus, now]);

  const placements = useMemo(
    () => computePlacements({ graph, nodeStatus: effectiveStatus, watchingSince, now }),
    [graph, effectiveStatus, watchingSince, now],
  );

  // z-order：屏幕 y 越大（越靠前）越后画 —— 让前景人物压住背景人物
  const sortedPlacements = useMemo(
    () => [...placements].sort((a, b) => a.y - b.y),
    [placements],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f5ead2]">
      <svg
        viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        <OfficeFloor nodes={graph.nodes} />
        {sortedPlacements.map((p) => (
          <Person key={p.nodeId} placement={p} />
        ))}
        {sortedPlacements.map((p) => {
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
      <div className="absolute bottom-3 left-4 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span className="inline-block h-px w-6 bg-muted-foreground/40" />
        <span className="tracking-wider uppercase">{t("office.footer", { count: graph.nodes.length })}</span>
      </div>
    </div>
  );
}
