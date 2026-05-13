import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeStatus, WorkflowNode } from "@petrify/shared";

const STATUS_STYLES: Record<NodeStatus, string> = {
  idle: "border-slate-300 bg-white",
  pending: "border-amber-400 bg-amber-50",
  running: "border-sky-500 bg-sky-50 animate-pulse",
  completed: "border-emerald-500 bg-emerald-50",
  failed: "border-rose-500 bg-rose-50",
  blocked: "border-slate-500 bg-slate-100",
  skipped: "border-slate-400 bg-slate-50 opacity-60",
  compensating: "border-violet-500 bg-violet-50",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: "·",
  pending: "等待",
  running: "运行中",
  completed: "完成",
  failed: "失败",
  blocked: "阻塞",
  skipped: "跳过",
  compensating: "补偿",
};

export interface NodeCardData extends Record<string, unknown> {
  node: WorkflowNode;
  status: NodeStatus;
  selected?: boolean;
  issue?: "warning" | "error";
}

export function NodeCard({ data }: NodeProps) {
  const { node, status, selected, issue } = data as NodeCardData;
  const hasResources = node.resources && node.resources.length > 0;
  const depCount = (node.dependencies ?? []).length;
  const issueRing =
    issue === "error"
      ? "ring-2 ring-rose-500"
      : issue === "warning"
        ? "ring-2 ring-amber-500"
        : "";
  return (
    <div
      className={`min-w-[200px] max-w-[220px] rounded-md border-2 px-3 py-2 text-sm shadow-sm transition ${STATUS_STYLES[status]} ${selected ? "ring-2 ring-sky-400 ring-offset-1" : ""} ${issueRing}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-medium leading-tight">{node.title}</div>
      <div className="mt-0.5 text-[10px] text-slate-400">{node.ref}</div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>{node.adapter.name}</span>
        <span>{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
        <span title="control prerequisites">⇡ {depCount}</span>
        {hasResources && (
          <span className="flex flex-wrap gap-1">
            {node.resources.map((r) => (
              <span
                key={r.name}
                className="rounded bg-slate-200 px-1 text-[10px] text-slate-700"
                title="resource claim (M1: declared, not enforced)"
              >
                {r.name}:{r.amount}
              </span>
            ))}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
