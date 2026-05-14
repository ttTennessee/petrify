import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProject, useProjectWorkflows } from "../api/client";
import { ImportPanel } from "../components/ImportPanel";
import { PromptTemplatePanel } from "../components/PromptTemplatePanel";
import { FromTemplateDialog } from "../components/FromTemplateDialog";
import { Button } from "../components/ui/button";
import { Section } from "../components/section";

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useProject(projectId);
  const { data: workflows } = useProjectWorkflows(projectId);
  const [showTemplates, setShowTemplates] = useState(false);

  if (isLoading || !projectId)
    return <p className="p-6 font-mono text-xs text-muted-foreground">loading…</p>;
  if (!data)
    return <p className="p-6 font-mono text-xs text-destructive">not found</p>;

  return (
    <div className="mx-auto max-w-4xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="01"
        eyebrow="Project"
        title={data.goal}
        subtitle={
          <span className="font-mono text-[11px] text-muted-foreground">{data.id}</span>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
            From Template…
          </Button>
        }
      />

      {showTemplates && (
        <FromTemplateDialog
          projectId={projectId}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {workflows && workflows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            § Workflows
          </h2>
          <ul className="border-t border-border">
            {workflows.map((wf) => (
              <li key={wf.id}>
                <button
                  onClick={() => nav(`/workflows/${wf.id}`)}
                  className="group grid w-full grid-cols-[1fr_auto] items-center gap-6 border-b border-border px-2 py-4 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {wf.id}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      {relTime(wf.created_at)}
                    </span>
                  </div>
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
