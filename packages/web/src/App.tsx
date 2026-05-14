import { Link, Outlet } from "react-router-dom";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-white px-6 py-3 shadow-sm flex items-baseline gap-4">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Petrify
        </Link>
        <span className="text-xs text-slate-500">
          Verifiable Agent Workflow Runtime
        </span>
        <nav className="ml-auto flex gap-4 text-sm">
          <Link to="/" className="text-slate-700 hover:text-slate-900">
            Projects
          </Link>
          <Link to="/templates" className="text-slate-700 hover:text-slate-900">
            Templates
          </Link>
          <Link to="/adapters" className="text-slate-700 hover:text-slate-900">
            Adapters
          </Link>
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
