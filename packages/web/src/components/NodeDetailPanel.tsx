import type { WorkflowNode } from "@petrify/shared";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function NodeDetailPanel({
  node,
  onClose,
}: {
  node: WorkflowNode;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full flex-col border-l bg-white">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <div className="text-sm font-semibold">{node.title}</div>
          <div className="text-[11px] text-slate-500">{node.ref}</div>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto px-3 py-3">
        <Field label="Adapter">
          {node.adapter.name}
          {node.adapter.version ? ` @ ${node.adapter.version}` : ""}
        </Field>
        <Field label="Dependencies">
          {node.dependencies.length === 0 ? (
            <span className="text-slate-400">(root)</span>
          ) : (
            <ul className="list-disc pl-4">
              {node.dependencies.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="Inputs">
          <Json value={node.inputs} />
        </Field>
        <Field label="Outputs">
          <Json value={node.outputs} />
        </Field>
        {node.prompt && (
          <Field label="Prompt">
            <Json value={node.prompt} />
          </Field>
        )}
        {(node.resources?.length ?? 0) > 0 && (
          <Field label="Resources (declared, M1 ignored)">
            <Json value={node.resources} />
          </Field>
        )}
        {node.condition && <Field label="Condition (M3)">{node.condition}</Field>}
        {node.loop && (
          <Field label="Loop (M3)">
            <Json value={node.loop} />
          </Field>
        )}
        <Field label="Runtime">
          <Json value={node.runtime} />
        </Field>
        <Field label="On failure">
          <Json value={node.on_failure} />
        </Field>
      </div>
    </aside>
  );
}
