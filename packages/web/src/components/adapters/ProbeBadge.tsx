import { useTranslation } from "react-i18next";
import type { AdapterInstance } from "../../api/adapters";
import { Badge } from "../ui/badge";

type BadgeVariant = "success" | "destructive" | "outline";

function statusVariant(status: AdapterInstance["status"]): BadgeVariant {
  switch (status) {
    case "ok": return "success";
    case "error": return "destructive";
    default: return "outline";
  }
}

export function ProbeBadge({ status, detail }: { status: AdapterInstance["status"]; detail?: string | null }) {
  const { t } = useTranslation("adapters");
  const statusLabel: Record<AdapterInstance["status"], string> = {
    ok: t("probe_badge.healthy"),
    error: t("probe_badge.error"),
    unknown: t("probe_badge.not_probed"),
  };
  return (
    <Badge variant={statusVariant(status)} dot title={detail ?? undefined}>
      {statusLabel[status]}
    </Badge>
  );
}

export function useRelTime() {
  const { t } = useTranslation("adapters");
  return (ts: number | null): string => {
    if (!ts) return t("probe_badge.never");
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 5) return t("probe_badge.just_now");
    if (s < 60) return t("probe_badge.seconds_ago", { n: s });
    if (s < 3600) return t("probe_badge.minutes_ago", { n: Math.round(s / 60) });
    if (s < 86400) return t("probe_badge.hours_ago", { n: Math.round(s / 3600) });
    return new Date(ts).toLocaleString();
  };
}

export function relTime(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}
