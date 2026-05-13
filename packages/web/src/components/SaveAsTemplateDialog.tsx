import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSaveAsTemplate } from "../api/client";

interface Props {
  workflowId: string;
  onClose: () => void;
}

export function SaveAsTemplateDialog({ workflowId, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const qc = useQueryClient();
  const save = useSaveAsTemplate();

  const submit = async () => {
    if (!name.trim()) return;
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await save.mutateAsync({
      workflowId,
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
    });
    qc.invalidateQueries({ queryKey: ["templates"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-md border bg-white p-5 shadow-lg">
        <h2 className="mb-3 text-base font-semibold">Save as Template</h2>
        <label className="mb-2 block text-xs font-medium text-slate-600">Name</label>
        <input
          autoFocus
          className="mb-3 w-full rounded border px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. cyberpunk story pipeline"
        />
        <label className="mb-2 block text-xs font-medium text-slate-600">Description</label>
        <textarea
          className="mb-3 h-20 w-full resize-none rounded border px-2 py-1.5 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="mb-2 block text-xs font-medium text-slate-600">
          Tags (comma-separated)
        </label>
        <input
          className="mb-4 w-full rounded border px-2 py-1.5 text-sm"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="writing, demo"
        />
        {save.isError && (
          <p className="mb-2 text-xs text-rose-600">
            {(save.error as Error).message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || save.isPending}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
