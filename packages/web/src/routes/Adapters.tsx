import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useAdapterCatalog,
  useAdapters,
  useCreateAdapter,
  useDeleteAdapter,
  useDisableAdapter,
  useEnableAdapter,
  usePatchAdapter,
  useProbeAdapter,
  type AdapterInput,
  type AdapterInstance,
  type CatalogCategory,
  type CatalogEntry,
} from "../api/adapters";
import { ProbeBadge, useRelTime } from "../components/adapters/ProbeBadge";
import { InstanceModal } from "../components/adapters/InstanceModal";
import { Button } from "../components/ui/button";
import { Section } from "../components/section";
import { cn } from "../lib/utils";

export default function Adapters() {
  const { t } = useTranslation("adapters");
  const { t: tc } = useTranslation("common");
  const { t: tn } = useTranslation("nav");
  const relTime = useRelTime();
  const { data: catalog, isLoading: catLoading } = useAdapterCatalog();
  const { data: instances, isLoading: instLoading } = useAdapters();
  const create = useCreateAdapter();
  const patch = usePatchAdapter();
  const enable = useEnableAdapter();
  const disable = useDisableAdapter();
  const probe = useProbeAdapter();
  const del = useDeleteAdapter();

  const [modal, setModal] = useState<
    | { mode: "create-from-catalog"; entry: CatalogEntry }
    | { mode: "create-custom" }
    | { mode: "edit"; instance: AdapterInstance }
    | null
  >(null);

  const byCatalog = useMemo(() => {
    const map = new Map<string, AdapterInstance>();
    for (const inst of instances ?? []) {
      if (inst.catalog_id) map.set(inst.catalog_id, inst);
    }
    return map;
  }, [instances]);

  const iconByCatalog = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of catalog ?? []) {
      if (entry.icon) map.set(entry.id, entry.icon);
    }
    return map;
  }, [catalog]);

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

  async function onEditSubmit(instance: AdapterInstance, input: AdapterInput) {
    await patch.mutateAsync({
      name: instance.name,
      patch: {
        command: input.command,
        args: input.args,
        env: input.env,
        default_cwd: input.default_cwd,
      },
    });
    // Re-probe so the status badge reflects the new command/env immediately.
    // Swallow probe failure — the row already surfaces it via status_detail.
    try {
      await probe.mutateAsync(instance.name);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-5xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="03"
        eyebrow={t("eyebrow")}
        title={
          <>
            {t("title")}{" "}
            <span className="italic text-accent">{t("title_accent")}</span>
          </>
        }
        subtitle={t("subtitle")}
        actions={
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {tn("back_to_projects")}
          </Link>
        }
      />

      <section className="space-y-6">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("catalog_section")}
        </h2>
        {catLoading && (
          <p className="font-mono text-xs text-muted-foreground">{tc("loading")}</p>
        )}
        {renderCategoryGroups(catalog ?? [], (entry) => {
            const inst = byCatalog.get(entry.id);
            return (
              <article
                key={entry.id}
                className="flex flex-col gap-3 border border-border bg-card p-5 transition-colors hover:border-accent/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {entry.icon && (
                      <img
                        src={entry.icon}
                        alt=""
                        loading="lazy"
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-sm bg-muted/30 object-contain p-1"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
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
                      {t("table.probed")} {relTime(inst.last_probed_at)}
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
          }, t)}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t("instances_section")}
          </h2>
          <Button size="sm" onClick={() => setModal({ mode: "create-custom" })}>
            {t("add_custom")}
          </Button>
        </div>
        {instLoading && (
          <p className="font-mono text-xs text-muted-foreground">{tc("loading")}</p>
        )}
        <table className="w-full border-y border-border text-xs">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tc("name")}
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("table.source")}
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("table.command")}
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tc("status")}
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("table.probed")}
              </th>
              <th className="px-4 py-2.5 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tc("actions")}
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
                  {t("empty_instances")}
                </td>
              </tr>
            )}
            {(instances ?? []).map((inst) => (
              <tr key={inst.name} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    {inst.catalog_id && iconByCatalog.get(inst.catalog_id) && (
                      <img
                        src={iconByCatalog.get(inst.catalog_id)!}
                        alt=""
                        loading="lazy"
                        className="h-5 w-5 shrink-0 object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                    <span>{inst.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {inst.read_only
                    ? inst.status_detail ?? t("builtin")
                    : inst.catalog_id ?? t("custom")}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                  {inst.command
                    ? `${inst.command} ${(inst.args ?? []).join(" ")}`
                    : t("no_command")}
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
                          onClick={() => setModal({ mode: "edit", instance: inst })}
                        >
                          {t("edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={acting(inst.name)}
                          onClick={() => probe.mutate(inst.name)}
                        >
                          {t("probe")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={acting(inst.name)}
                          onClick={() => onToggle(inst)}
                        >
                          {inst.live ? t("disable") : t("enable")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                          disabled={acting(inst.name)}
                          onClick={() => {
                            if (confirm(t("delete_confirm", { name: inst.name })))
                              del.mutate(inst.name);
                          }}
                        >
                          {tc("delete")}
                        </Button>
                      </>
                    )}
                    {inst.read_only && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {t("read_only")}
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
          title={`${t("enable")} ${modal.entry.label}`}
          submitLabel={`${t("probe")} & ${t("enable")}`}
          takenNames={(instances ?? []).map((i) => i.name)}
          onSubmit={onCreateSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "create-custom" && (
        <InstanceModal
          title={t("add_custom")}
          submitLabel={`${t("probe")} & ${t("enable")}`}
          takenNames={(instances ?? []).map((i) => i.name)}
          onSubmit={onCreateSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.mode === "edit" && (
        <InstanceModal
          mode="edit"
          initial={{
            name: modal.instance.name,
            catalog_id: modal.instance.catalog_id,
            kind: "spawn",
            command: modal.instance.command ?? "",
            args: modal.instance.args ?? [],
            env: modal.instance.env ?? {},
            default_cwd: modal.instance.default_cwd,
          }}
          title={`${t("edit")} · ${modal.instance.name}`}
          submitLabel={tc("save")}
          onSubmit={(input) => onEditSubmit(modal.instance, input)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const CATEGORY_ORDER: CatalogCategory[] = ["acp", "other"];

const CATEGORY_META: Record<
  CatalogCategory,
  { index: string; href?: string }
> = {
  acp: { index: "01", href: "https://agentclientprotocol.com" },
  other: { index: "02" },
};

function renderCategoryGroups(
  entries: CatalogEntry[],
  renderCard: (entry: CatalogEntry) => ReactNode,
  t: (key: string) => string,
) {
  const byCat = new Map<CatalogCategory, CatalogEntry[]>();
  for (const e of entries) {
    const c = e.category ?? "other";
    const bucket = byCat.get(c) ?? [];
    bucket.push(e);
    byCat.set(c, bucket);
  }
  const groups = CATEGORY_ORDER.filter((c) => byCat.has(c));
  return (
    <div className="space-y-10">
      {groups.map((cat) => {
        const items = byCat.get(cat)!;
        const meta = CATEGORY_META[cat];
        const isAcp = cat === "acp";
        return (
          <div key={cat} className="space-y-4">
            <div className="flex items-baseline gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>
                {meta.index} / {t(`category.${cat}.eyebrow`)}
              </span>
              <span
                className={cn(
                  "h-px flex-1",
                  isAcp ? "bg-accent/40" : "bg-border",
                )}
              />
              <span>
                {items.length.toString().padStart(2, "0")}{" "}
                {t("category.count_unit")}
              </span>
              {meta.href && (
                <a
                  href={meta.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
                >
                  {t("category.acp.learn_more")} ↗
                </a>
              )}
            </div>
            <div className="flex items-end justify-between gap-6">
              <h3
                className={cn(
                  "font-display text-2xl font-normal tracking-tight",
                  isAcp && "text-foreground",
                )}
              >
                {t(`category.${cat}.label`)}
                {isAcp && (
                  <span className="ml-2 align-middle text-xs italic text-accent">
                    — {t("category.acp.title_accent")}
                  </span>
                )}
              </h3>
              <p className="hidden max-w-md text-right text-xs text-muted-foreground sm:block">
                {t(`category.${cat}.hint`)}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map(renderCard)}
            </div>
          </div>
        );
      })}
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
