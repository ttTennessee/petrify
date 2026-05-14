import { Link } from "react-router-dom";
import { useProjects } from "../api/client";
import { Button } from "../components/ui/button";

export default function ProjectList() {
  const { data, isLoading } = useProjects();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button asChild size="sm">
          <Link to="/projects/new">New Project</Link>
        </Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">loading…</p>}
      <ul className="divide-y rounded-md border bg-card">
        {(data ?? []).map((p) => (
          <li key={p.id} className="p-3 hover:bg-accent/50">
            <Link to={`/projects/${p.id}`} className="block">
              <div className="font-medium">{p.goal}</div>
              <div className="text-xs text-muted-foreground">
                {p.id} · {p.status} · {new Date(p.created_at).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
        {data && data.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            no projects yet
          </li>
        )}
      </ul>
    </div>
  );
}
