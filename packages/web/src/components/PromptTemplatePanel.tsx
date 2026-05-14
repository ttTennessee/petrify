import { usePromptTemplate } from "../api/client";
import { Button } from "./ui/button";

export function PromptTemplatePanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = usePromptTemplate(projectId);
  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Prompt Template</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => data && navigator.clipboard.writeText(data.template)}
          disabled={!data}
        >
          Copy
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">loading…</p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
          {data?.template}
        </pre>
      )}
    </section>
  );
}
