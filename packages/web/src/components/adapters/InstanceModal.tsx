import { useState } from "react";
import type { AdapterInput, CatalogEntry } from "../../api/adapters";
import { ApiError } from "../../api/client";

export interface InstanceModalProps {
  // Pre-fill from a catalog entry (Catalog → "Enable") or undefined for fully custom.
  catalogEntry?: CatalogEntry;
  // Existing instance values when editing.
  initial?: Partial<AdapterInput>;
  // Modal title shown at top.
  title: string;
  // Submit button label.
  submitLabel: string;
  // Names already taken by existing instances — used to pick a non-colliding default.
  takenNames?: string[];
  onSubmit: (input: AdapterInput) => Promise<unknown>;
  onClose: () => void;
}

export function InstanceModal({
  catalogEntry,
  initial,
  title,
  submitLabel,
  takenNames,
  onSubmit,
  onClose,
}: InstanceModalProps) {
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
  const [envText, setEnvText] = useState(
    envToText(initial?.env ?? {}),
  );
  const [cwd, setCwd] = useState(initial?.default_cwd ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (mode === "connect") {
      setError("connect mode isn't implemented yet — use spawn for now");
      return;
    }
    if (!name.trim()) {
      setError("name is required");
      return;
    }
    if (!command.trim()) {
      setError("command is required");
      return;
    }
    let env: Record<string, string>;
    try {
      env = parseEnvText(envText);
    } catch (e) {
      setError(`env: ${(e as Error).message}`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("spawn")}
              className={`rounded border px-2 py-1 ${
                mode === "spawn"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-700"
              }`}
            >
              Spawn
            </button>
            <button
              type="button"
              onClick={() => setMode("connect")}
              disabled
              title="coming in a later release"
              className="cursor-not-allowed rounded border border-slate-200 px-2 py-1 text-slate-400"
            >
              Connect (soon)
            </button>
          </div>

          <Field label="Instance name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!initial?.name}
              placeholder="acp-claude"
              className="w-full rounded border px-2 py-1 font-mono text-xs disabled:bg-slate-50"
            />
            <p className="text-[10px] text-slate-500">
              [a-zA-Z0-9_.:-]+ — used as the adapter key in node configs
            </p>
          </Field>

          <Field label="Command">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude-code-acp"
              className="w-full rounded border px-2 py-1 font-mono text-xs"
            />
          </Field>

          <Field label="Args (space-separated)">
            <input
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="--flag value"
              className="w-full rounded border px-2 py-1 font-mono text-xs"
            />
          </Field>

          <Field label="Environment variables (KEY=value per line)">
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={3}
              placeholder="ANTHROPIC_API_KEY=sk-..."
              className="w-full rounded border px-2 py-1 font-mono text-[11px]"
            />
          </Field>

          <Field label="Working directory (optional)">
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/abs/path or empty for server cwd"
              className="w-full rounded border px-2 py-1 font-mono text-xs"
            />
          </Field>

          {error && (
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-4 py-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded border px-3 py-1.5 text-xs hover:bg-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Working…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function defaultNameFor(c: CatalogEntry | undefined, taken: string[]): string {
  if (!c) return "";
  // Prefer the plain "acp" key for the first ACP instance so legacy workflow
  // JSON (which references adapter.name = "acp") works out of the box. Fall
  // back to a per-catalog suffix once "acp" is taken.
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

function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`'${line}' is not KEY=value`);
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1);
    if (!k) throw new Error(`empty key in '${line}'`);
    out[k] = v;
  }
  return out;
}
