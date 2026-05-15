import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { NodeStatus, WorkflowNode } from "@petrify/shared";
import {
  useWorkflow,
  useWorkflowRuns,
  useRunEvents,
  useRun,
  useCheckpoints,
  useVerifyWorkflow,
  useBreakpoints,
} from "../api/client";
import { useWorkflowStore } from "../store/workflow";
import { DagCanvas } from "../components/DagCanvas";
import { RunActions, RunPausedBanner, useRunPanelData } from "../components/RunPanel";
import { EventStream } from "../components/EventStream";
import { TimelineScrubber } from "../components/TimelineScrubber";
import { NodeDetailPanel } from "../components/NodeDetailPanel";
import {
  VerifyActions,
  VerifyDetails,
  deriveIssueByNodeRef,
  useVerifyController,
} from "../components/VerifyPanel";
import { SaveAsTemplateDialog } from "../components/SaveAsTemplateDialog";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";

export default function WorkflowEditor() {
  const { t } = useTranslation("workflow");
  const { t: tc } = useTranslation("common");
  const { workflowId } = useParams();
  const { data, isLoading } = useWorkflow(workflowId);
  const { data: runs } = useWorkflowRuns(workflowId);
  const { setGraph, nodeStatus, currentRunId, setCurrentRunId, replayEvents, resetRun } =
    useWorkflowStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  useEffect(() => {
    resetRun();
    setSelectedId(null);
  }, [workflowId]);

  const selected = useMemo<WorkflowNode | null>(() => {
    if (!selectedId || !data?.graph) return null;
    return data.graph.nodes.find((n) => n.id === selectedId) ?? null;
  }, [selectedId, data?.graph]);

  useEffect(() => {
    if (data?.graph) setGraph(data.graph);
  }, [data?.graph, setGraph]);

  useEffect(() => {
    if (!runs || runs.length === 0 || currentRunId) return;
    setCurrentRunId(runs[0]!.id);
  }, [runs, currentRunId, setCurrentRunId]);

  const { data: runMeta } = useRun(currentRunId ?? undefined);
  const isLiveRun = !runMeta || runMeta.status === "running";
  const { data: history } = useRunEvents(currentRunId ?? undefined);
  const { data: checkpoints } = useCheckpoints(currentRunId ?? undefined, isLiveRun);

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

  // When a run transitions out of "running", force one more event fetch.
  // The WebSocket should already have streamed every event in real time, but
  // this guards against transient drops or events emitted in the same tick as
  // the status update being missed by the live subscription. Without this,
  // the user would see a stale event list / wrong node statuses until they
  // manually refresh.
  const qc = useQueryClient();
  const lastSettledRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRunId || !runMeta) return;
    if (runMeta.status === "running") {
      lastSettledRunId.current = null;
      return;
    }
    if (lastSettledRunId.current === currentRunId) return;
    lastSettledRunId.current = currentRunId;
    qc.invalidateQueries({ queryKey: ["run-events", currentRunId] });
    qc.invalidateQueries({ queryKey: ["checkpoints", currentRunId] });
  }, [currentRunId, runMeta?.status, qc]);

  const { data: verifyReport } = useVerifyWorkflow(workflowId);
  const issueByRef = useMemo(() => deriveIssueByNodeRef(verifyReport), [verifyReport]);

  const { data: breakpoints } = useBreakpoints(workflowId);
  const breakpointNodeIds = useMemo(
    () => new Set((breakpoints ?? []).filter((b) => b.enabled).map((b) => b.node_id)),
    [breakpoints],
  );
  const allEvents = useWorkflowStore((s) => s.allEvents);
  const pausedNodeIds = useMemo(() => {
    const pausedAt = new Set<string>();
    for (const ev of allEvents) {
      if (!ev.node_id) continue;
      if (ev.type === "BreakpointHit") pausedAt.add(ev.node_id);
      else if (
        ev.type === "NodeStarted" ||
        ev.type === "NodeCompleted" ||
        ev.type === "NodeFailed" ||
        ev.type === "NodeSkipped"
      ) {
        pausedAt.delete(ev.node_id);
      }
    }
    return pausedAt;
  }, [allEvents]);

  // Controllers must mount unconditionally so their hooks (WebSocket, queries)
  // stay live across renders. They're created at top level even before the
  // loading early-returns below — workflowId may briefly be undefined here, in
  // which case downstream hooks short-circuit on the empty key.
  const runCtl = useRunPanelData(workflowId ?? "");
  const verifyCtl = useVerifyController(workflowId ?? "");

  if (isLoading || !workflowId)
    return <p className="p-6 font-mono text-xs text-muted-foreground">{tc("loading")}</p>;
  if (!data)
    return <p className="p-6 font-mono text-xs text-destructive">{t("not_found")}</p>;

  const rightCol = selected ? "380px" : "320px";

  return (
    <div
      className="grid h-full grid-rows-[auto_auto_auto_auto_minmax(0,1fr)]"
      style={{ gridTemplateColumns: `1fr ${rightCol}` }}
    >
      {/* Unified toolbar — breadcrumb, run controls, verify controls, save-as-template
          all share one h-11 row. Replaces the previous four stacked rows. */}
      <div className="col-span-2 flex h-11 items-center gap-3 border-b border-border bg-card/40 px-6">
        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{t("breadcrumb")}</span>
          <span className="text-muted-foreground/40">›</span>
          <span className="max-w-[200px] truncate text-foreground" title={workflowId}>
            {workflowId}
          </span>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <RunActions controller={runCtl} />
        <Separator orientation="vertical" className="ml-auto h-5" />
        <VerifyActions workflowId={workflowId} controller={verifyCtl} />
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px]"
          onClick={() => setShowSaveTemplate(true)}
        >
          {t("save_as_template")}
        </Button>
      </div>

      {showSaveTemplate && (
        <SaveAsTemplateDialog
          workflowId={workflowId}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}

      <div className="col-span-2">
        <RunPausedBanner controller={runCtl} />
      </div>
      <div className="col-span-2">
        <VerifyDetails controller={verifyCtl} />
      </div>
      <div className="col-span-2">
        {currentRunId && (
          <TimelineScrubber
            runId={currentRunId}
            onNavigateToRun={(id) => setCurrentRunId(id)}
          />
        )}
      </div>
      <div className="min-h-0 min-w-0 border-r border-border">
        <DagCanvas
          graph={data.graph}
          nodeStatus={nodeStatus}
          onSelectNode={(n) => setSelectedId(n?.id ?? null)}
          selectedNodeId={selected?.id ?? null}
          issueByRef={issueByRef}
          breakpointNodeIds={breakpointNodeIds}
          pausedNodeIds={pausedNodeIds}
        />
      </div>
      <div className="min-h-0">
        {selected ? (
          <NodeDetailPanel
            node={selected}
            workflowId={workflowId}
            onClose={() => setSelectedId(null)}
            isLiveRun={isLiveRun}
          />
        ) : (
          <EventStream />
        )}
      </div>
    </div>
  );
}
