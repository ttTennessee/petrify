import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProject, useProjectWorkflows } from "../api/client";
import { ImportPanel } from "../components/ImportPanel";
import { PromptTemplatePanel } from "../components/PromptTemplatePanel";
import { FromTemplateDialog } from "../components/FromTemplateDialog";

export default function ProjectDetail() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useProject(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const [showTemplates, setShowTemplates] = useState(false);

  if (isLoading || !projectId) return <p className="p-6 text-sm text-slate-500">loading…</p>;
  if (!data) return <p className="p-6 text-sm text-red-600">not found</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.goal}</h1>
          <p className="text-xs text-slate-500">{data.id}</p>
        </div>
        <button
          onClick={() => setShowTemplates(true)}
          className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          From Template…
        </button>
      </header>
      {showTemplates && (
        <FromTemplateDialog
          projectId={projectId}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {workflows && workflows.length > 0 && (
        <section className="rounded-md border bg-white p-4">
          <h2 className="mb-2 font-medium">Workflows</h2>
          <ul className="space-y-1">
            {workflows.map((wf) => (
              <li key={wf.id}>
                <button
                  onClick={() => nav(`/workflows/${wf.id}`)}
                  className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-slate-600">{wf.id}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(wf.created_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PromptTemplatePanel projectId={projectId} />
      <ImportPanel projectId={projectId} />
    </div>
  );
}
