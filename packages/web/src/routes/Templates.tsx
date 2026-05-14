import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTemplates,
  useTemplate,
  useDeleteTemplate,
  useImportTemplate,
  templateExportUrl,
} from "../api/client";
import { TemplateExportSchema } from "@petrify/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Section } from "../components/section";
import { cn } from "../lib/utils";

export default function Templates() {
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: list, isLoading } = useTemplates();
  const { data: detail } = useTemplate(selectedId ?? undefined);
  const del = useDeleteTemplate();
  const imp = useImportTemplate();
  const qc = useQueryClient();

  const onFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = TemplateExportSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        setImportError(parsed.error.issues.map((i) => i.message).join("; "));
        return;
      }
      await imp.mutateAsync(parsed.data);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (err) {
      setImportError((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await del.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["templates"] });
  };

  const visible = (list ?? []).filter((t) =>
    filter ? t.name.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="border-b border-border px-8 pt-8 pb-0 shrink-0">
        <Section
          number="02"
          eyebrow="Templates"
          title={
            <>
              Reusable{" "}
              <span className="italic text-accent">blueprints.</span>
            </>
          }
          meta={visible.length > 0 ? `${visible.length} template${visible.length !== 1 ? "s" : ""}` : undefined}
          actions={
            <>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                Import JSON
              </Button>
            </>
          }
        />
        <Link
          to="/"
          className="inline-block mt-3 mb-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-0">
        <div className="flex w-80 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-4 py-2">
            <Input
              placeholder="Filter templates…"
              className="h-7 border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0 px-0"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {importError && (
            <div className="border-b border-border px-4 py-2 font-mono text-[10px] text-destructive">
              {importError}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && (
              <p className="px-4 py-3 font-mono text-xs text-muted-foreground">loading…</p>
            )}
            {visible.length === 0 && !isLoading && (
              <p className="px-4 py-3 font-mono text-xs text-muted-foreground">
                no templates
              </p>
            )}
            <ul>
              {visible.map((t) => (
                <li
                  key={t.id}
                  className={cn(
                    "border-b border-border last:border-b-0 transition-colors",
                    selectedId === t.id
                      ? "border-l-2 border-l-accent bg-accent/10"
                      : "border-l-2 border-l-transparent hover:bg-muted/40",
                  )}
                >
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className="block w-full px-4 py-3 text-left"
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-2 font-mono text-[10px] text-muted-foreground">
                        {t.description}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline">{t.origin}</Badge>
                      {t.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          {!detail && (
            <div className="flex h-full items-center justify-center">
              <p className="font-display text-xl italic text-muted-foreground">
                select a template to inspect.
              </p>
            </div>
          )}
          {detail && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl">{detail.name}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
                    <Badge variant="outline">{detail.origin}</Badge>
                    <span>{new Date(detail.updated_at).toLocaleString()}</span>
                    <span>
                      {detail.graph.nodes.length} nodes / {detail.graph.edges.length} edges
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={templateExportUrl(detail.id)}>Export JSON</a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(detail.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {detail.description && (
                <p className="text-sm text-foreground">{detail.description}</p>
              )}

              <details className="border border-border">
                <summary className="cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 select-none">
                  § Nodes ({detail.graph.nodes.length})
                </summary>
                <ul className="border-t border-border">
                  {detail.graph.nodes.map((n) => (
                    <li
                      key={n.id}
                      className="grid grid-cols-[8rem_1fr_auto] items-center gap-4 border-b border-border px-4 py-2 last:border-b-0"
                    >
                      <span className="font-mono text-xs text-foreground">{n.ref}</span>
                      <span className="text-xs text-muted-foreground">{n.title}</span>
                      <Badge variant="outline">{n.adapter.name}</Badge>
                    </li>
                  ))}
                </ul>
              </details>

              <details className="border border-border">
                <summary className="cursor-pointer px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 select-none">
                  § Raw graph JSON
                </summary>
                <pre className="max-h-96 overflow-auto border-t border-border px-4 py-3 font-mono text-[10px] leading-relaxed text-foreground/80">
                  {JSON.stringify(detail.graph, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
