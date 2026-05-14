import { usePromptTemplate } from "../api/client";
import { Button } from "./ui/button";

export function PromptTemplatePanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = usePromptTemplate(projectId);
  return (
    <section className="border-l-2 border-accent pl-5 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          § Prompt Template
        </h2>
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
        <p className="font-mono text-xs text-muted-foreground">loading…</p>
      ) : (
        <pre className="max-h-64 overflow-auto border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
          {data?.template}
        </pre>
      )}
    </section>
  );
}
