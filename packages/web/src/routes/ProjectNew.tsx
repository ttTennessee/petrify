import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateProject } from "../api/client";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

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
        <div className="space-y-1.5">
          <Label htmlFor="goal">Goal *</Label>
          <Textarea
            id="goal"
            required
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
        {create.error && (
          <p className="text-sm text-destructive">
            {(create.error as Error).message}
          </p>
        )}
      </form>
    </div>
  );
}
