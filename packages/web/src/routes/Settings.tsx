import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useConfig, usePatchConfig } from "../api/config";
import { Section } from "../components/section";
import { cn } from "../lib/utils";

export default function Settings() {
  const { t } = useTranslation("settings");
  const { t: tn } = useTranslation("nav");
  const { data: config, isLoading } = useConfig();
  const patch = usePatchConfig();

  const autoRun = config?.auto_run ?? true;
  const permissionPolicy = config?.permission_default_policy ?? "ask";

  return (
    <div className="mx-auto max-w-3xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="04"
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

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("execution_section")}
        </h2>

        <div className="flex items-start justify-between gap-6 border border-border bg-card p-5">
          <div className="min-w-0">
            <h3 className="font-display text-base">{t("auto_run.label")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("auto_run.description")}
            </p>
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              {autoRun ? t("auto_run.on_hint") : t("auto_run.off_hint")}
            </p>
          </div>
          <Toggle
            checked={autoRun}
            disabled={isLoading || patch.isPending}
            onClick={() => patch.mutate({ auto_run: !autoRun })}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("permissions_section")}
        </h2>
        <div className="flex items-start justify-between gap-6 border border-border bg-card p-5">
          <div className="min-w-0">
            <h3 className="font-display text-base">
              {t("permission_default.label")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("permission_default.description_prefix")}
              <span className="font-mono">
                {t("permission_default.ask_label")}
              </span>
              {t("permission_default.ask_meaning")}
              <span className="font-mono">
                {t("permission_default.deny_label")}
              </span>
              {t("permission_default.deny_meaning")}
            </p>
          </div>
          <div className="flex shrink-0 border border-border">
            {(["ask", "deny-all"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={isLoading || patch.isPending}
                onClick={() =>
                  patch.mutate({ permission_default_policy: opt })
                }
                className={cn(
                  "font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 transition-colors",
                  permissionPolicy === opt
                    ? "bg-accent text-accent-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t("adapters_section")}
        </h2>
        <Link
          to="/adapters"
          className="flex items-center justify-between gap-4 border border-border bg-card p-5 transition-colors hover:border-accent/60"
        >
          <div className="min-w-0">
            <h3 className="font-display text-base">{t("adapters_link.label")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("adapters_link.description")}
            </p>
          </div>
          <span className="font-mono text-xs text-accent">→</span>
        </Link>
      </section>
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
