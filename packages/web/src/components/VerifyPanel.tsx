import { useState } from "react";
import type { DryRunReport, VerificationReport } from "@petrify/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRunVerify, useRunDryRun, useVerifyWorkflow } from "../api/client";

const STATUS_STYLE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  fail: "bg-rose-100 text-rose-800",
};

const RISK_STYLE: Record<string, string> = {
  low: "text-emerald-700",
  medium: "text-amber-700",
  high: "text-orange-700",
  blocking: "text-rose-700",
};

export function VerifyPanel({ workflowId }: { workflowId: string }) {
  const qc = useQueryClient();
  const verifyMu = useRunVerify(workflowId);
  const dryMu = useRunDryRun(workflowId);
  const { data: lastReport } = useVerifyWorkflow(workflowId);
  const [dry, setDry] = useState<DryRunReport | null>(null);

  const report: VerificationReport | null = verifyMu.data ?? lastReport ?? null;

  return (
    <section className="border-b bg-slate-50 px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={async () => {
            await verifyMu.mutateAsync();
            qc.invalidateQueries({ queryKey: ["verify", workflowId] });
          }}
          disabled={verifyMu.isPending}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {verifyMu.isPending ? "Verifying…" : "Verify"}
        </button>
        <button
          onClick={async () => setDry(await dryMu.mutateAsync())}
          disabled={dryMu.isPending}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
        >
          {dryMu.isPending ? "Dry running…" : "Dry Run"}
        </button>
        {report && (
          <>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS_STYLE[report.status] ?? ""}`}
            >
              {report.status}
            </span>
            <span className={`text-[11px] ${RISK_STYLE[report.risk] ?? ""}`}>
              risk: {report.risk}
            </span>
            <span className="text-[11px] text-slate-500">
              {report.stats.place_count}P / {report.stats.transition_count}T ·{" "}
              {report.stats.explored_markings} markings
              {report.stats.truncated ? " (truncated)" : ""}
            </span>
          </>
        )}
      </div>

      {report && report.issues.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {report.issues.map((i, idx) => (
            <li
              key={idx}
              className={`rounded border px-2 py-1 ${
                i.level === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : i.level === "warning"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <div className="font-medium">[{i.code}] {i.message}</div>
              {i.affected_node_refs && i.affected_node_refs.length > 0 && (
                <div className="mt-0.5 text-[10px] text-slate-600">
                  nodes: {i.affected_node_refs.join(", ")}
                </div>
              )}
              {i.affected_pools && i.affected_pools.length > 0 && (
                <div className="mt-0.5 text-[10px] text-slate-600">
                  pools: {i.affected_pools.join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dry && (
        <div className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
          <div>
            estimated:{" "}
            <span className="font-mono">
              {(dry.estimated_duration_ms / 1000).toFixed(1)}s
            </span>{" "}
            · critical path:{" "}
            <span className="font-mono">{dry.critical_path.join(" → ")}</span>
          </div>
          {Object.keys(dry.resource_peaks).length > 0 && (
            <div>
              resource peaks:{" "}
              {Object.entries(dry.resource_peaks)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </div>
          )}
          {dry.failure_hotspots.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {dry.failure_hotspots.map((h, i) => (
                <li key={i}>
                  <span className="font-mono">{h.node_ref}</span>: {h.rationale}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// Derive a node-ref -> issue level map for highlighting on the DAG canvas.
export function deriveIssueByNodeRef(
  report: VerificationReport | null | undefined,
): Record<string, "warning" | "error"> {
  const out: Record<string, "warning" | "error"> = {};
  if (!report) return out;
  for (const i of report.issues) {
    for (const ref of i.affected_node_refs ?? []) {
      const cur = out[ref];
      if (i.level === "error" || cur !== "error") out[ref] = (i.level === "info" ? "warning" : i.level) as "warning" | "error";
    }
  }
  return out;
}
