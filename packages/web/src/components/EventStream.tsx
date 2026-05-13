import { useWorkflowStore } from "../store/workflow";

export function EventStream() {
  const events = useWorkflowStore((s) => s.events);
  return (
    <div className="flex h-full flex-col border-l bg-white">
      <header className="border-b px-3 py-2 text-sm font-medium">Event Stream</header>
      <ol className="flex-1 overflow-auto px-3 py-2 text-xs">
        {events.length === 0 && <li className="text-slate-400">no events yet</li>}
        {events.map((ev) => (
          <li key={ev.event_id} className="border-b py-1 last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="font-mono">{ev.type}</span>
              <span className="text-slate-400">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-slate-500">node: {ev.node_id ?? "-"}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
