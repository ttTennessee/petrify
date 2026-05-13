import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useWorkflow } from "../api/client";
import { useWorkflowStore } from "../store/workflow";
import { DagCanvas } from "../components/DagCanvas";
import { RunPanel } from "../components/RunPanel";
import { EventStream } from "../components/EventStream";

export default function WorkflowEditor() {
  const { workflowId } = useParams();
  const { data, isLoading } = useWorkflow(workflowId);
  const { setGraph, nodeStatus } = useWorkflowStore();

  useEffect(() => {
    if (data?.graph) setGraph(data.graph);
  }, [data?.graph, setGraph]);

  if (isLoading || !workflowId) return <p className="p-6 text-sm text-slate-500">loading…</p>;
  if (!data) return <p className="p-6 text-sm text-rose-600">workflow not found</p>;

  return (
    <div className="grid h-full grid-cols-[1fr_320px] grid-rows-[auto_minmax(0,1fr)]">
      <div className="col-span-2">
        <RunPanel workflowId={workflowId} />
      </div>
      <div className="min-h-0 min-w-0">
        <DagCanvas graph={data.graph} nodeStatus={nodeStatus} />
      </div>
      <div className="min-h-0">
        <EventStream />
      </div>
    </div>
  );
}
