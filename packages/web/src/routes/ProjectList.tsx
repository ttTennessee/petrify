import { Link } from "react-router-dom";
import { useProjects } from "../api/client";

export default function ProjectList() {
  const { data, isLoading } = useProjects();
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Link
          to="/projects/new"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
        >
          New Project
        </Link>
      </div>
      {isLoading && <p className="text-sm text-slate-500">loading…</p>}
      <ul className="divide-y rounded-md border bg-white">
        {(data ?? []).map((p) => (
          <li key={p.id} className="p-3 hover:bg-slate-50">
            <Link to={`/projects/${p.id}`} className="block">
              <div className="font-medium">{p.goal}</div>
              <div className="text-xs text-slate-500">
                {p.id} · {p.status} · {new Date(p.created_at).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
        {data && data.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-400">no projects yet</li>
        )}
      </ul>
    </div>
  );
}
