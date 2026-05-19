import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkflowStore } from "../../store/workflow";
import { buildBuckets, NodeCard } from "./EventStream";

export function NodeEventStream({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation("workflow");
  const events = useWorkflowStore((s) => s.events);
  const graph = useWorkflowStore((s) => s.graph);

  const refByNodeId = useMemo(() => {
    const m: Record<string, { ref: string; title: string }> = {};
    if (graph) for (const n of graph.nodes) m[n.id] = { ref: n.ref, title: n.title };
    return m;
  }, [graph]);

  const { buckets } = useMemo(
    () => buildBuckets(events, refByNodeId),
    [events, refByNodeId],
  );

  const bucket = buckets.find((b) => b.nodeId === nodeId) ?? null;

  const AI_TYPES = new Set([
    "PermissionRequested",
    "PermissionResolved",
    "OutputGenerated",
  ]);
  const hasRuntimeEvents =
    !!bucket && bucket.subEvents.some((ev) => !AI_TYPES.has(ev.type));

  if (!bucket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("events.no_node_events")}
        </span>
      </div>
    );
  }

  if (!hasRuntimeEvents) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("events.no_runtime_events")}
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-4 py-3">
      <NodeCard bucket={bucket} expanded={true} onToggle={() => {}} view="events" />
    </div>
  );
}
