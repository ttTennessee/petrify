import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useStartRun,
  useRun,
  useResumeRun,
  useCancelRun,
  useCheckpoints,
  useContinueBreakpoint,
  useWorkflowRuns,
  ApiError,
} from "../../api/client";
import { useConfig } from "../../api/config";
import { useRunEventStream } from "../../api/ws";
import { useWorkflowStore } from "../../store/workflow";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type BadgeVariant = "accent" | "success" | "destructive" | "outline" | "warning";

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "running": return "accent";
    case "completed": return "success";
    case "failed": return "destructive";
    case "paused": return "warning";
    default: return "outline";
  }
}

function useRunController(workflowId: string) {
  const startRun = useStartRun(workflowId);
  const resumeRun = useResumeRun();
  const cancelRun = useCancelRun();
  const continueBp = useContinueBreakpoint();
  const { currentRunId, setCurrentRunId, ingestEvent } = useWorkflowStore();
  const allEvents = useWorkflowStore((s) => s.allEvents);
  const graph = useWorkflowStore((s) => s.graph);
  const { data: run } = useRun(currentRunId ?? undefined);
  const { data: runs } = useWorkflowRuns(workflowId);
  const isLiveRun = !run || run.status === "running";
  const { data: checkpoints } = useCheckpoints(currentRunId ?? undefined, isLiveRun);

  useRunEventStream(
    currentRunId ?? undefined,
    useCallback((ev) => ingestEvent(ev), [ingestEvent]),
  );

  const pausedNodes = useMemo(() => {
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
    return [...pausedAt];
  }, [allEvents]);

  const refByNodeId = useMemo(() => {
    const m: Record<string, string> = {};
    if (graph) for (const n of graph.nodes) m[n.id] = n.ref;
    return m;
  }, [graph]);

  const { data: config } = useConfig();
  const autoRun = config?.auto_run ?? true;

  return {
    startRun,
    resumeRun,
    cancelRun,
    continueBp,
    currentRunId,
    setCurrentRunId,
    run,
    runs,
    checkpoints,
    pausedNodes,
    refByNodeId,
    autoRun,
  };
}

export function useRunPanelData(workflowId: string) {
  return useRunController(workflowId);
}

export function RunPausedBanner({
  controller,
}: {
  controller: ReturnType<typeof useRunController>;
}) {
  const { t } = useTranslation("workflow");
  const { continueBp, cancelRun, currentRunId, pausedNodes, refByNodeId, run } =
    controller;
  const isRunning = run?.status === "running";
  const show = isRunning && pausedNodes.length > 0 && !!currentRunId;
  if (!show) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-warning bg-warning/10 px-6 py-1.5">
      <Badge variant="warning" dot>
        {t("run.paused_banner")}
      </Badge>
      {pausedNodes.map((nodeId) => (
        <div key={nodeId} className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-foreground">
            {refByNodeId[nodeId] ?? nodeId}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 border-success text-success hover:bg-success/10"
            disabled={continueBp.isPending}
            onClick={() => continueBp.mutate({ runId: currentRunId!, nodeId })}
          >
            {t("run.continue")}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="h-6 border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => cancelRun.mutate(currentRunId!)}
        disabled={cancelRun.isPending}
      >
        {t("run.cancel")}
      </Button>
    </div>
  );
}

export function RunActions({
  controller,
}: {
  controller: ReturnType<typeof useRunController>;
}) {
  const { t } = useTranslation("workflow");
  const {
    startRun,
    resumeRun,
    cancelRun,
    currentRunId,
    setCurrentRunId,
    run,
    runs,
    checkpoints,
    autoRun,
  } = controller;

  const isRunning = run?.status === "running";
  const isStarting = startRun.isPending;
  // Continue is offered when there's progress to pick up from:
  //  - failed / cancelled runs → resume from latest checkpoint
  //  - single-node runs that completed → the rest of the graph is still TODO
  // A fully-completed end-to-end run has no remaining work, so we hide it.
  const canContinue =
    !!run &&
    run.status !== "running" &&
    (checkpoints?.length ?? 0) > 0 &&
    (run.status === "failed" ||
      run.status === "cancelled" ||
      (run.status === "completed" && !!run.target_node_id));
  const lastCheckpoint = checkpoints?.[0];
  const continueLabel =
    run?.status === "failed" || run?.status === "cancelled"
      ? t("run.resume")
      : t("run.continue_run");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={async () => {
          const r = await startRun.mutateAsync({ stepMode: !autoRun });
          setCurrentRunId(r.id);
        }}
        disabled={isStarting || isRunning}
        className="h-7 px-2.5 text-[11px] bg-success text-success-foreground hover:bg-success/90"
        title={autoRun ? t("run.run") : t("run.run_step")}
      >
        {isStarting
          ? t("run.starting")
          : isRunning
            ? t("run.running")
            : autoRun
              ? t("run.run")
              : t("run.run_step")}
      </Button>

      {canContinue && currentRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await resumeRun.mutateAsync({
              runId: currentRunId,
              stepMode: !autoRun,
            });
            setCurrentRunId(r.id);
          }}
          disabled={resumeRun.isPending}
          className="h-7 px-2.5 text-[11px] border-accent text-accent hover:bg-accent/10"
          title={
            lastCheckpoint
              ? t("run.resume_hint", { count: lastCheckpoint.blob.completed_node_ids.length })
              : t("run.resume_hint_unknown")
          }
        >
          {resumeRun.isPending ? t("run.resuming") : continueLabel}
        </Button>
      )}

      {currentRunId && !isRunning && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCurrentRunId(null)}
          className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
          title={t("run.clear_hint")}
        >
          {t("run.clear")}
        </Button>
      )}

      {isRunning && currentRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => cancelRun.mutate(currentRunId)}
          disabled={cancelRun.isPending}
          className="h-7 px-2.5 text-[11px] border-destructive text-destructive hover:bg-destructive/10"
        >
          {t("run.cancel")}
        </Button>
      )}

      {runs && runs.length > 0 && (
        <Select
          value={currentRunId ?? undefined}
          onValueChange={(v) => setCurrentRunId(v)}
        >
          <SelectTrigger className="h-7 w-[210px] px-2 font-mono text-[11px]">
            <SelectValue placeholder={t("run.picker_placeholder")} />
          </SelectTrigger>
          <SelectContent>
            {runs.map((r) => (
              <SelectItem key={r.id} value={r.id} className="font-mono text-[11px]">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      r.status === "running"
                        ? "bg-accent"
                        : r.status === "completed"
                          ? "bg-success"
                          : r.status === "failed"
                            ? "bg-destructive"
                            : r.status === "cancelled"
                              ? "bg-warning"
                              : "bg-muted-foreground"
                    }`}
                  />
                  <span>{r.id.slice(0, 8)}</span>
                  <span className="text-muted-foreground">{r.status}</span>
                  <span className="text-muted-foreground/60">
                    {new Date(r.started_at).toLocaleTimeString()}
                  </span>
                  {r.resumed_from && (
                    <span className="text-muted-foreground/60">
                      ⤴ {r.resumed_from.slice(0, 6)}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {run && (
        <Badge variant={statusVariant(run.status)} dot>
          {run.status}
        </Badge>
      )}

      {run?.resumed_from && (
        <button
          type="button"
          onClick={() => setCurrentRunId(run.resumed_from!)}
          className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
          title={t("run.jump_to_parent")}
        >
          ← {t("run.resumed_from")}{run.resumed_from.slice(0, 8)}…
        </button>
      )}

      {checkpoints && checkpoints.length > 0 && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("run.checkpoint", { count: checkpoints.length })}
        </span>
      )}

      {run?.error && (
        <span
          className="max-w-md truncate font-mono text-[10px] text-destructive"
          title={run.error}
        >
          {run.error}
        </span>
      )}

      {startRun.error && <RunErrorMessage error={startRun.error} t={t} />}
      {resumeRun.error && <RunErrorMessage error={resumeRun.error} t={t} />}
    </div>
  );
}

function RunErrorMessage({
  error,
  t,
}: {
  error: unknown;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (error instanceof ApiError && error.failures.length > 0) {
    return (
      <div className="flex max-w-md flex-col gap-1 font-mono text-[10px] text-destructive">
        <span className="font-semibold">{t("run.preflight.title")}</span>
        {error.failures.map((f) => (
          <span key={`${f.node_id}:${f.adapter}`} title={f.reason}>
            • {f.node_ref}{" "}
            <span className="opacity-70">
              ({f.adapter}: {f.reason})
            </span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <span className="font-mono text-[10px] text-destructive">
      {(error as Error).message}
    </span>
  );
}
