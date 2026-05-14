import { Link } from "react-router-dom";
import { useProjects } from "../api/client";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Section } from "../components/section";

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusVariant(status: string): "accent" | "success" | "outline" | "destructive" | "warning" {
  switch (status) {
    case "active": return "accent";
    case "completed": return "success";
    case "failed": return "destructive";
    default: return "outline";
  }
}

export default function ProjectList() {
  const { data, isLoading } = useProjects();
  const projects = data ?? [];

  return (
    <div className="mx-auto max-w-5xl overflow-y-auto h-full px-8 py-10 space-y-10">
      <Section
        number="01"
        eyebrow="Projects"
        title={
          <>
            Workflows,{" "}
            <span className="italic text-accent">verified.</span>
          </>
        }
        subtitle="Import, compile and run verifiable agent workflows."
        meta={projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? "s" : ""}` : undefined}
        actions={
          <Button asChild size="sm">
            <Link to="/projects/new">+ New Project</Link>
          </Button>
        }
      />

      {isLoading && (
        <p className="font-mono text-xs text-muted-foreground">loading…</p>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="font-display text-2xl italic text-muted-foreground">
            no projects yet.
          </p>
          <Button asChild variant="ghost">
            <Link to="/projects/new">Create your first project →</Link>
          </Button>
        </div>
      )}

      {projects.length > 0 && (
        <ul className="border-t border-border">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="group grid grid-cols-[6rem_1fr_auto] items-center gap-6 border-b border-border py-4 transition-colors hover:bg-muted/40 px-2"
              >
                <span className="font-mono text-[11px] text-muted-foreground truncate">
                  {p.id.slice(0, 8)}
                </span>
                <span className="font-display text-lg truncate">{p.goal}</span>
                <div className="flex items-center gap-3">
                  <Badge variant={statusVariant(p.status)} dot>
                    {p.status}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {relTime(p.created_at as number)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
