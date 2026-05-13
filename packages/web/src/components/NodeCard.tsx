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

export interface NodeCardData extends Record<string, unknown> {
  node: WorkflowNode;
  status: NodeStatus;
}

export function NodeCard({ data }: NodeProps) {
  const { node, status } = data as NodeCardData;
  const hasResources = node.resources && node.resources.length > 0;
  return (
    <div
      className={`min-w-[180px] rounded-md border-2 px-3 py-2 text-sm shadow-sm ${STATUS_STYLES[status]}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-medium leading-tight">{node.title}</div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>{node.adapter.name}</span>
        <span>{status}</span>
      </div>
      {hasResources && (
        <div className="mt-1 flex flex-wrap gap-1">
          {node.resources.map((r) => (
            <span
              key={r.name}
              className="rounded bg-slate-200 px-1 text-[10px] text-slate-700"
              title="resource claim (declared, not enforced in M1)"
            >
              {r.name}:{r.amount}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
