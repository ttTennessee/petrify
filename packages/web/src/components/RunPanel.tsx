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
  const { data: checkpoints } = useCheckpoints(currentRunId ?? undefined);

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
    <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-2">
      <button
        onClick={async () => {
          const r = await startRun.mutateAsync();
          setCurrentRunId(r.id);
        }}
        disabled={isStarting || isRunning}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isStarting ? "Starting…" : isRunning ? "Running…" : "Run"}
      </button>

      {canResume && currentRunId && (
        <button
          onClick={async () => {
            const r = await resumeRun.mutateAsync({ runId: currentRunId });
            setCurrentRunId(r.id);
          }}
          disabled={resumeRun.isPending}
          className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          title={
            lastCheckpoint
              ? `resume from latest checkpoint (${lastCheckpoint.blob.completed_node_ids.length} nodes done)`
              : "resume"
          }
        >
          {resumeRun.isPending ? "Resuming…" : "Resume"}
        </button>
      )}

      {isRunning && currentRunId && (
        <button
          onClick={() => cancelRun.mutate(currentRunId)}
          disabled={cancelRun.isPending}
          className="rounded border border-rose-300 px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
        >
          Cancel
        </button>
      )}

      {currentRunId && (
        <span className="text-xs text-slate-500">run: {currentRunId.slice(0, 8)}…</span>
      )}
      {run && (
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[run.status] ?? "bg-slate-100 text-slate-600"}`}
        >
          {run.status}
        </span>
      )}
      {run?.resumed_from && (
        <span className="text-[11px] text-slate-500">
          resumed from {run.resumed_from.slice(0, 8)}…
        </span>
      )}
      {checkpoints && checkpoints.length > 0 && (
        <span className="text-[11px] text-slate-500">
          checkpoints: {checkpoints.length}
        </span>
      )}
      {run?.error && (
        <span className="max-w-md truncate text-xs text-rose-600" title={run.error}>
          {run.error}
        </span>
      )}
      {startRun.error && (
        <span className="text-xs text-rose-600">{(startRun.error as Error).message}</span>
      )}
      {resumeRun.error && (
        <span className="text-xs text-rose-600">{(resumeRun.error as Error).message}</span>
      )}
    </div>
  );
}
