import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTemplates, useInstantiateTemplate } from "../api/client";

interface Props {
  projectId: string;
  onClose: () => void;
}

export function FromTemplateDialog({ projectId, onClose }: Props) {
  const [filter, setFilter] = useState("");
  const { data: templates, isLoading } = useTemplates();
  const inst = useInstantiateTemplate();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const visible = (templates ?? []).filter((t) =>
    filter ? t.name.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  const submit = async () => {
    if (!selected) return;
    const { workflowId } = await inst.mutateAsync({ templateId: selected, projectId });
    qc.invalidateQueries({ queryKey: ["project-workflows", projectId] });
    onClose();
    nav(`/workflows/${workflowId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[520px] max-h-[80vh] rounded-md border bg-white shadow-lg flex flex-col">
        <div className="border-b px-5 py-3">
          <h2 className="text-base font-semibold">Create workflow from template</h2>
        </div>
        <div className="px-5 py-3 border-b">
          <input
            placeholder="filter templates…"
            className="w-full rounded border px-2 py-1.5 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading && <p className="p-3 text-sm text-slate-500">loading…</p>}
          {visible.length === 0 && !isLoading && (
            <p className="p-3 text-sm text-slate-400">no templates</p>
          )}
          <ul className="space-y-1">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelected(t.id)}
                  className={`w-full rounded px-3 py-2 text-left text-sm ${
                    selected === t.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div
                      className={`text-xs ${
                        selected === t.id ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {t.description}
                    </div>
                  )}
                  <div
                    className={`mt-1 flex gap-1 text-[10px] ${
                      selected === t.id ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
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
        {inst.isError && (
          <p className="border-t px-5 py-2 text-xs text-rose-600">
            {(inst.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selected || inst.isPending}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {inst.isPending ? "Creating…" : "Create workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}
