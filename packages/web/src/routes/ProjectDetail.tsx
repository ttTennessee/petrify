import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProject, useProjectWorkflows } from "../api/client";
import { ImportPanel } from "../components/ImportPanel";
import { PromptTemplatePanel } from "../components/PromptTemplatePanel";
import { FromTemplateDialog } from "../components/FromTemplateDialog";
import { Button } from "../components/ui/button";

export default function ProjectDetail() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useProject(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const [showTemplates, setShowTemplates] = useState(false);

  if (isLoading || !projectId)
    return <p className="p-6 text-sm text-muted-foreground">loading…</p>;
  if (!data) return <p className="p-6 text-sm text-destructive">not found</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.goal}</h1>
          <p className="text-xs text-muted-foreground">{data.id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
          From Template…
        </Button>
      </header>
      {showTemplates && (
        <FromTemplateDialog
          projectId={projectId}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {workflows && workflows.length > 0 && (
        <section className="rounded-md border bg-card p-4">
          <h2 className="mb-2 font-medium">Workflows</h2>
          <ul className="space-y-1">
            {workflows.map((wf) => (
              <li key={wf.id}>
                <button
                  onClick={() => nav(`/workflows/${wf.id}`)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {wf.id}
                  </span>
                  <span className="text-xs text-muted-foreground">
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
