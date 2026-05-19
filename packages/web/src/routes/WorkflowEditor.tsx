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
  useRunSingleNode,
  ApiError,
} from "../api/client";
import { useWorkflowStore } from "../store/workflow";
import { DagCanvas } from "../features/workflow-editor/DagCanvas";
import { RunActions, RunPausedBanner, useRunPanelData } from "../features/workflow-run/RunPanel";
import { EventStream } from "../features/workflow-run/EventStream";
import { TimelineScrubber } from "../features/workflow-run/TimelineScrubber";
import { NodeDetailPanel } from "../features/workflow-editor/NodeDetailPanel";
import {
  VerifyActions,
  VerifyDetails,
  deriveIssueByNodeRef,
  useVerifyController,
} from "../features/workflow-verify/VerifyPanel";
import { SaveAsTemplateDialog } from "../features/templates/SaveAsTemplateDialog";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";

export default function WorkflowEditor() {
  const { t } = useTranslation("workflow");
  const { t: tc } = useTranslation("common");
  const { workflowId } = useParams();
  const { data, isLoading } = useWorkflow(workflowId);
  const { data: runs } = useWorkflowRuns(workflowId);
  const {
    setGraph,
    nodeStatus,
    currentRunId,
    setCurrentRunId,
    replayEvents,
    resetRun,
  } = useWorkflowStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Reset store state synchronously when the workflow id changes or when the
  // editor mounts on a new workflow id. The store is a zustand singleton
  // (lives outside React), so coming from a different workflow page leaves
  // stale nodeStatus / events / currentRunId behind. Initialising
  // prevWorkflowId to undefined guarantees the reset block fires on the
  // first render of every mount, not only on subsequent param changes.
  const [prevWorkflowId, setPrevWorkflowId] = useState<string | undefined>(
    undefined,
  );
  const didAutoSelectRun = useRef(false);
  if (prevWorkflowId !== workflowId) {
    setPrevWorkflowId(workflowId);
    resetRun();
    setGraph(null);
    setSelectedId(null);
    didAutoSelectRun.current = false;
  }

  const selected = useMemo<WorkflowNode | null>(() => {
    if (!selectedId || !data?.graph) return null;
    return data.graph.nodes.find((n) => n.id === selectedId) ?? null;
  }, [selectedId, data?.graph]);

  useEffect(() => {
    if (data?.graph) setGraph(data.graph);
  }, [data?.graph, setGraph]);

  // Auto-select the most recent run, but only once per workflow mount —
  // otherwise clicking Clear immediately rehydrates currentRunId from the
  // dropdown's freshest entry and the button looks dead.
  useEffect(() => {
    if (didAutoSelectRun.current) return;
    if (!runs || runs.length === 0 || currentRunId) return;
    didAutoSelectRun.current = true;
    setCurrentRunId(runs[0]!.id);
  }, [runs, currentRunId, setCurrentRunId]);

  const { data: runMeta } = useRun(currentRunId ?? undefined);
  // Only treat the editor as "live" when a real running run exists. The previous
  // `!runMeta || running` form falsely flipped on for freshly-imported workflows
  // (no runs yet → runMeta undefined), which hid the form/json tabs in
  // NodeDetailPanel and left the user looking at an events-only view.
  const isLiveRun = runMeta?.status === "running";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runMeta?.status covers the only field we read
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
  const runSingleNode = useRunSingleNode(workflowId ?? "");
  const [nodeRunError, setNodeRunError] = useState<string | null>(null);

  const isRunActive = runMeta?.status === "running";
  // Per-node ▶ is only meaningful while a run is live — clicking it advances
  // the paused node via continueBp. When no run is active, the user must
  // click the global Run button first; spawning standalone single-node runs
  // out of nowhere was confusing and is disabled here.
  const runnableNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!isRunActive) return set;
    for (const id of pausedNodeIds) set.add(id);
    return set;
  }, [isRunActive, pausedNodeIds]);

  const runningNodeId =
    runMeta?.status === "running" ? runMeta.target_node_id ?? null : null;

  const handleRunNode = async (nodeId: string) => {
    setNodeRunError(null);
    // If the active run is currently paused at this node (step-mode or
    // breakpoint), advance that run instead of spawning a fresh single-node
    // run — otherwise we'd orphan the in-flight step-mode session.
    if (
      currentRunId &&
      runMeta?.status === "running" &&
      pausedNodeIds.has(nodeId)
    ) {
      try {
        await runCtl.continueBp.mutateAsync({ runId: currentRunId, nodeId });
      } catch (err) {
        setNodeRunError((err as Error).message);
      }
      return;
    }
    try {
      const r = await runSingleNode.mutateAsync(nodeId);
      setCurrentRunId(r.id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.failures.length > 0) {
          const lines = err.failures.map(
            (f) => `${f.node_ref} (${f.adapter}: ${f.reason})`,
          );
          setNodeRunError(`${err.message}: ${lines.join("; ")}`);
        } else {
          const detail = (err.issues ?? []).join(", ");
          setNodeRunError(detail ? `${err.message}: ${detail}` : err.message);
        }
      } else {
        setNodeRunError((err as Error).message);
      }
    }
  };

  if (isLoading || !workflowId)
    return <p className="p-6 font-mono text-xs text-muted-foreground">{tc("loading")}</p>;
  if (!data)
    return <p className="p-6 font-mono text-xs text-destructive">{t("not_found")}</p>;

  const rightCol = "460px";

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
        {nodeRunError && (
          <div className="flex items-center justify-between border-b border-destructive bg-destructive/10 px-6 py-1.5 font-mono text-[11px] text-destructive">
            <span>{nodeRunError}</span>
            <button
              type="button"
              className="text-destructive/70 hover:text-destructive"
              onClick={() => setNodeRunError(null)}
            >
              ✕
            </button>
          </div>
        )}
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
          onRunNode={handleRunNode}
          runnableNodeIds={runnableNodeIds}
          runningNodeId={runningNodeId}
        />
      </div>
      <div className="min-h-0">
        {selected ? (
          <NodeDetailPanel
            key={selected.id}
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
