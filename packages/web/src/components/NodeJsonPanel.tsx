import type { WorkflowNode } from "@petrify/shared";
import { useTranslation } from "react-i18next";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

interface JsonField {
  key: keyof WorkflowNode;
  labelKey: string;
  noteKey?: string;
}

export const JSON_FIELDS: JsonField[] = [
  { key: "adapter", labelKey: "adapter" },
  { key: "inputs", labelKey: "inputs" },
  { key: "outputs", labelKey: "outputs" },
  { key: "prompt", labelKey: "prompt" },
  { key: "runtime", labelKey: "runtime" },
  { key: "on_failure", labelKey: "on_failure" },
  { key: "resources", labelKey: "resources", noteKey: "resources" },
  { key: "condition", labelKey: "condition", noteKey: "condition" },
  { key: "loop", labelKey: "loop", noteKey: "loop" },
  { key: "mcp_servers", labelKey: "mcp_servers" },
  { key: "schema", labelKey: "schema" },
];

export function pretty(value: unknown): string {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

export function NodeJsonPanel({
  jsonValues,
  localErrors,
  adapterChoices,
  onFieldChange,
}: {
  jsonValues: Record<string, string>;
  localErrors: Record<string, string>;
  adapterChoices: string[];
  onFieldChange: (key: string, value: string) => void;
}) {
  const { t } = useTranslation("workflow");

  return (
    <div className="space-y-4 px-4 py-4">
      {JSON_FIELDS.map((f) => {
        const k = f.key as string;
        const value = jsonValues[k] ?? "";
        const isAdapter = k === "adapter";
        return (
          <div key={k}>
            {isAdapter && adapterChoices.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {adapterChoices.map((name: string) => {
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
                        onFieldChange(
                          "adapter",
                          JSON.stringify({ name }, null, 2),
                        )
                      }
                      className={cn(
                        "border px-2 py-0.5 font-mono text-[10px] transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            <JsonTextareaField
              label={t(`node.fields.${f.labelKey}`)}
              note={f.noteKey ? t(`node.field_notes.${f.noteKey}`) : undefined}
              value={value}
              onChange={(v) => onFieldChange(k, v)}
              error={localErrors[k]}
            />
          </div>
        );
      })}
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
      <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {note && (
          <span className="ml-1.5 normal-case italic opacity-60">({note})</span>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={lines}
        spellCheck={false}
        className={cn(
          "resize-none border-border bg-muted/40 font-mono text-[11px] focus-visible:bg-card",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {error && (
        <div className="mt-0.5 font-mono text-[10px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
