import { useParams } from "react-router-dom";
import { useProject } from "../api/client";
import { ImportPanel } from "../components/ImportPanel";
import { PromptTemplatePanel } from "../components/PromptTemplatePanel";

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { data, isLoading } = useProject(projectId);
  if (isLoading || !projectId) return <p className="p-6 text-sm text-slate-500">loading…</p>;
  if (!data) return <p className="p-6 text-sm text-red-600">not found</p>;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-semibold">{data.goal}</h1>
        <p className="text-xs text-slate-500">{data.id}</p>
      </header>
      <PromptTemplatePanel projectId={projectId} />
      <ImportPanel projectId={projectId} />
    </div>
  );
}
