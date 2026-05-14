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
} from "../api/client";
import { useRunEventStream } from "../api/ws";
import { useWorkflowStore } from "../store/workflow";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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

export function RunPanel({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation("workflow");
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

  const isRunning = run?.status === "running";
  const isStarting = startRun.isPending;
  const canResume =
    run && (run.status === "failed" || run.status === "cancelled") &&
    (checkpoints?.length ?? 0) > 0;
  const lastCheckpoint = checkpoints?.[0];

  const showPausedBanner = isRunning && pausedNodes.length > 0;

  return (
    <div className="flex flex-col">
      {showPausedBanner && currentRunId && (
        <div className="flex flex-wrap items-center gap-3 border-b border-warning bg-warning/10 px-6 py-2">
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
                className="h-7 border-success text-success hover:bg-success/10"
                disabled={continueBp.isPending}
                onClick={() =>
                  continueBp.mutate({ runId: currentRunId, nodeId })
                }
              >
                {t("run.continue")}
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => cancelRun.mutate(currentRunId)}
            disabled={cancelRun.isPending}
          >
            {t("run.cancel")}
          </Button>
        </div>
      )}
    <div className="flex h-11 flex-wrap items-center gap-4 border-b border-border bg-card/40 px-6">
      <Button
        size="sm"
        onClick={async () => {
          const r = await startRun.mutateAsync();
          setCurrentRunId(r.id);
        }}
        disabled={isStarting || isRunning}
        className="bg-success text-success-foreground hover:bg-success/90"
      >
        {isStarting ? t("run.starting") : isRunning ? t("run.running") : t("run.run")}
      </Button>

      {canResume && currentRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await resumeRun.mutateAsync({ runId: currentRunId });
            setCurrentRunId(r.id);
          }}
          disabled={resumeRun.isPending}
          className="border-warning text-warning hover:bg-warning/10"
          title={
            lastCheckpoint
              ? t("run.resume_hint", { count: lastCheckpoint.blob.completed_node_ids.length })
              : t("run.resume_hint_unknown")
          }
        >
          {resumeRun.isPending ? t("run.resuming") : t("run.resume")}
        </Button>
      )}

      {isRunning && currentRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => cancelRun.mutate(currentRunId)}
          disabled={cancelRun.isPending}
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          {t("run.cancel")}
        </Button>
      )}

      {runs && runs.length > 0 && (
        <Select
          value={currentRunId ?? undefined}
          onValueChange={(v) => setCurrentRunId(v)}
        >
          <SelectTrigger className="h-7 w-[230px] px-2 font-mono text-[11px]">
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
                  <span className="text-muted-foreground">
                    {r.status}
                  </span>
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

      {startRun.error && (
        <span className="font-mono text-[10px] text-destructive">
          {(startRun.error as Error).message}
        </span>
      )}
      {resumeRun.error && (
        <span className="font-mono text-[10px] text-destructive">
          {(resumeRun.error as Error).message}
        </span>
      )}
    </div>
    </div>
  );
}
