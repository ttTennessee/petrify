import { useEffect, useMemo, useRef } from "react";
import type { RuntimeEvent } from "@petrify/shared";
import { useWorkflowStore } from "../store/workflow";

type Row =
  | { kind: "event"; ev: RuntimeEvent }
  | { kind: "stream"; nodeId: string | null; text: string; firstEv: RuntimeEvent; lastEv: RuntimeEvent };

export function EventStream() {
  const events = useWorkflowStore((s) => s.events);
  const graph = useWorkflowStore((s) => s.graph);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const refByNodeId = useMemo(() => {
    const m: Record<string, string> = {};
    if (graph) for (const n of graph.nodes) m[n.id] = n.ref;
    return m;
  }, [graph]);

  // Coalesce consecutive ToolCalled{kind:"text_delta"} from the same node into
  // a single growing "agent reply" bubble so the user sees streaming text.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const ev of events) {
      const isDelta =
        ev.type === "ToolCalled" &&
        (ev.payload as { kind?: string }).kind === "text_delta";
      if (isDelta) {
        const delta = String((ev.payload as { delta?: unknown }).delta ?? "");
        const tail = out[out.length - 1];
        if (tail && tail.kind === "stream" && tail.nodeId === ev.node_id) {
          tail.text += delta;
          tail.lastEv = ev;
          continue;
        }
        out.push({
          kind: "stream",
          nodeId: ev.node_id,
          text: delta,
          firstEv: ev,
          lastEv: ev,
        });
      } else {
        out.push({ kind: "event", ev });
      }
    }
    return out;
  }, [events]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows]);

  return (
    <div className="flex h-full flex-col border-l bg-white">
      <header className="border-b px-3 py-2 text-sm font-medium">
        Event Stream
      </header>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {rows.length === 0 && (
          <p className="text-xs text-slate-400">no events yet</p>
        )}
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i}>
              {row.kind === "stream" ? (
                <StreamBubble
                  text={row.text}
                  nodeRef={row.nodeId ? refByNodeId[row.nodeId] ?? row.nodeId : "-"}
                  timestamp={row.lastEv.timestamp}
                />
              ) : (
                <EventRow
                  ev={row.ev}
                  nodeRef={
                    row.ev.node_id ? refByNodeId[row.ev.node_id] ?? row.ev.node_id : "-"
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StreamBubble({
  text,
  nodeRef,
  timestamp,
}: {
  text: string;
  nodeRef: string;
  timestamp: number;
}) {
  return (
    <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5">
      <div className="mb-0.5 flex justify-between text-[10px] text-sky-700">
        <span className="font-mono">{nodeRef} · agent</span>
        <span>{new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-xs text-slate-800">
        {text}
      </pre>
    </div>
  );
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

function EventRow({ ev, nodeRef }: { ev: RuntimeEvent; nodeRef: string }) {
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
      <EventBody ev={ev} />
    </div>
  );
}

function EventBody({ ev }: { ev: RuntimeEvent }) {
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
