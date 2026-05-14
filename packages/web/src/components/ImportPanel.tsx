import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WorkflowGraphSchema } from "@petrify/shared";
import { useImportWorkflow } from "../api/client";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function ImportPanel({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const importWf = useImportWorkflow(projectId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setError(`invalid JSON: ${(e as Error).message}`);
      return;
    }
    const parsed = WorkflowGraphSchema.safeParse(raw);
    if (!parsed.success) {
      setError(
        "schema validation failed:\n" +
          parsed.error.issues
            .map((i) => `· ${i.path.join(".")}: ${i.message}`)
            .join("\n"),
      );
      return;
    }
    try {
      const r = await importWf.mutateAsync(parsed.data);
      nav(`/workflows/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onFile(file: File) {
    setText(await file.text());
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-2 font-medium">Import Blueprint</h2>
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"nodes":[...],"edges":[...]}'
        className="font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-3">
        <input
          type="file"
          accept="application/json"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
        />
        <Button size="sm" onClick={onSubmit} disabled={importWf.isPending}>
          {importWf.isPending ? "Importing…" : "Import & Compile"}
        </Button>
      </div>
      {error && (
        <pre className="mt-2 whitespace-pre-wrap text-xs text-destructive">
          {error}
        </pre>
      )}
    </section>
  );
}
