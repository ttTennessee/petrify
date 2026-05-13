import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WorkflowGraphSchema } from "@petrify/shared";
import { useImportWorkflow } from "../api/client";

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
          parsed.error.issues.map((i) => `· ${i.path.join(".")}: ${i.message}`).join("\n"),
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
    <section className="rounded-md border bg-white p-4">
      <h2 className="mb-2 font-medium">Import Blueprint</h2>
      <textarea
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"nodes":[...],"edges":[...]}'
        className="w-full rounded border px-3 py-2 font-mono text-xs"
      />
      <div className="mt-2 flex items-center gap-3">
        <input
          type="file"
          accept="application/json"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-xs"
        />
        <button
          onClick={onSubmit}
          disabled={importWf.isPending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {importWf.isPending ? "Importing…" : "Import & Compile"}
        </button>
      </div>
      {error && <pre className="mt-2 whitespace-pre-wrap text-xs text-red-600">{error}</pre>}
    </section>
  );
}
