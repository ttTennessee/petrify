import { useCallback } from "react";
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

const STATUS_COLOR: Record<string, string> = {
  running: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-700",
  paused: "bg-amber-100 text-amber-700",
};

export function RunPanel({ workflowId }: { workflowId: string }) {
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
    <div className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-2">
      <Button
        size="sm"
        onClick={async () => {
          const r = await startRun.mutateAsync();
          setCurrentRunId(r.id);
        }}
        disabled={isStarting || isRunning}
        className="bg-emerald-600 text-white hover:bg-emerald-600/90"
      >
        {isStarting ? "Starting…" : isRunning ? "Running…" : "Run"}
      </Button>

      {canResume && currentRunId && (
        <Button
          size="sm"
          onClick={async () => {
            const r = await resumeRun.mutateAsync({ runId: currentRunId });
            setCurrentRunId(r.id);
          }}
          disabled={resumeRun.isPending}
          className="bg-amber-600 text-white hover:bg-amber-600/90"
          title={
            lastCheckpoint
              ? `resume from latest checkpoint (${lastCheckpoint.blob.completed_node_ids.length} nodes done)`
              : "resume"
          }
        >
          {resumeRun.isPending ? "Resuming…" : "Resume"}
        </Button>
      )}

      {isRunning && currentRunId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => cancelRun.mutate(currentRunId)}
          disabled={cancelRun.isPending}
          className="border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        >
          Cancel
        </Button>
      )}

      {currentRunId && (
        <span className="text-xs text-muted-foreground">
          run: {currentRunId.slice(0, 8)}…
        </span>
      )}
      {run && (
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[run.status] ?? "bg-slate-100 text-slate-600"}`}
        >
          {run.status}
        </span>
      )}
      {run?.resumed_from && (
        <span className="text-[11px] text-muted-foreground">
          resumed from {run.resumed_from.slice(0, 8)}…
        </span>
      )}
      {checkpoints && checkpoints.length > 0 && (
        <span className="text-[11px] text-muted-foreground">
          checkpoints: {checkpoints.length}
        </span>
      )}
      {run?.error && (
        <span
          className="max-w-md truncate text-xs text-destructive"
          title={run.error}
        >
          {run.error}
        </span>
      )}
      {startRun.error && (
        <span className="text-xs text-destructive">
          {(startRun.error as Error).message}
        </span>
      )}
      {resumeRun.error && (
        <span className="text-xs text-destructive">
          {(resumeRun.error as Error).message}
        </span>
      )}
    </div>
  );
}
