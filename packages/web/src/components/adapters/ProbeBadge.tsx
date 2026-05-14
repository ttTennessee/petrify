import type { AdapterInstance } from "../../api/adapters";

export function ProbeBadge({ status, detail }: { status: AdapterInstance["status"]; detail?: string | null }) {
  const map: Record<AdapterInstance["status"], string> = {
    ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
    error: "bg-rose-100 text-rose-800 border-rose-200",
    unknown: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const label: Record<AdapterInstance["status"], string> = {
    ok: "healthy",
    error: "error",
    unknown: "not probed",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${map[status]}`}
      title={detail ?? undefined}
    >
      {label[status]}
    </span>
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
