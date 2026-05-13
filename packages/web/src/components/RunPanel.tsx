import { useCallback } from "react";
import { useStartRun } from "../api/client";
import { useRunEventStream } from "../api/ws";
import { useWorkflowStore } from "../store/workflow";

export function RunPanel({ workflowId }: { workflowId: string }) {
  const startRun = useStartRun(workflowId);
  const { currentRunId, setCurrentRunId, ingestEvent } = useWorkflowStore();

  useRunEventStream(
    currentRunId ?? undefined,
    useCallback((ev) => ingestEvent(ev), [ingestEvent]),
  );

  return (
    <div className="flex items-center gap-3 border-b bg-white px-4 py-2">
      <button
        onClick={async () => {
          const r = await startRun.mutateAsync();
          setCurrentRunId(r.id);
        }}
        disabled={startRun.isPending}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {startRun.isPending ? "Starting…" : "Run"}
      </button>
      {currentRunId && (
        <span className="text-xs text-slate-500">run: {currentRunId}</span>
      )}
      {startRun.error && (
        <span className="text-xs text-rose-600">{(startRun.error as Error).message}</span>
      )}
    </div>
  );
}
