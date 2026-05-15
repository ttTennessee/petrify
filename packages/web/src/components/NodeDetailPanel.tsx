import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkflowNode } from "@petrify/shared";
import { useTranslation } from "react-i18next";
import {
  usePatchNode,
  ApiError,
  useBreakpoints,
  useSetBreakpoint,
  useDeleteBreakpoint,
} from "../api/client";
import { useAdapters } from "../api/adapters";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { NodeJsonPanel, JSON_FIELDS, pretty } from "./NodeJsonPanel";
import { NodeFormPanel } from "./NodeFormPanel";
import { cn } from "../lib/utils";

function pickEditableFields(node: WorkflowNode): Partial<WorkflowNode> {
  const out: Partial<WorkflowNode> = {};
  for (const f of JSON_FIELDS) {
    const k = f.key as keyof WorkflowNode;
    if (node[k] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = node[k];
    }
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const { t } = useTranslation("workflow");
  const { t: tc } = useTranslation("common");

  const [activeTab, setActiveTab] = useState<"form" | "json">("form");

  // --- title state ---
  const [titleValue, setTitleValue] = useState(node.title);
  const [titleError, setTitleError] = useState("");

  // --- draft: structured patch state shared across both views ---
  const [draft, setDraft] = useState<Partial<WorkflowNode>>(() =>
    pickEditableFields(node),
  );

  // --- JSON Tab local string state (overrides serialised from draft) ---
  const [jsonOverrides, setJsonOverrides] = useState<Record<string, string>>(
    () => {
      const m: Record<string, string> = {};
      for (const f of JSON_FIELDS) m[f.key as string] = pretty(node[f.key]);
      return m;
    },
  );
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [serverIssues, setServerIssues] = useState<string[] | null>(null);

  // When node prop changes (e.g. after save or external refresh), reset all state
  useEffect(() => {
    setTitleValue(node.title);
    setTitleError("");
    setDraft(pickEditableFields(node));
    const m: Record<string, string> = {};
    for (const f of JSON_FIELDS) m[f.key as string] = pretty(node[f.key]);
    setJsonOverrides(m);
    setJsonErrors({});
    setServerIssues(null);
  }, [node.id, node]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Flush JSON overrides → draft when leaving JSON tab ---
  const flushJson = useCallback(() => {
    const errs: Record<string, string> = {};
    const update: Partial<WorkflowNode> = {};
    for (const f of JSON_FIELDS) {
      const k = f.key as string;
      const raw = jsonOverrides[k] ?? "";
      if (raw.trim() === "") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (update as any)[k] = null;
        continue;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (update as any)[k] = JSON.parse(raw);
      } catch (e) {
        errs[k] = (e as Error).message;
      }
    }
    setJsonErrors(errs);
    if (Object.keys(errs).length === 0) {
      setDraft((prev) => ({ ...prev, ...update }));
    }
  }, [jsonOverrides]);

  function handleTabChange(tab: string) {
    if (activeTab === "json") {
      flushJson();
    } else {
      // leaving form → refresh JSON overrides from draft
      const m: Record<string, string> = {};
      for (const f of JSON_FIELDS) {
        const k = f.key as keyof WorkflowNode;
        m[k as string] = pretty(draft[k] ?? node[k]);
      }
      setJsonOverrides(m);
    }
    setActiveTab(tab as "form" | "json");
  }

  // dirty calculation
  const initialEditable = useMemo(
    () => pickEditableFields(node),
    [node], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dirtyKeys = useMemo(() => {
    const keys: string[] = [];
    if (titleValue !== node.title) keys.push("title");
    for (const f of JSON_FIELDS) {
      const k = f.key as keyof WorkflowNode;
      if (!deepEqual(draft[k], initialEditable[k])) keys.push(k as string);
    }
    return keys;
  }, [titleValue, draft, node.title, initialEditable]);

  const dirty = dirtyKeys.length > 0;
  const hasJsonErrors = Object.keys(jsonErrors).length > 0;

  const patch = usePatchNode(workflowId);
  const { data: breakpoints } = useBreakpoints(workflowId);
  const setBreakpoint = useSetBreakpoint(workflowId);
  const deleteBreakpoint = useDeleteBreakpoint(workflowId);
  const hasBreakpoint = (breakpoints ?? []).some(
    (b) => b.node_id === node.id && b.enabled,
  );
  const { data: adapters } = useAdapters();
  const adapterChoices = useMemo(
    () => (adapters ?? []).filter((a) => a.live).map((a) => a.name),
    [adapters],
  );

  function discard() {
    setTitleValue(node.title);
    setTitleError("");
    setDraft(pickEditableFields(node));
    const m: Record<string, string> = {};
    for (const f of JSON_FIELDS) m[f.key as string] = pretty(node[f.key]);
    setJsonOverrides(m);
    setJsonErrors({});
    setServerIssues(null);
  }

  async function save() {
    // flush JSON if on that tab
    let latestDraft = draft;
    if (activeTab === "json") {
      const errs: Record<string, string> = {};
      const update: Partial<WorkflowNode> = {};
      for (const f of JSON_FIELDS) {
        const k = f.key as string;
        const raw = jsonOverrides[k] ?? "";
        if (raw.trim() === "") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (update as any)[k] = null;
          continue;
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (update as any)[k] = JSON.parse(raw);
        } catch (e) {
          errs[k] = (e as Error).message;
        }
      }
      if (Object.keys(errs).length > 0) {
        setJsonErrors(errs);
        return;
      }
      latestDraft = { ...draft, ...update };
      setDraft(latestDraft);
    }

    const titleErr =
      titleValue.trim().length === 0 ? t("node.title_required") : "";
    setTitleError(titleErr);
    if (titleErr) return;

    setServerIssues(null);
    const body: Record<string, unknown> = {};
    if (dirtyKeys.includes("title")) body.title = titleValue;
    for (const f of JSON_FIELDS) {
      const k = f.key as keyof WorkflowNode;
      if (!dirtyKeys.includes(k as string)) continue;
      body[k as string] = latestDraft[k] ?? null;
    }
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
    <aside className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="min-w-0 flex-1">
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            className="h-7 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:border-b focus-visible:border-accent focus-visible:ring-0"
          />
          <div className="px-1 font-mono text-[10px] text-muted-foreground">
            <span>{node.ref}</span>
            <span className="ml-2 opacity-60">
              {t("node.id_prefix")}
              {node.id}
            </span>
          </div>
          {titleError && (
            <div className="px-1 font-mono text-[10px] text-destructive">
              {titleError}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-2 h-7 w-7 shrink-0",
            hasBreakpoint
              ? "text-destructive hover:text-destructive"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => {
            if (hasBreakpoint) deleteBreakpoint.mutate(node.id);
            else setBreakpoint.mutate({ nodeId: node.id, enabled: true });
          }}
          aria-label={
            hasBreakpoint
              ? t("breakpoint.toggle_off")
              : t("breakpoint.toggle_on")
          }
          title={
            hasBreakpoint
              ? t("breakpoint.toggle_off")
              : t("breakpoint.toggle_on")
          }
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full border",
              hasBreakpoint
                ? "bg-destructive border-destructive"
                : "border-current",
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label={tc("close")}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M1 1l10 10M11 1L1 11" />
          </svg>
        </Button>
      </header>

      {/* Tab bar */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="w-full justify-start px-4">
          <TabsTrigger value="form">{t("node.tab_form")}</TabsTrigger>
          <TabsTrigger value="json">{t("node.tab_json")}</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="overflow-auto">
          <NodeFormPanel
            key={node.id}
            node={{ ...node, ...draft } as WorkflowNode}
            adapterChoices={adapterChoices}
            onDraftChange={(partial) =>
              setDraft((prev) => ({ ...prev, ...partial }))
            }
            onSwitchToJson={() => handleTabChange("json")}
          />
        </TabsContent>

        <TabsContent value="json" className="overflow-auto">
          <NodeJsonPanel
            jsonValues={jsonOverrides}
            localErrors={jsonErrors}
            adapterChoices={adapterChoices}
            onFieldChange={(k, v) => {
              setJsonOverrides((prev) => ({ ...prev, [k]: v }));
              setJsonErrors((prev) => {
                const next = { ...prev };
                delete next[k];
                return next;
              });
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      {(dirty || serverIssues || hasJsonErrors) && (
        <div className="border-t border-border bg-muted/40 px-4 py-2.5">
          {serverIssues && (
            <ul className="mb-2 space-y-0.5 border-l-2 border-destructive py-1 pl-3">
              {serverIssues.map((s, i) => (
                <li key={i} className="font-mono text-[10px] text-destructive">
                  {s}
                </li>
              ))}
            </ul>
          )}
          {hasJsonErrors && (
            <p className="mb-2 font-mono text-[10px] text-destructive">
              Fix JSON errors before saving.
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {dirty
                ? t("node.changed", { count: dirtyKeys.length })
                : t("node.no_changes")}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={discard}
                disabled={!dirty || patch.isPending}
              >
                {tc("discard")}
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || patch.isPending || hasJsonErrors}
              >
                {patch.isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
