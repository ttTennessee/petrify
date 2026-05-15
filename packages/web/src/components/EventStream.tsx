import { useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeEvent } from "@petrify/shared";
import { useTranslation } from "react-i18next";
import { useWorkflowStore } from "../store/workflow";
import { Badge } from "./ui/badge";

type BadgeVariant = "accent" | "success" | "destructive" | "warning" | "outline" | "default";

export interface NodeBucket {
  nodeId: string;
  ref: string;
  title: string | null;
  firstTs: number;
  lastTs: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  streamText: string;
  thoughtText: string;
  subEvents: RuntimeEvent[];
  outputText: string | null;
  failReason: string | null;
}

function nodeStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "running": return "accent";
    case "completed": return "success";
    case "failed": return "destructive";
    case "skipped": return "warning";
    default: return "outline";
  }
}

function typeVariant(type: string): BadgeVariant {
  switch (type) {
    case "NodeCompleted": return "success";
    case "NodeFailed": return "destructive";
    case "NodeSkipped": return "warning";
    case "ToolCalled": return "accent";
    case "OutputGenerated": return "success";
    default: return "outline";
  }
}

export function buildBuckets(
  events: RuntimeEvent[],
  refByNodeId: Record<string, { ref: string; title: string }>,
): { buckets: NodeBucket[]; globals: RuntimeEvent[] } {
  const bMap = new Map<string, NodeBucket>();
  const globals: RuntimeEvent[] = [];
  for (const ev of events) {
    const nid = ev.node_id;
    if (!nid) {
      globals.push(ev);
      continue;
    }
    let b = bMap.get(nid);
    if (!b) {
      const meta = refByNodeId[nid];
      b = {
        nodeId: nid,
        ref: meta?.ref ?? nid,
        title: meta?.title ?? null,
        firstTs: ev.timestamp,
        lastTs: ev.timestamp,
        status: "pending",
        streamText: "",
        thoughtText: "",
        subEvents: [],
        outputText: null,
        failReason: null,
      };
      bMap.set(nid, b);
    }
    b.lastTs = Math.max(b.lastTs, ev.timestamp);
    const p = ev.payload as Record<string, unknown>;
    const kind =
      ev.type === "ToolCalled" ? (p.kind as string | undefined) : undefined;
    if (kind === "text_delta") {
      b.streamText += String(p.delta ?? "");
    } else if (kind === "thought_delta") {
      b.thoughtText += String(p.delta ?? "");
    } else {
      b.subEvents.push(ev);
    }
    switch (ev.type) {
      case "NodeStarted":
        if (b.status === "pending") b.status = "running";
        break;
      case "NodeCompleted":
        b.status = "completed";
        break;
      case "NodeFailed":
        b.status = "failed";
        b.failReason = (p.reason as string) ?? null;
        break;
      case "NodeSkipped":
        b.status = "skipped";
        break;
      case "OutputGenerated": {
        const out = (p.output as { text?: string }) ?? {};
        if (out.text) b.outputText = out.text;
        break;
      }
    }
  }
  const buckets = Array.from(bMap.values()).sort((a, b) => a.firstTs - b.firstTs);
  return { buckets, globals };
}

export function EventStream() {
  const { t } = useTranslation("workflow");
  const events = useWorkflowStore((s) => s.events);
  const graph = useWorkflowStore((s) => s.graph);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const refByNodeId = useMemo(() => {
    const m: Record<string, { ref: string; title: string }> = {};
    if (graph) for (const n of graph.nodes) m[n.id] = { ref: n.ref, title: n.title };
    return m;
  }, [graph]);

  const { buckets, globals } = useMemo(
    () => buildBuckets(events, refByNodeId),
    [events, refByNodeId],
  );

  const lastNodeCount = useRef(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const grewByNode = buckets.length > lastNodeCount.current;
    lastNodeCount.current = buckets.length;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200 || grewByNode;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [buckets, globals]);

  if (buckets.length === 0 && globals.length === 0) {
    return (
      <div className="flex h-full flex-col border-l border-border bg-card">
        <StreamHeader count={0} />
        <p className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
          {t("events.no_events")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <StreamHeader count={events.length} />
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <ul className="space-y-2">
          {buckets.map((b) => {
            const isTerminal = b.status !== "pending" && b.status !== "running";
            const expanded = override[b.nodeId] ?? !isTerminal;
            return (
              <li key={b.nodeId}>
                <NodeCard
                  bucket={b}
                  expanded={expanded}
                  onToggle={() =>
                    setOverride((o) => ({ ...o, [b.nodeId]: !expanded }))
                  }
                />
              </li>
            );
          })}
          {globals.length > 0 && (
            <li className="pt-1">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("events.global")}
              </div>
              <ul className="space-y-1">
                {globals.map((ev) => (
                  <li key={ev.event_id}>
                    <EventRow ev={ev} nodeRef="-" />
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function StreamHeader({ count }: { count: number }) {
  const { t } = useTranslation("workflow");
  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("events.title")}
      </span>
      {count > 0 && (
        <Badge variant="outline">{count}</Badge>
      )}
    </header>
  );
}

export function NodeCard({
  bucket,
  expanded,
  onToggle,
}: {
  bucket: NodeBucket;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("workflow");
  const elapsed =
    bucket.status !== "pending" && bucket.status !== "running"
      ? `${((bucket.lastTs - bucket.firstTs) / 1000).toFixed(1)}s`
      : null;
  const summary =
    bucket.failReason ??
    (bucket.streamText
      ? firstLine(bucket.streamText)
      : bucket.outputText
      ? firstLine(bucket.outputText)
      : null);

  return (
    <div className="border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {expanded ? "▾" : "▸"}
          </span>
          <Badge variant={nodeStatusVariant(bucket.status)} dot>
            {bucket.status}
          </Badge>
          <span className="truncate font-mono text-[11px] text-foreground">
            {bucket.ref}
          </span>
          {bucket.title && (
            <span className="truncate text-[11px] text-muted-foreground">
              {bucket.title}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] text-muted-foreground">
          {elapsed && <span>{elapsed}</span>}
          <span>{new Date(bucket.firstTs).toLocaleTimeString()}</span>
        </div>
      </button>
      {!expanded && summary && (
        <div className="truncate px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          {summary}
        </div>
      )}
      {expanded && (
        <div className="space-y-1.5 px-3 py-2">
          {bucket.subEvents.map((ev) => (
            <EventRow key={ev.event_id} ev={ev} nodeRef={bucket.ref} hideOutputText />
          ))}
          {bucket.thoughtText && (
            <details className="border-l-2 border-l-muted-foreground/40 pl-3 py-1">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted-foreground select-none">
                {t("events.thinking")}{bucket.thoughtText.length}{t("events.chars")}
              </summary>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] italic text-muted-foreground">
                {bucket.thoughtText}
              </pre>
            </details>
          )}
          {bucket.streamText && (
            <div className="border-l-2 border-l-accent pl-3 py-1">
              <div className="mb-0.5 flex justify-between font-mono text-[10px] text-accent">
                <span>{t("events.agent_text")}</span>
                <span className="text-muted-foreground">
                  {new Date(bucket.lastTs).toLocaleTimeString()}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/90">
                {bucket.streamText}
              </pre>
            </div>
          )}
          {!bucket.streamText && bucket.outputText && (
            <div className="border-l-2 border-l-success pl-3 py-1">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/90">
                {bucket.outputText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function firstLine(s: string): string {
  const i = s.indexOf("\n");
  const line = (i === -1 ? s : s.slice(0, i)).trim();
  return line.length > 120 ? line.slice(0, 120) + "…" : line;
}

function EventRow({
  ev,
  nodeRef,
  hideOutputText,
}: {
  ev: RuntimeEvent;
  nodeRef: string;
  hideOutputText?: boolean;
}) {
  return (
    <div className="border border-border px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={typeVariant(ev.type)}>{ev.type}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">{nodeRef}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(ev.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <EventBody ev={ev} hideOutputText={hideOutputText} />
    </div>
  );
}

function EventBody({
  ev,
  hideOutputText,
}: {
  ev: RuntimeEvent;
  hideOutputText?: boolean;
}) {
  const { t } = useTranslation("workflow");
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case "NodeStarted":
      return (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {(p.title as string) ?? (p.ref as string) ?? ""}
          {p.attempt ? (
            <span className="ml-2 opacity-60">{t("events.attempt")}{String(p.attempt)}</span>
          ) : null}
        </p>
      );
    case "ToolCalled": {
      const kind = (p.kind as string) ?? "tool";
      const label = (p.label as string) ?? (p.tool as string) ?? "";
      const status = p.status ? ` · ${String(p.status)}` : "";
      return (
        <p className="mt-0.5 truncate font-mono text-[10px] text-foreground/80">
          {kind}
          {label ? `: ${label}` : ""}
          {status}
        </p>
      );
    }
    case "OutputGenerated": {
      const out = (p.output as { text?: string; stop_reason?: string }) ?? {};
      if (hideOutputText) {
        return out.stop_reason ? (
          <p className="mt-0.5 font-mono text-[10px] text-success">
            {t("events.stop_reason")}{out.stop_reason}
          </p>
        ) : null;
      }
      if (out.text) {
        return (
          <div className="mt-1 border-l-2 border-l-success pl-2">
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-foreground/80">
              {out.text}
            </pre>
            {out.stop_reason && (
              <div className="mt-0.5 font-mono text-[10px] text-success">
                {t("events.stop_reason")}{out.stop_reason}
              </div>
            )}
          </div>
        );
      }
      return (
        <pre className="mt-0.5 max-h-40 overflow-auto font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(p.output, null, 2)}
        </pre>
      );
    }
    case "NodeFailed":
      return (
        <p className="mt-0.5 font-mono text-[10px] text-destructive">
          {(p.reason as string) ?? t("events.failed")}
        </p>
      );
    case "CheckpointSaved":
      return (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {t("events.checkpoint_prefix")}{(p.checkpoint_id as string)?.slice(0, 8) ?? ""}
        </p>
      );
    default:
      return null;
  }
}
