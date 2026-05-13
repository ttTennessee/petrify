import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { NodeStatus, WorkflowNode } from "@petrify/shared";
import {
  useWorkflow,
  useWorkflowRuns,
  useRunEvents,
  useCheckpoints,
} from "../api/client";
import { useWorkflowStore } from "../store/workflow";
import { DagCanvas } from "../components/DagCanvas";
import { RunPanel } from "../components/RunPanel";
import { EventStream } from "../components/EventStream";
import { NodeDetailPanel } from "../components/NodeDetailPanel";

export default function WorkflowEditor() {
  const { workflowId } = useParams();
  const { data, isLoading } = useWorkflow(workflowId);
  const { data: runs } = useWorkflowRuns(workflowId);
  const { setGraph, nodeStatus, currentRunId, setCurrentRunId, replayEvents } =
    useWorkflowStore();
  const [selected, setSelected] = useState<WorkflowNode | null>(null);

  useEffect(() => {
    if (data?.graph) setGraph(data.graph);
  }, [data?.graph, setGraph]);

  // On mount, latch onto the latest run for this workflow so refresh restores view.
  useEffect(() => {
    if (!runs || runs.length === 0 || currentRunId) return;
    setCurrentRunId(runs[0]!.id);
  }, [runs, currentRunId, setCurrentRunId]);

  const { data: history } = useRunEvents(currentRunId ?? undefined);
  const { data: checkpoints } = useCheckpoints(currentRunId ?? undefined);

  // Resumed runs don't re-emit events for nodes the prior run already finished,
  // so the latest checkpoint is the authoritative source of their visual state.
  const seedStatus = useMemo<Record<string, NodeStatus>>(() => {
    const latest = checkpoints?.[0]?.blob;
    if (!latest) return {};
    const seed: Record<string, NodeStatus> = {};
    for (const id of latest.completed_node_ids) seed[id] = "completed";
    for (const id of latest.skipped_node_ids) seed[id] = "skipped";
    return seed;
  }, [checkpoints]);

  useEffect(() => {
    if (history) replayEvents(history, seedStatus);
  }, [history, seedStatus, replayEvents]);

  if (isLoading || !workflowId) return <p className="p-6 text-sm text-slate-500">loading…</p>;
  if (!data) return <p className="p-6 text-sm text-rose-600">workflow not found</p>;

  const rightCol = selected ? "360px" : "320px";

  return (
    <div
      className="grid h-full grid-rows-[auto_minmax(0,1fr)]"
      style={{ gridTemplateColumns: `1fr ${rightCol}` }}
    >
      <div className="col-span-2">
        <RunPanel workflowId={workflowId} />
      </div>
      <div className="min-h-0 min-w-0">
        <DagCanvas
          graph={data.graph}
          nodeStatus={nodeStatus}
          onSelectNode={setSelected}
          selectedNodeId={selected?.id ?? null}
        />
      </div>
      <div className="min-h-0">
        {selected ? (
          <NodeDetailPanel node={selected} onClose={() => setSelected(null)} />
        ) : (
          <EventStream />
        )}
      </div>
    </div>
  );
}
