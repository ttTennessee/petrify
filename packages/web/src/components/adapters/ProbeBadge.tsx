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

const statusLabel: Record<AdapterInstance["status"], string> = {
  ok: "healthy",
  error: "error",
  unknown: "not probed",
};

export function ProbeBadge({ status, detail }: { status: AdapterInstance["status"]; detail?: string | null }) {
  return (
    <Badge variant={statusVariant(status)} dot title={detail ?? undefined}>
      {statusLabel[status]}
    </Badge>
  );
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
