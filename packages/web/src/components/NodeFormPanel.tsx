import { useState } from "react";
import type { WorkflowNode, ResourceClaim } from "@petrify/shared";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "../lib/utils";

type OnFailureStrategy = "retry" | "skip" | "abort" | "compensate";

interface KvRow {
  id: number;
  key: string;
  value: string;
  error?: string;
}

let _id = 0;
function nextId() {
  return ++_id;
}

function recordToRows(rec: Record<string, unknown>): KvRow[] {
  return Object.entries(rec).map(([k, v]) => ({
    id: nextId(),
    key: k,
    value: typeof v === "string" ? v : JSON.stringify(v),
  }));
}

function outputsToRows(rec: Record<string, string>): KvRow[] {
  return Object.entries(rec).map(([k, v]) => ({
    id: nextId(),
    key: k,
    value: v,
  }));
}

function rowsToInputs(rows: KvRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.key.trim()) continue;
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  return out;
}

function rowsToOutputs(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!r.key.trim()) continue;
    out[r.key] = r.value;
  }
  return out;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>
        {label}
        {note && (
          <span className="ml-1.5 normal-case italic opacity-60">({note})</span>
        )}
      </FieldLabel>
      {children}
    </div>
  );
}

export function NodeFormPanel({
  node,
  adapterChoices,
  onDraftChange,
  onSwitchToJson,
}: {
  node: WorkflowNode;
  adapterChoices: string[];
  onDraftChange: (patch: Partial<WorkflowNode>) => void;
  onSwitchToJson: () => void;
}) {
  const { t } = useTranslation("workflow");

  const [adapterName, setAdapterName] = useState(node.adapter.name);
  const [adapterVersion, setAdapterVersion] = useState(
    node.adapter.version ?? "",
  );

  const [systemPrompt, setSystemPrompt] = useState(
    node.prompt?.system_prompt ?? "",
  );
  const [taskPrompt, setTaskPrompt] = useState(node.prompt?.task_prompt ?? "");

  const [timeout, setTimeout_] = useState(
    node.runtime?.timeout !== undefined ? String(node.runtime.timeout) : "",
  );
  const [retries, setRetries] = useState(
    node.runtime?.retries !== undefined ? String(node.runtime.retries) : "",
  );
  const [checkpoint, setCheckpoint] = useState(
    node.runtime?.checkpoint !== undefined ? node.runtime.checkpoint : true,
  );

  const [strategy, setStrategy] = useState<OnFailureStrategy>(
    (node.on_failure?.strategy ?? "abort") as OnFailureStrategy,
  );
  const [maxAttempts, setMaxAttempts] = useState(
    node.on_failure?.max_attempts !== undefined
      ? String(node.on_failure.max_attempts)
      : "",
  );
  const [backoffMs, setBackoffMs] = useState(
    node.on_failure?.backoff_ms !== undefined
      ? String(node.on_failure.backoff_ms)
      : "",
  );
  const [compensateRef, setCompensateRef] = useState(
    node.on_failure?.compensate_ref ?? "",
  );

  const [permissionPolicy, setPermissionPolicy] = useState<
    "inherit" | "ask" | "allow-all" | "deny-all"
  >(node.permission_policy ?? "inherit");

  const [condition, setCondition] = useState(node.condition ?? "");

  const [loopMax, setLoopMax] = useState(
    node.loop?.max_iterations !== undefined
      ? String(node.loop.max_iterations)
      : "",
  );
  const [loopExit, setLoopExit] = useState(node.loop?.exit_condition ?? "");

  const [resources, setResources] = useState<
    (ResourceClaim & { _id: number })[]
  >(
    (node.resources ?? []).map((r) => ({ ...r, _id: nextId() })),
  );

  const [inputRows, setInputRows] = useState<KvRow[]>(() =>
    recordToRows(node.inputs ?? {}),
  );
  const [outputRows, setOutputRows] = useState<KvRow[]>(() =>
    outputsToRows(node.outputs ?? {}),
  );

  function emitAdapter(name: string, version: string) {
    onDraftChange({
      adapter: { name, ...(version.trim() ? { version: version.trim() } : {}) },
    });
  }

  function emitPrompt(sys: string, task: string) {
    if (!task.trim() && !sys.trim()) {
      onDraftChange({ prompt: undefined });
      return;
    }
    onDraftChange({
      prompt: {
        task_prompt: task,
        ...(sys.trim() ? { system_prompt: sys } : {}),
      },
    });
  }

  function emitRuntime(
    to: string,
    ret: string,
    ckpt: boolean,
  ) {
    const rt: WorkflowNode["runtime"] = {};
    const toNum = parseInt(to, 10);
    if (!isNaN(toNum) && toNum > 0) rt.timeout = toNum;
    const retNum = parseInt(ret, 10);
    if (!isNaN(retNum) && retNum >= 0) rt.retries = retNum;
    rt.checkpoint = ckpt;
    onDraftChange({ runtime: rt });
  }

  function emitOnFailure(
    strat: OnFailureStrategy,
    ma: string,
    bo: string,
    cr: string,
  ) {
    const of_: WorkflowNode["on_failure"] = { strategy: strat };
    const maNum = parseInt(ma, 10);
    if (!isNaN(maNum) && maNum > 0) of_.max_attempts = maNum;
    const boNum = parseInt(bo, 10);
    if (!isNaN(boNum) && boNum >= 0) of_.backoff_ms = boNum;
    if (cr.trim()) of_.compensate_ref = cr.trim();
    onDraftChange({ on_failure: of_ });
  }

  function emitCondition(val: string) {
    onDraftChange({ condition: val.trim() || null });
  }

  function emitLoop(max: string, exit: string) {
    const maxNum = parseInt(max, 10);
    if (!max.trim() && !exit.trim()) {
      onDraftChange({ loop: null });
      return;
    }
    if (!isNaN(maxNum) && maxNum > 0 && exit.trim()) {
      onDraftChange({
        loop: { max_iterations: maxNum, exit_condition: exit },
      });
    }
  }

  function emitResources(list: (ResourceClaim & { _id: number })[]) {
    onDraftChange({
      resources: list.map(({ _id: _, ...r }) => r),
    });
  }

  function emitInputRows(rows: KvRow[]) {
    const hasErrors = rows.some((r) => r.error);
    if (!hasErrors) onDraftChange({ inputs: rowsToInputs(rows) });
  }

  function emitOutputRows(rows: KvRow[]) {
    onDraftChange({ outputs: rowsToOutputs(rows) });
  }

  return (
    <div className="space-y-5 px-4 py-4">
      {/* Dependencies (readonly) */}
      <Section label={t("node.dependencies")}>
        {node.dependencies.length === 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("node.root")}
          </span>
        ) : (
          <ul className="space-y-0.5">
            {node.dependencies.map((d) => (
              <li key={d} className="font-mono text-[11px] text-foreground">
                {d}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Adapter */}
      <Section label={t("node.fields.adapter")}>
        {adapterChoices.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {adapterChoices.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setAdapterName(name);
                  emitAdapter(name, adapterVersion);
                }}
                className={cn(
                  "border px-2 py-0.5 font-mono text-[10px] transition-colors",
                  adapterName === name
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <Input
          value={adapterName}
          onChange={(e) => {
            setAdapterName(e.target.value);
            emitAdapter(e.target.value, adapterVersion);
          }}
          placeholder="adapter name"
          className="h-7 font-mono text-[11px]"
        />
        <div className="mt-1.5">
          <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("node.form.adapter_version")}
          </Label>
          <Input
            value={adapterVersion}
            onChange={(e) => {
              setAdapterVersion(e.target.value);
              emitAdapter(adapterName, e.target.value);
            }}
            placeholder="e.g. 1.0.0"
            className="h-7 font-mono text-[11px]"
          />
        </div>
      </Section>

      {/* Prompt */}
      <Section label={t("node.fields.prompt")}>
        <div className="space-y-2">
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.task_prompt")}
            </Label>
            <Textarea
              value={taskPrompt}
              onChange={(e) => {
                setTaskPrompt(e.target.value);
                emitPrompt(systemPrompt, e.target.value);
              }}
              rows={3}
              className="resize-y min-h-[4.5rem] bg-muted/40 font-mono text-[11px] focus-visible:bg-card"
            />
          </div>
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.system_prompt")}
            </Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                emitPrompt(e.target.value, taskPrompt);
              }}
              rows={3}
              className="resize-y min-h-[4.5rem] bg-muted/40 font-mono text-[11px] focus-visible:bg-card"
            />
          </div>
        </div>
      </Section>

      {/* Runtime */}
      <Section label={t("node.fields.runtime")}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.timeout_sec")}
            </Label>
            <Input
              type="number"
              min={1}
              value={timeout}
              onChange={(e) => {
                setTimeout_(e.target.value);
                emitRuntime(e.target.value, retries, checkpoint);
              }}
              className="h-7 font-mono text-[11px]"
            />
          </div>
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.retries")}
            </Label>
            <Input
              type="number"
              min={0}
              value={retries}
              onChange={(e) => {
                setRetries(e.target.value);
                emitRuntime(timeout, e.target.value, checkpoint);
              }}
              className="h-7 font-mono text-[11px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="ckpt"
            checked={checkpoint}
            onCheckedChange={(v) => {
              const b = v === true;
              setCheckpoint(b);
              emitRuntime(timeout, retries, b);
            }}
          />
          <Label htmlFor="ckpt" className="font-mono text-[11px] text-foreground">
            {t("node.form.checkpoint")}
          </Label>
        </div>
      </Section>

      {/* On failure */}
      <Section label={t("node.fields.on_failure")}>
        <div>
          <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("node.form.on_failure_strategy")}
          </Label>
          <Select
            value={strategy}
            onValueChange={(v) => {
              const s = v as OnFailureStrategy;
              setStrategy(s);
              emitOnFailure(s, maxAttempts, backoffMs, compensateRef);
            }}
          >
            <SelectTrigger className="h-7 font-mono text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["abort", "retry", "skip", "compensate"] as const).map((s) => (
                <SelectItem key={s} value={s} className="font-mono text-[11px]">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {strategy === "retry" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("node.form.max_attempts")}
              </Label>
              <Input
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => {
                  setMaxAttempts(e.target.value);
                  emitOnFailure(strategy, e.target.value, backoffMs, compensateRef);
                }}
                className="h-7 font-mono text-[11px]"
              />
            </div>
            <div>
              <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("node.form.backoff_ms")}
              </Label>
              <Input
                type="number"
                min={0}
                value={backoffMs}
                onChange={(e) => {
                  setBackoffMs(e.target.value);
                  emitOnFailure(strategy, maxAttempts, e.target.value, compensateRef);
                }}
                className="h-7 font-mono text-[11px]"
              />
            </div>
          </div>
        )}
        {strategy === "compensate" && (
          <div className="pt-1">
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.compensate_ref")}
            </Label>
            <Input
              value={compensateRef}
              onChange={(e) => {
                setCompensateRef(e.target.value);
                emitOnFailure(strategy, maxAttempts, backoffMs, e.target.value);
              }}
              className="h-7 font-mono text-[11px]"
            />
          </div>
        )}
      </Section>

      {/* Permission policy */}
      <Section label="permission">
        <div>
          <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            policy
          </Label>
          <Select
            value={permissionPolicy}
            onValueChange={(v) => {
              const next = v as typeof permissionPolicy;
              setPermissionPolicy(next);
              onDraftChange({
                permission_policy: next === "inherit" ? undefined : next,
              });
            }}
          >
            <SelectTrigger className="h-7 font-mono text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                ["inherit", "ask", "allow-all", "deny-all"] as const
              ).map((s) => (
                <SelectItem key={s} value={s} className="font-mono text-[11px]">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            inherit = use the global default from Settings.
          </p>
        </div>
      </Section>

      {/* Condition (M3) */}
      <Section
        label={t("node.fields.condition")}
        note={t("node.field_notes.condition")}
      >
        <Input
          value={condition}
          onChange={(e) => {
            setCondition(e.target.value);
            emitCondition(e.target.value);
          }}
          placeholder="e.g. outputs.score > 0.8"
          className="h-7 font-mono text-[11px]"
        />
      </Section>

      {/* Loop (M3) */}
      <Section label={t("node.fields.loop")} note={t("node.field_notes.loop")}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.loop_max")}
            </Label>
            <Input
              type="number"
              min={1}
              value={loopMax}
              onChange={(e) => {
                setLoopMax(e.target.value);
                emitLoop(e.target.value, loopExit);
              }}
              className="h-7 font-mono text-[11px]"
            />
          </div>
          <div>
            <Label className="mb-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("node.form.loop_exit")}
            </Label>
            <Input
              value={loopExit}
              onChange={(e) => {
                setLoopExit(e.target.value);
                emitLoop(loopMax, e.target.value);
              }}
              className="h-7 font-mono text-[11px]"
            />
          </div>
        </div>
      </Section>

      {/* Resources (M1 declared-only) */}
      <Section
        label={t("node.fields.resources")}
        note={t("node.field_notes.resources")}
      >
        <div className="space-y-1.5">
          {resources.map((r, i) => (
            <div key={r._id} className="flex items-center gap-1.5">
              <Input
                value={r.name}
                onChange={(e) => {
                  const next = resources.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  );
                  setResources(next);
                  emitResources(next);
                }}
                placeholder={t("node.form.resource_name")}
                className="h-6 flex-1 font-mono text-[11px]"
              />
              <Input
                type="number"
                min={1}
                value={r.amount}
                onChange={(e) => {
                  const next = resources.map((x, j) =>
                    j === i
                      ? { ...x, amount: parseInt(e.target.value, 10) || 1 }
                      : x,
                  );
                  setResources(next);
                  emitResources(next);
                }}
                className="h-6 w-14 font-mono text-[11px]"
              />
              <div className="flex items-center gap-1">
                <Checkbox
                  id={`rel-${r._id}`}
                  checked={r.release}
                  onCheckedChange={(v) => {
                    const next = resources.map((x, j) =>
                      j === i ? { ...x, release: v === true } : x,
                    );
                    setResources(next);
                    emitResources(next);
                  }}
                />
                <Label
                  htmlFor={`rel-${r._id}`}
                  className="font-mono text-[10px] text-muted-foreground"
                >
                  {t("node.form.resource_release")}
                </Label>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = resources.filter((_, j) => j !== i);
                  setResources(next);
                  emitResources(next);
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="remove"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M1 1l8 8M9 1L1 9" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = [
                ...resources,
                { _id: nextId(), name: "", amount: 1, release: true },
              ];
              setResources(next);
            }}
            className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
          >
            {t("node.form.add_resource")}
          </button>
        </div>
      </Section>

      {/* Inputs */}
      <Section label={t("node.fields.inputs")}>
        <KvEditor
          rows={inputRows}
          jsonValues
          addLabel={t("node.form.add_input")}
          invalidLabel={t("node.form.kv_invalid_json")}
          onChange={(rows) => {
            setInputRows(rows);
            emitInputRows(rows);
          }}
        />
      </Section>

      {/* Outputs */}
      <Section label={t("node.fields.outputs")}>
        <KvEditor
          rows={outputRows}
          jsonValues={false}
          addLabel={t("node.form.add_output")}
          invalidLabel=""
          onChange={(rows) => {
            setOutputRows(rows);
            emitOutputRows(rows);
          }}
        />
      </Section>

      {/* Schema (advanced — JSON view only) */}
      <Section label={t("node.fields.schema")}>
        <div className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("node.form.schema_advanced")}
          </span>
          <button
            type="button"
            onClick={onSwitchToJson}
            className="font-mono text-[10px] text-foreground underline-offset-2 hover:underline"
          >
            {t("node.form.schema_open_json")}
          </button>
        </div>
      </Section>
    </div>
  );
}

function KvEditor({
  rows,
  jsonValues,
  addLabel,
  invalidLabel,
  onChange,
}: {
  rows: KvRow[];
  jsonValues: boolean;
  addLabel: string;
  invalidLabel: string;
  onChange: (rows: KvRow[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.id} className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Input
              value={r.key}
              onChange={(e) => {
                const next = rows.map((x, j) =>
                  j === i ? { ...x, key: e.target.value } : x,
                );
                onChange(next);
              }}
              placeholder="key"
              className="h-6 w-28 font-mono text-[11px]"
            />
            <Input
              value={r.value}
              onChange={(e) => {
                const next = rows.map((x, j) =>
                  j === i ? { ...x, value: e.target.value } : x,
                );
                onChange(next);
              }}
              onBlur={() => {
                if (!jsonValues) return;
                const next = rows.map((x, j) => (j === i ? validateRow(x, invalidLabel) : x));
                onChange(next);
              }}
              placeholder={jsonValues ? '"value" or 42 or {...}' : "value"}
              className={cn(
                "h-6 flex-1 font-mono text-[11px]",
                r.error && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive"
              aria-label="remove"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M1 1l8 8M9 1L1 9" />
              </svg>
            </button>
          </div>
          {r.error && (
            <div className="pl-[7.5rem] font-mono text-[10px] text-destructive">
              {r.error}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: nextId(), key: "", value: "" }])}
        className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
      >
        {addLabel}
      </button>
    </div>
  );
}

function validateRow(row: KvRow, invalidLabel: string): KvRow {
  if (!row.value.trim()) return { ...row, error: undefined };
  try {
    JSON.parse(row.value);
    return { ...row, error: undefined };
  } catch {
    return { ...row, error: invalidLabel };
  }
}
