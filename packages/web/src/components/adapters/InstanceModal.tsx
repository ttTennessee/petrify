import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdapterInput, CatalogEntry } from "../../api/adapters";
import { ApiError } from "../../api/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

export interface InstanceModalProps {
  catalogEntry?: CatalogEntry;
  initial?: Partial<AdapterInput>;
  mode?: "create" | "edit";
  title: string;
  submitLabel: string;
  takenNames?: string[];
  onSubmit: (input: AdapterInput) => Promise<unknown>;
  onClose: () => void;
}

export function InstanceModal({
  catalogEntry,
  initial,
  mode: modeProp,
  title,
  submitLabel,
  takenNames,
  onSubmit,
  onClose,
}: InstanceModalProps) {
  const isEdit = modeProp === "edit" || (!!initial?.name && !catalogEntry);
  const [mode, setMode] = useState<"spawn" | "connect">(
    (initial?.kind as "spawn" | "connect" | undefined) ??
      catalogEntry?.defaultKind ??
      "spawn",
  );
  const [name, setName] = useState(
    initial?.name ?? defaultNameFor(catalogEntry, takenNames ?? []),
  );
  const [command, setCommand] = useState(
    initial?.command ?? catalogEntry?.defaultCommand ?? "",
  );
  const [argsText, setArgsText] = useState(
    (initial?.args ?? catalogEntry?.defaultArgs ?? []).join(" "),
  );
  const [envText, setEnvText] = useState(envToText(initial?.env ?? {}));
  const [cwd, setCwd] = useState(initial?.default_cwd ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation("adapters");
  const { t: tc } = useTranslation("common");

  async function handleSubmit() {
    setError(null);
    if (mode === "connect") {
      setError(t("modal.no_connect_error"));
      return;
    }
    if (!name.trim()) {
      setError(t("modal.name_required"));
      return;
    }
    if (!command.trim()) {
      setError(t("modal.command_required"));
      return;
    }
    let env: Record<string, string>;
    try {
      env = parseEnvText(envText, t);
    } catch (e) {
      setError(`${t("modal.env_parse_error")}${(e as Error).message}`);
      return;
    }
    const args = argsText.trim().length === 0 ? [] : argsText.trim().split(/\s+/);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        catalog_id: catalogEntry?.id ?? initial?.catalog_id ?? null,
        kind: "spawn",
        command: command.trim(),
        args,
        env,
        default_cwd: cwd.trim() ? cwd.trim() : null,
      });
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message}${err.issues.length ? ` — ${err.issues.join("; ")}` : ""}`
          : (err as Error).message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!isEdit && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMode("spawn")}
                className={cn(
                  "rounded-md border px-2.5 py-1 transition-colors",
                  mode === "spawn"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-foreground hover:bg-accent",
                )}
              >
                {t("modal.spawn")}
              </button>
              <button
                type="button"
                disabled
                title={t("modal.coming_soon")}
                className="cursor-not-allowed rounded-md border border-input px-2.5 py-1 text-muted-foreground"
              >
                {t("modal.connect_soon")}
              </button>
            </div>
          )}

          <Field label={t("modal.instance_name_label")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!initial?.name}
              placeholder={t("modal.instance_name_placeholder")}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("modal.instance_name_hint")}
            </p>
          </Field>

          <Field label={t("modal.command_label")}>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("modal.command_placeholder")}
              className="font-mono text-xs"
            />
          </Field>

          <Field label={t("modal.args_label")}>
            <Input
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder={t("modal.args_placeholder")}
              className="font-mono text-xs"
            />
          </Field>

          <Field label={t("modal.env_label")}>
            <Textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={3}
              placeholder={t("modal.env_placeholder")}
              className="font-mono text-[11px]"
            />
          </Field>

          <Field label={t("modal.cwd_label")}>
            <Input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder={t("modal.cwd_placeholder")}
              className="font-mono text-xs"
            />
          </Field>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? t("modal.working") : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function defaultNameFor(c: CatalogEntry | undefined, taken: string[]): string {
  if (!c) return "";
  const set = new Set(taken);
  if (!set.has("acp")) return "acp";
  const slug = `acp-${c.id}`;
  if (!set.has(slug)) return slug;
  let i = 2;
  while (set.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function parseEnvText(text: string, t: (key: string, opts?: Record<string, unknown>) => string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(t("modal.env_not_kv", { line }));
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1);
    if (!k) throw new Error(t("modal.env_empty_key", { line }));
    out[k] = v;
  }
  return out;
}
