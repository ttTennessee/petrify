import { useRef, useState } from "react";
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
  const fileRef = useRef<HTMLInputElement>(null);

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
    <section className="border-l-2 border-accent pl-5 py-3 space-y-3">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        § Import Blueprint
      </h2>
      <Textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"nodes":[...],"edges":[...]}'
        className="font-mono text-[11px] bg-card border-border focus-visible:ring-ring resize-none"
      />
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
        >
          Choose File
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={importWf.isPending}>
          {importWf.isPending ? "Importing…" : "Import & Compile"}
        </Button>
      </div>
      {error && (
        <pre className="whitespace-pre-wrap font-mono text-[10px] text-destructive">
          {error}
        </pre>
      )}
    </section>
  );
}
