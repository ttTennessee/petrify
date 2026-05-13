import { useEffect, useMemo, useRef, useState } from "react";
import type { RuntimeEvent } from "@petrify/shared";
import { useWorkflowStore } from "../store/workflow";

// One card per node. text_delta events accumulate into a single growing stream
// block regardless of interleaving with other nodes; sub-events stay on a
// per-node timeline. Cards auto-collapse once the node reaches a terminal
// state unless the user manually toggled them.

const NODE_STATUS_CHIP: Record<string, string> = {
  running: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  skipped: "bg-amber-100 text-amber-800",
  pending: "bg-slate-100 text-slate-600",
};

interface NodeBucket {
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

export function EventStream() {
  const events = useWorkflowStore((s) => s.events);
  const graph = useWorkflowStore((s) => s.graph);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const refByNodeId = useMemo(() => {
    const m: Record<string, { ref: string; title: string }> = {};
    if (graph) for (const n of graph.nodes) m[n.id] = { ref: n.ref, title: n.title };
    return m;
  }, [graph]);

  const { buckets, globals } = useMemo(() => {
    const bMap = new Map<string, NodeBucket>();
    const g: RuntimeEvent[] = [];
    for (const ev of events) {
      const nid = ev.node_id;
      if (!nid) {
        g.push(ev);
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
    return { buckets, globals: g };
  }, [events, refByNodeId]);

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
      <div className="flex h-full flex-col border-l bg-white">
        <Header />
        <p className="px-3 py-2 text-xs text-slate-400">no events yet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l bg-white">
      <Header />
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto px-3 py-2">
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
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                global
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

function Header() {
  return (
    <header className="border-b px-3 py-2 text-sm font-medium">Event Stream</header>
  );
}

function NodeCard({
  bucket,
  expanded,
  onToggle,
}: {
  bucket: NodeBucket;
  expanded: boolean;
  onToggle: () => void;
}) {
  const chip = NODE_STATUS_CHIP[bucket.status] ?? NODE_STATUS_CHIP.pending!;
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
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-left hover:bg-slate-100"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip}`}>
            {bucket.status}
          </span>
          <span className="truncate font-mono text-[11px] text-slate-700">
            {bucket.ref}
          </span>
          {bucket.title && (
            <span className="truncate text-[11px] text-slate-500">{bucket.title}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] text-slate-400">
          {elapsed && <span>{elapsed}</span>}
          <span>{new Date(bucket.firstTs).toLocaleTimeString()}</span>
        </div>
      </button>
      {!expanded && summary && (
        <div className="truncate px-2 py-1 text-[11px] text-slate-600">{summary}</div>
      )}
      {expanded && (
        <div className="space-y-1.5 px-2 py-2">
          {bucket.subEvents.map((ev) => (
            <EventRow key={ev.event_id} ev={ev} nodeRef={bucket.ref} hideOutputText />
          ))}
          {bucket.thoughtText && (
            <details className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5" open>
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-slate-500">
                thinking · {bucket.thoughtText.length} chars
              </summary>
              <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] italic text-slate-600">
                {bucket.thoughtText}
              </pre>
            </details>
          )}
          {bucket.streamText && (
            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5">
              <div className="mb-0.5 flex justify-between text-[10px] text-sky-700">
                <span className="font-mono">agent · text</span>
                <span>{new Date(bucket.lastTs).toLocaleTimeString()}</span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs text-slate-800">
                {bucket.streamText}
              </pre>
            </div>
          )}
          {!bucket.streamText && bucket.outputText && (
            <div className="rounded border border-emerald-200 bg-emerald-50/60 px-2 py-1.5">
              <pre className="whitespace-pre-wrap break-words text-xs text-slate-800">
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

const TYPE_CHIP: Record<string, string> = {
  NodeStarted: "bg-slate-100 text-slate-700",
  NodeCompleted: "bg-emerald-100 text-emerald-800",
  NodeFailed: "bg-rose-100 text-rose-800",
  NodeSkipped: "bg-amber-100 text-amber-800",
  ToolCalled: "bg-indigo-50 text-indigo-700",
  OutputGenerated: "bg-emerald-50 text-emerald-800",
  CheckpointSaved: "bg-slate-50 text-slate-600",
  RetryTriggered: "bg-amber-50 text-amber-800",
  ResourceAcquired: "bg-slate-50 text-slate-600",
  ResourceReleased: "bg-slate-50 text-slate-600",
};

function EventRow({
  ev,
  nodeRef,
  hideOutputText,
}: {
  ev: RuntimeEvent;
  nodeRef: string;
  hideOutputText?: boolean;
}) {
  const chip = TYPE_CHIP[ev.type] ?? "bg-slate-100 text-slate-700";
  return (
    <div className="rounded border border-slate-200 px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip}`}>
            {ev.type}
          </span>
          <span className="font-mono text-[10px] text-slate-500">{nodeRef}</span>
        </div>
        <span className="text-[10px] text-slate-400">
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
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case "NodeStarted":
      return (
        <p className="mt-0.5 text-xs text-slate-600">
          {(p.title as string) ?? (p.ref as string) ?? ""}
          {p.attempt ? (
            <span className="ml-2 text-slate-400">attempt #{String(p.attempt)}</span>
          ) : null}
        </p>
      );
    case "ToolCalled": {
      const kind = (p.kind as string) ?? "tool";
      const label = (p.label as string) ?? (p.tool as string) ?? "";
      const status = p.status ? ` · ${String(p.status)}` : "";
      return (
        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-700">
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
          <p className="mt-0.5 text-[10px] text-emerald-700">
            stop_reason: {out.stop_reason}
          </p>
        ) : null;
      }
      if (out.text) {
        return (
          <div className="mt-1 rounded bg-emerald-50/60 px-2 py-1 text-xs text-slate-800">
            <pre className="whitespace-pre-wrap break-words">{out.text}</pre>
            {out.stop_reason && (
              <div className="mt-0.5 text-[10px] text-emerald-700">
                stop_reason: {out.stop_reason}
              </div>
            )}
          </div>
        );
      }
      return (
        <pre className="mt-0.5 max-h-40 overflow-auto text-[10px] text-slate-600">
          {JSON.stringify(p.output, null, 2)}
        </pre>
      );
    }
    case "NodeFailed":
      return (
        <p className="mt-0.5 text-xs text-rose-700">{(p.reason as string) ?? "failed"}</p>
      );
    case "CheckpointSaved":
      return (
        <p className="mt-0.5 text-[10px] text-slate-500">
          ckpt {(p.checkpoint_id as string)?.slice(0, 8) ?? ""}
        </p>
      );
    default:
      return null;
  }
}

