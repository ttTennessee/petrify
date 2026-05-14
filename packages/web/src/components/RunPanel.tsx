import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useStartRun,
  useRun,
  useResumeRun,
  useCancelRun,
  useCheckpoints,
} from "../api/client";
import { useRunEventStream } from "../api/ws";
import { useWorkflowStore } from "../store/workflow";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

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
  const { currentRunId, setCurrentRunId, ingestEvent } = useWorkflowStore();
  const { data: run } = useRun(currentRunId ?? undefined);
  const isLiveRun = !run || run.status === "running";
  const { data: checkpoints } = useCheckpoints(currentRunId ?? undefined, isLiveRun);

  useRunEventStream(
    currentRunId ?? undefined,
    useCallback((ev) => ingestEvent(ev), [ingestEvent]),
  );

  const isRunning = run?.status === "running";
  const isStarting = startRun.isPending;
  const canResume =
    run && (run.status === "failed" || run.status === "cancelled") &&
    (checkpoints?.length ?? 0) > 0;
  const lastCheckpoint = checkpoints?.[0];

  return (
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

      {currentRunId && (
        <Badge variant="outline">
          {t("run.run").toLowerCase()} · {currentRunId.slice(0, 8)}
        </Badge>
      )}

      {run && (
        <Badge variant={statusVariant(run.status)} dot>
          {run.status}
        </Badge>
      )}

      {run?.resumed_from && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {t("run.resumed_from")}{run.resumed_from.slice(0, 8)}…
        </span>
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
  );
}
