import { usePromptTemplate } from "../api/client";

export function PromptTemplatePanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = usePromptTemplate(projectId);
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Prompt Template</h2>
        <button
          onClick={() => data && navigator.clipboard.writeText(data.template)}
          className="rounded border px-2 py-1 text-xs"
          disabled={!data}
        >
          Copy
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">loading…</p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 text-xs">
          {data?.template}
        </pre>
      )}
    </section>
  );
}
