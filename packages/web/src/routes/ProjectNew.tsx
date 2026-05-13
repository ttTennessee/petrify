import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject } from "../api/client";

export default function ProjectNew() {
  const nav = useNavigate();
  const create = useCreateProject();
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">New Project</h1>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await create.mutateAsync({
            goal,
            description: description || undefined,
          });
          nav(`/projects/${r.id}`);
        }}
      >
        <label className="block text-sm">
          <div className="mb-1 font-medium">Goal *</div>
          <textarea
            required
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            rows={3}
          />
        </label>
        <label className="block text-sm">
          <div className="mb-1 font-medium">Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            rows={4}
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create"}
        </button>
        {create.error && (
          <p className="text-sm text-red-600">{(create.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
