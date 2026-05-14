import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useAdapterCatalog,
  useAdapters,
  useCreateAdapter,
  useDeleteAdapter,
  useDisableAdapter,
  useEnableAdapter,
  useProbeAdapter,
  type AdapterInput,
  type AdapterInstance,
  type CatalogEntry,
} from "../api/adapters";
import { ProbeBadge, relTime } from "../components/adapters/ProbeBadge";
import { InstanceModal } from "../components/adapters/InstanceModal";

export default function Adapters() {
  const { data: catalog, isLoading: catLoading } = useAdapterCatalog();
  const { data: instances, isLoading: instLoading } = useAdapters();
  const create = useCreateAdapter();
  const enable = useEnableAdapter();
  const disable = useDisableAdapter();
  const probe = useProbeAdapter();
  const del = useDeleteAdapter();

  const [modal, setModal] = useState<
    | { mode: "create-from-catalog"; entry: CatalogEntry }
    | { mode: "create-custom" }
    | null
  >(null);

  const byCatalog = useMemo(() => {
    const map = new Map<string, AdapterInstance>();
    for (const inst of instances ?? []) {
      if (inst.catalog_id) map.set(inst.catalog_id, inst);
    }
    return map;
  }, [instances]);

  const customInstances = useMemo(
    () => (instances ?? []).filter((i) => !i.catalog_id),
    [instances],
  );

  const acting = (name: string) =>
    (enable.isPending && enable.variables === name) ||
    (disable.isPending && disable.variables === name) ||
    (probe.isPending && probe.variables === name) ||
    (del.isPending && del.variables === name);

  async function onToggle(inst: AdapterInstance) {
    if (inst.read_only) return;
    if (inst.live) {
      await disable.mutateAsync(inst.name);
    } else {
      await enable.mutateAsync(inst.name);
    }
  }

  async function onCatalogEnable(entry: CatalogEntry) {
    // If we already have an instance for this catalog id, just enable it.
    const existing = byCatalog.get(entry.id);
    if (existing) {
      try {
        await enable.mutateAsync(existing.name);
      } catch {
        /* fall through to modal so user can fix */
        setModal({ mode: "create-from-catalog", entry });
      }
      return;
    }
    setModal({ mode: "create-from-catalog", entry });
  }

  async function onCreateSubmit(input: AdapterInput) {
    await create.mutateAsync(input);
    // Best-effort: also enable so the toggle settles to "on" in one step.
    try {
      await enable.mutateAsync(input.name);
    } catch {
      /* leave disabled if probe failed; UI will surface status */
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Adapters</h1>
          <Link to="/" className="text-xs text-slate-500 hover:underline">
            ← back to projects
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Configure which agent runners are available to your workflows. ACP
          adapters speak the Zed Agent Client Protocol over child-process stdio.
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Catalog
        </h2>
        {catLoading && <p className="text-sm text-slate-500">loading…</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(catalog ?? []).map((entry) => {
            const inst = byCatalog.get(entry.id);
            return (
              <article
                key={entry.id}
                className="flex flex-col gap-2 rounded-md border bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{entry.label}</h3>
                    <p className="text-xs text-slate-600">{entry.description}</p>
                    {entry.defaultCommand && (
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        ${entry.defaultCommand}
                        {entry.defaultArgs?.length
                          ? " " + entry.defaultArgs.join(" ")
                          : ""}
                      </p>
                    )}
                  </div>
                  <Toggle
                    checked={!!inst?.live}
                    disabled={acting(inst?.name ?? "") || enable.isPending}
                    onClick={() => {
                      if (inst) onToggle(inst);
                      else onCatalogEnable(entry);
                    }}
                  />
                </div>
                {inst && (
                  <div className="flex items-center gap-2 border-t pt-2 text-[11px] text-slate-500">
                    <ProbeBadge status={inst.status} detail={inst.status_detail} />
                    <span className="font-mono">{inst.name}</span>
                    <span className="ml-auto text-slate-400">
                      probed {relTime(inst.last_probed_at)}
                    </span>
                  </div>
                )}
                {inst?.status === "error" && inst.status_detail && (
                  <pre className="max-h-24 overflow-auto rounded bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
                    {inst.status_detail}
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Custom & registered instances
          </h2>
          <button
            onClick={() => setModal({ mode: "create-custom" })}
            className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800"
          >
            + Add custom
          </button>
        </div>
        {instLoading && <p className="text-sm text-slate-500">loading…</p>}
        <table className="w-full overflow-hidden rounded-md border bg-white text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Command</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Probed</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(instances ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                  no instances yet
                </td>
              </tr>
            )}
            {(instances ?? []).map((inst) => (
              <tr key={inst.name} className="border-t">
                <td className="px-3 py-2 font-mono">{inst.name}</td>
                <td className="px-3 py-2 text-slate-600">
                  {inst.read_only
                    ? inst.status_detail ?? "builtin"
                    : inst.catalog_id ?? "custom"}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-600">
                  {inst.command
                    ? `${inst.command} ${(inst.args ?? []).join(" ")}`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <ProbeBadge status={inst.status} detail={inst.status_detail} />
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {relTime(inst.last_probed_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {!inst.read_only && (
                      <>
                        <button
                          disabled={acting(inst.name)}
                          onClick={() => probe.mutate(inst.name)}
                          className="rounded border px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Probe
                        </button>
                        <button
                          disabled={acting(inst.name)}
                          onClick={() => onToggle(inst)}
                          className="rounded border px-2 py-0.5 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {inst.live ? "Disable" : "Enable"}
                        </button>
                        <button
                          disabled={acting(inst.name)}
                          onClick={() => {
                            if (confirm(`Delete adapter '${inst.name}'?`))
                              del.mutate(inst.name);
                          }}
                          className="rounded border border-rose-200 px-2 py-0.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {inst.read_only && (
                      <span className="text-[10px] text-slate-400">read-only</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modal?.mode === "create-from-catalog" && (
        <InstanceModal
          catalogEntry={modal.entry}
          title={`Enable ${modal.entry.label}`}
          submitLabel="Probe & Enable"
          takenNames={(instances ?? []).map((i) => i.name)}
          onSubmit={onCreateSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "create-custom" && (
        <InstanceModal
          title="Add custom adapter"
          submitLabel="Probe & Enable"
          takenNames={(instances ?? []).map((i) => i.name)}
          onSubmit={onCreateSubmit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? "bg-emerald-500" : "bg-slate-300"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
