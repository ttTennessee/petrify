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
    <div className="mx-auto grid h-full max-w-6xl grid-cols-[320px_1fr] gap-4 p-6">
      <div className="flex flex-col rounded-md border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Templates</h1>
            <Link to="/" className="text-xs text-slate-500 hover:underline">
              ← back to projects
            </Link>
          </div>
          <div>
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
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white"
            >
              Import
            </button>
          </div>
        </div>
        <div className="border-b px-3 py-2">
          <input
            placeholder="filter…"
            className="w-full rounded border px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {importError && (
          <div className="border-b px-3 py-2 text-xs text-rose-600">{importError}</div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <p className="p-3 text-sm text-slate-500">loading…</p>}
          {visible.length === 0 && !isLoading && (
            <p className="p-3 text-sm text-slate-400">no templates</p>
          )}
          <ul>
            {visible.map((t) => (
              <li
                key={t.id}
                className={`border-b last:border-b-0 ${
                  selectedId === t.id ? "bg-slate-50" : ""
                }`}
              >
                <button
                  onClick={() => setSelectedId(t.id)}
                  className="block w-full px-4 py-2 text-left hover:bg-slate-50"
                >
                  <div className="text-sm font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-slate-500 line-clamp-2">
                      {t.description}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">
                    <span>{t.origin}</span>
                    {t.tags.map((tag) => (
                      <span key={tag} className="rounded bg-slate-100 px-1 text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-md border bg-white p-5 overflow-y-auto">
        {!detail && (
          <p className="text-sm text-slate-400">select a template to inspect</p>
        )}
        {detail && (
          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{detail.name}</h2>
                <div className="text-xs text-slate-500">
                  {detail.origin} ·{" "}
                  {new Date(detail.updated_at).toLocaleString()} ·{" "}
                  {detail.graph.nodes.length} nodes / {detail.graph.edges.length} edges
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={templateExportUrl(detail.id)}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  Export JSON
                </a>
                <button
                  onClick={() => onDelete(detail.id)}
                  className="rounded border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            </div>
            {detail.description && (
              <p className="mb-3 text-sm text-slate-700">{detail.description}</p>
            )}
            <details className="mb-3 rounded border bg-slate-50">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">
                Nodes
              </summary>
              <ul className="px-3 py-2 text-xs">
                {detail.graph.nodes.map((n) => (
                  <li key={n.id} className="border-b last:border-b-0 py-1">
                    <span className="font-mono">{n.ref}</span>{" "}
                    <span className="text-slate-500">— {n.title}</span>{" "}
                    <span className="text-slate-400">[{n.adapter.name}]</span>
                  </li>
                ))}
              </ul>
            </details>
            <details className="rounded border bg-slate-50">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-700">
                Raw graph JSON
              </summary>
              <pre className="max-h-96 overflow-auto px-3 py-2 text-[10px] leading-tight">
                {JSON.stringify(detail.graph, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
