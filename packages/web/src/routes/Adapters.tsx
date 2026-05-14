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
import { Button } from "../components/ui/button";
import { Section } from "../components/section";
import { cn } from "../lib/utils";

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
    const existing = byCatalog.get(entry.id);
    if (existing) {
      try {
        await enable.mutateAsync(existing.name);
      } catch {
        setModal({ mode: "create-from-catalog", entry });
      }
      return;
    }
    setModal({ mode: "create-from-catalog", entry });
  }

  async function onCreateSubmit(input: AdapterInput) {
    await create.mutateAsync(input);
    try {
      await enable.mutateAsync(input.name);
    } catch {
      /* leave disabled if probe failed */
    }
  }

  return (
    <div className="mx-auto max-w-5xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="03"
        eyebrow="Adapters"
        title={
          <>
            Agent{" "}
            <span className="italic text-accent">runners.</span>
          </>
        }
        subtitle="Configure which agent runners are available to your workflows. ACP adapters speak the Zed Agent Client Protocol over child-process stdio."
        actions={
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← Projects
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          § Catalog
        </h2>
        {catLoading && (
          <p className="font-mono text-xs text-muted-foreground">loading…</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(catalog ?? []).map((entry) => {
            const inst = byCatalog.get(entry.id);
            return (
              <article
                key={entry.id}
                className="flex flex-col gap-3 border border-border bg-card p-5 transition-colors hover:border-accent/60"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-base">{entry.label}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                    {entry.defaultCommand && (
                      <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                        $ {entry.defaultCommand}
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
                  <div className="flex items-center gap-2 border-t border-border pt-2.5 font-mono text-[11px] text-muted-foreground">
                    <ProbeBadge status={inst.status} detail={inst.status_detail} />
                    <span>{inst.name}</span>
                    <span className="ml-auto opacity-70">
                      probed {relTime(inst.last_probed_at)}
                    </span>
                  </div>
                )}
                {inst?.status === "error" && inst.status_detail && (
                  <pre className="max-h-24 overflow-auto border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
                    {inst.status_detail}
                  </pre>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            § Custom & registered instances
          </h2>
          <Button size="sm" onClick={() => setModal({ mode: "create-custom" })}>
            + Add custom
          </Button>
        </div>
        {instLoading && (
          <p className="font-mono text-xs text-muted-foreground">loading…</p>
        )}
        <table className="w-full border-y border-border text-xs">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Source
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Command
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Probed
              </th>
              <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {(instances ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center font-mono text-xs text-muted-foreground"
                >
                  no instances yet
                </td>
              </tr>
            )}
            {(instances ?? []).map((inst) => (
              <tr key={inst.name} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs">{inst.name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {inst.read_only
                    ? inst.status_detail ?? "builtin"
                    : inst.catalog_id ?? "custom"}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                  {inst.command
                    ? `${inst.command} ${(inst.args ?? []).join(" ")}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <ProbeBadge status={inst.status} detail={inst.status_detail} />
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {relTime(inst.last_probed_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {!inst.read_only && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={acting(inst.name)}
                          onClick={() => probe.mutate(inst.name)}
                        >
                          Probe
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={acting(inst.name)}
                          onClick={() => onToggle(inst)}
                        >
                          {inst.live ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                          disabled={acting(inst.name)}
                          onClick={() => {
                            if (confirm(`Delete adapter '${inst.name}'?`))
                              del.mutate(inst.name);
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                    {inst.read_only && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        read-only
                      </span>
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
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        checked ? "bg-success" : "bg-muted-foreground/30",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          checked ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}
