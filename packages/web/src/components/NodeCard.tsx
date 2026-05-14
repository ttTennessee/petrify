import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useTranslation } from "react-i18next";
import type { NodeStatus, WorkflowNode } from "@petrify/shared";

const STATUS_STYLES: Record<NodeStatus, string> = {
  idle: "border-border bg-card",
  pending: "border-warning/60 bg-warning/10 animate-pulse",
  running: "border-accent/70 bg-accent/10 animate-pulse",
  completed: "border-success/60 bg-success/10",
  failed: "border-destructive/60 bg-destructive/10",
  blocked: "border-muted-foreground/40 bg-muted",
  skipped: "border-border bg-muted opacity-60",
  compensating: "border-warning bg-warning/10",
};

export interface NodeCardData extends Record<string, unknown> {
  node: WorkflowNode;
  status: NodeStatus;
  selected?: boolean;
  issue?: "warning" | "error";
}

export function NodeCard({ data }: NodeProps) {
  const { t } = useTranslation("workflow");
  const { node, status, selected, issue } = data as NodeCardData;
  const hasResources = node.resources && node.resources.length > 0;
  const depCount = (node.dependencies ?? []).length;
  const issueRing =
    issue === "error"
      ? "ring-2 ring-destructive"
      : issue === "warning"
        ? "ring-2 ring-warning"
        : "";
  return (
    <div
      className={`min-w-[200px] max-w-[220px] border-2 px-3 py-2 text-sm transition ${STATUS_STYLES[status]} ${selected ? "ring-2 ring-accent ring-offset-1" : ""} ${issueRing}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-medium leading-tight">{node.title}</div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{node.ref}</div>
      <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span>{node.adapter.name}</span>
        <span>{t(`status.${status}`)}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
        <span title={t("canvas.control_prereqs")}>⇡ {depCount}</span>
        {hasResources && (
          <span className="flex flex-wrap gap-1">
            {node.resources.map((r) => (
              <span
                key={r.name}
                className="border border-border bg-muted px-1 text-[10px]"
                title={t("canvas.resource_claim")}
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
