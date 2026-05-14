import { cn } from "../lib/utils";

interface SectionProps {
  number: string;
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Section({ number, eyebrow, title, subtitle, meta, actions, className }: SectionProps) {
  return (
    <header className={cn("border-b border-border pb-6", className)}>
      <div className="flex items-baseline gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>
          {number} / {eyebrow}
        </span>
        <span className="h-px flex-1 bg-border" />
        {meta && <span>{meta}</span>}
        {actions && <div className="flex items-center">{actions}</div>}
      </div>
      <h1 className="mt-3 font-display text-5xl font-normal tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
      )}
    </header>
  );
}
