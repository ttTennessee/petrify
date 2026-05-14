import { useEffect, useMemo, useState } from "react";
import type { WorkflowNode } from "@petrify/shared";
import { usePatchNode, ApiError } from "../api/client";
import { useAdapters } from "../api/adapters";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

interface JsonField {
  key: keyof WorkflowNode;
  label: string;
  note?: string;
}

const JSON_FIELDS: JsonField[] = [
  { key: "adapter", label: "Adapter" },
  { key: "inputs", label: "Inputs" },
  { key: "outputs", label: "Outputs" },
  { key: "prompt", label: "Prompt" },
  { key: "runtime", label: "Runtime" },
  { key: "on_failure", label: "On failure" },
  { key: "resources", label: "Resources", note: "M1 declared-only" },
  { key: "condition", label: "Condition", note: "M3" },
  { key: "loop", label: "Loop", note: "M3" },
  { key: "schema", label: "Schema" },
];

function pretty(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

export function NodeDetailPanel({
  node,
  workflowId,
  onClose,
}: {
  node: WorkflowNode;
  workflowId: string;
  onClose: () => void;
}) {
  const initialTitle = node.title;
  const initialJson = useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of JSON_FIELDS) m[f.key as string] = pretty(node[f.key]);
    return m;
  }, [node]);

  const [titleValue, setTitleValue] = useState(initialTitle);
  const [jsonValues, setJsonValues] = useState<Record<string, string>>(initialJson);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [serverIssues, setServerIssues] = useState<string[] | null>(null);

  useEffect(() => {
    setTitleValue(initialTitle);
    setJsonValues(initialJson);
    setLocalErrors({});
    setServerIssues(null);
  }, [node.id, initialTitle, initialJson]);

  const patch = usePatchNode(workflowId);
  const { data: adapters } = useAdapters();
  const adapterChoices = useMemo(
    () => (adapters ?? []).filter((a) => a.live).map((a) => a.name),
    [adapters],
  );

  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    if (titleValue !== initialTitle) keys.push("title");
    for (const f of JSON_FIELDS) {
      if (jsonValues[f.key as string] !== initialJson[f.key as string]) {
        keys.push(f.key as string);
      }
    }
    return keys;
  }, [titleValue, jsonValues, initialTitle, initialJson]);

  const dirty = dirtyKeys.length > 0;

  function discard() {
    setTitleValue(initialTitle);
    setJsonValues(initialJson);
    setLocalErrors({});
    setServerIssues(null);
  }

  async function save() {
    setServerIssues(null);
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = {};
    if (dirtyKeys.includes("title")) {
      if (titleValue.trim().length === 0) errs.title = "title cannot be empty";
      else body.title = titleValue;
    }
    for (const f of JSON_FIELDS) {
      const k = f.key as string;
      if (!dirtyKeys.includes(k)) continue;
      const raw = jsonValues[k] ?? "";
      if (raw.trim() === "") {
        body[k] = null;
        continue;
      }
      try {
        body[k] = JSON.parse(raw);
      } catch (e) {
        errs[k] = (e as Error).message;
      }
    }
    if (Object.keys(errs).length > 0) {
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});
    try {
      await patch.mutateAsync({ nodeId: node.id, patch: body });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerIssues(err.issues.length > 0 ? err.issues : [err.message]);
      } else {
        setServerIssues([(err as Error).message]);
      }
    }
  }

  return (
    <aside className="flex h-full flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            className="h-7 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:border-input"
          />
          <div className="px-1 text-[11px] text-muted-foreground">
            <span className="font-mono">{node.ref}</span>
            <span className="ml-2 opacity-70">id {node.id}</span>
          </div>
          {localErrors.title && (
            <div className="px-1 text-[11px] text-destructive">
              {localErrors.title}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </Button>
      </header>

      <div className="flex-1 space-y-3 overflow-auto px-3 py-3">
        <ReadonlyField label="Dependencies (immutable in M1)">
          {node.dependencies.length === 0 ? (
            <span className="text-muted-foreground">(root)</span>
          ) : (
            <ul className="list-disc pl-4 text-xs">
              {node.dependencies.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </ReadonlyField>

        {JSON_FIELDS.map((f) => {
          const k = f.key as string;
          const value = jsonValues[k] ?? "";
          const isAdapter = k === "adapter";
          return (
            <div key={k}>
              {isAdapter && adapterChoices.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {adapterChoices.map((name) => {
                    const active = (() => {
                      try {
                        return JSON.parse(value || "{}").name === name;
                      } catch {
                        return false;
                      }
                    })();
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setJsonValues((prev) => ({
                            ...prev,
                            adapter: JSON.stringify({ name }, null, 2),
                          }))
                        }
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
              <JsonTextareaField
                label={f.label}
                note={f.note}
                value={value}
                onChange={(v) =>
                  setJsonValues((prev) => ({ ...prev, [k]: v }))
                }
                error={localErrors[k]}
              />
            </div>
          );
        })}
      </div>

      {(dirty || serverIssues) && (
        <div className="border-t bg-muted/40 px-3 py-2">
          {serverIssues && (
            <ul className="mb-2 space-y-0.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {serverIssues.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">
              {dirty
                ? `${dirtyKeys.length} field${dirtyKeys.length > 1 ? "s" : ""} changed`
                : "no changes"}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={discard}
                disabled={!dirty || patch.isPending}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || patch.isPending}
              >
                {patch.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function ReadonlyField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function JsonTextareaField({
  label,
  note,
  value,
  onChange,
  error,
}: {
  label: string;
  note?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const lines = Math.min(Math.max(value.split("\n").length, 3), 14);
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {note && (
            <span className="ml-1 normal-case opacity-70">({note})</span>
          )}
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={lines}
        spellCheck={false}
        className={cn(
          "bg-muted/40 font-mono text-[11px] focus-visible:bg-card",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {error && <div className="text-[11px] text-destructive">{error}</div>}
    </div>
  );
}
