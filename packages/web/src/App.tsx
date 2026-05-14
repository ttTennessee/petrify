import { Link, NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { ThemeToggle } from "./components/theme-toggle";
import { Separator } from "./components/ui/separator";
import { cn } from "./lib/utils";

function NavItem({
  to,
  idx,
  end,
  children,
}: {
  to: string;
  idx: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "relative pb-1 transition-colors",
          isActive
            ? "text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-accent"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      <span className="mr-1.5 opacity-40">{idx} ─</span>
      {children}
    </NavLink>
  );
}

export default function App() {
  const { t } = useTranslation("nav");
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-20 shrink-0 items-end justify-between border-b border-border bg-background/85 px-8 pb-3 backdrop-blur-sm">
        <Link to="/" className="leading-none">
          <div className="font-display text-2xl tracking-tight">
            Petrify<span className="text-accent">.</span>
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {t("subtitle")}
          </div>
        </Link>
        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider">
          <NavItem to="/" idx="01" end>
            {t("projects")}
          </NavItem>
          <NavItem to="/templates" idx="02">
            {t("templates")}
          </NavItem>
          <NavItem to="/adapters" idx="03">
            {t("adapters")}
          </NavItem>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <ThemeToggle />
          <LanguageSwitcher />
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
