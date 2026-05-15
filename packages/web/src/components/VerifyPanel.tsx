import { useState } from "react";
import type { DryRunReport, VerificationReport } from "@petrify/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRunVerify, useRunDryRun, useVerifyWorkflow } from "../api/client";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

type BadgeVariant = "success" | "warning" | "destructive" | "outline";

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "pass": return "success";
    case "warn": return "warning";
    case "fail": return "destructive";
    default: return "outline";
  }
}

function riskVariant(risk: string): BadgeVariant {
  switch (risk) {
    case "low": return "success";
    case "medium": return "warning";
    case "high": return "destructive";
    case "blocking": return "destructive";
    default: return "outline";
  }
}

function issueAccent(level: string) {
  switch (level) {
    case "error": return "border-l-destructive";
    case "warning": return "border-l-warning";
    default: return "border-l-muted-foreground/40";
  }
}

// Shared state hook so Actions and Details stay in sync when rendered apart.
export function useVerifyController(workflowId: string) {
  const verifyMu = useRunVerify(workflowId);
  const dryMu = useRunDryRun(workflowId);
  const { data: lastReport } = useVerifyWorkflow(workflowId);
  const [dry, setDry] = useState<DryRunReport | null>(null);
  const report: VerificationReport | null = verifyMu.data ?? lastReport ?? null;
  return { verifyMu, dryMu, report, dry, setDry };
}

export function VerifyActions({
  workflowId,
  controller,
}: {
  workflowId: string;
  controller: ReturnType<typeof useVerifyController>;
}) {
  const { t } = useTranslation("workflow");
  const qc = useQueryClient();
  const { verifyMu, dryMu, report, setDry } = controller;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        className="h-7 px-2.5 text-[11px]"
        onClick={async () => {
          await verifyMu.mutateAsync();
          qc.invalidateQueries({ queryKey: ["verify", workflowId] });
        }}
        disabled={verifyMu.isPending}
      >
        {verifyMu.isPending ? t("verify.verifying") : t("verify.verify")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-[11px]"
        onClick={async () => setDry(await dryMu.mutateAsync())}
        disabled={dryMu.isPending}
      >
        {dryMu.isPending ? t("verify.dry_running") : t("verify.dry_run")}
      </Button>
      {report && (
        <>
          <Badge variant={statusVariant(report.status)} dot>
            {report.status}
          </Badge>
          <Badge variant={riskVariant(report.risk)}>
            {t("verify.risk")}{report.risk}
          </Badge>
          <span className="font-mono text-[10px] text-muted-foreground">
            {report.stats.place_count}P / {report.stats.transition_count}T ·{" "}
            {report.stats.explored_markings} {t("verify.markings")}
            {report.stats.truncated ? ` ${t("verify.truncated")}` : ""}
          </span>
        </>
      )}
    </div>
  );
}

export function VerifyDetails({
  controller,
}: {
  controller: ReturnType<typeof useVerifyController>;
}) {
  const { t } = useTranslation("workflow");
  const { report, dry } = controller;
  const hasIssues = report && report.issues.length > 0;
  if (!hasIssues && !dry) return null;

  return (
    <section className="border-b border-border bg-muted/20 px-6 py-2">
      {hasIssues && (
        <ul className="space-y-1">
          {report!.issues.map((i, idx) => (
            <li
              key={idx}
              className={`border-l-2 pl-3 py-0.5 text-xs ${issueAccent(i.level)}`}
            >
              <div className="font-mono font-medium text-[11px]">
                [{i.code}]{" "}
                <span className="font-sans font-normal">{i.message}</span>
              </div>
              {i.affected_node_refs && i.affected_node_refs.length > 0 && (
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {t("verify.nodes")}{i.affected_node_refs.join(", ")}
                </div>
              )}
              {i.affected_pools && i.affected_pools.length > 0 && (
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {t("verify.pools")}{i.affected_pools.join(", ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dry && (
        <div
          className={`${hasIssues ? "mt-2 border-t border-border pt-2" : ""} font-mono text-[11px] text-foreground/80`}
        >
          <span>
            {t("verify.estimated")}{" "}
            <span className="text-foreground">
              {(dry.estimated_duration_ms / 1000).toFixed(1)}{t("verify.seconds")}
            </span>
          </span>
          <span className="mx-3 text-muted-foreground/40">·</span>
          <span>
            {t("verify.critical_path")}{" "}
            <span className="text-foreground">{dry.critical_path.join(" → ")}</span>
          </span>
          {Object.keys(dry.resource_peaks).length > 0 && (
            <div className="mt-1 text-muted-foreground">
              {t("verify.peaks")}{" "}
              {Object.entries(dry.resource_peaks)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </div>
          )}
          {dry.failure_hotspots.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {dry.failure_hotspots.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground">{h.node_ref}</span>: {h.rationale}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function deriveIssueByNodeRef(
  report: VerificationReport | null | undefined,
): Record<string, "warning" | "error"> {
  const out: Record<string, "warning" | "error"> = {};
  if (!report) return out;
  for (const i of report.issues) {
    for (const ref of i.affected_node_refs ?? []) {
      const cur = out[ref];
      if (i.level === "error" || cur !== "error")
        out[ref] = (i.level === "info" ? "warning" : i.level) as
          | "warning"
          | "error";
    }
  }
  return out;
}
