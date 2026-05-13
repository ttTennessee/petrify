import { useCallback } from "react";
import { useStartRun, useRun } from "../api/client";
import { useRunEventStream } from "../api/ws";
import { useWorkflowStore } from "../store/workflow";

const STATUS_COLOR: Record<string, string> = {
  running: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-700",
};

export function RunPanel({ workflowId }: { workflowId: string }) {
  const startRun = useStartRun(workflowId);
  const { currentRunId, setCurrentRunId, ingestEvent } = useWorkflowStore();
  const { data: run } = useRun(currentRunId ?? undefined);

  useRunEventStream(
    currentRunId ?? undefined,
    useCallback((ev) => ingestEvent(ev), [ingestEvent]),
  );

  const isRunning = run?.status === "running";
  const isStarting = startRun.isPending;

  return (
    <div className="flex items-center gap-3 border-b bg-white px-4 py-2">
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
      {run?.error && <span className="truncate text-xs text-rose-600">{run.error}</span>}
      {startRun.error && (
        <span className="text-xs text-rose-600">{(startRun.error as Error).message}</span>
      )}
    </div>
  );
}
