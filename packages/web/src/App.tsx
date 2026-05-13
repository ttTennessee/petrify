import { Link, Outlet } from "react-router-dom";

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-white px-6 py-3 shadow-sm">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Petrify
        </Link>
        <span className="ml-3 text-xs text-slate-500">
          Verifiable Agent Workflow Runtime · M1
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
