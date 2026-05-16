import { useState } from "react";
import type { RuntimeEvent } from "@petrify/shared";
import {
  useRespondPermission,
  type PermissionDecision,
} from "../api/client";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

interface OptionShape {
  id: string;
  name: string;
  kind: PermissionDecision;
}

interface PermissionPayload {
  request_id: string;
  tool_call: {
    id?: string;
    kind: string;
    title?: string | null;
    raw_input?: unknown;
  };
  options: OptionShape[];
}

function partition(options: OptionShape[]): {
  allow: OptionShape[];
  reject: OptionShape[];
} {
  const allow: OptionShape[] = [];
  const reject: OptionShape[] = [];
  for (const o of options) {
    if (o.kind === "allow_once" || o.kind === "allow_always") allow.push(o);
    else reject.push(o);
  }
  return { allow, reject };
}

export function PermissionPrompt({ event }: { event: RuntimeEvent }) {
  const p = event.payload as unknown as PermissionPayload;
  const runId = event.run_id;
  const respond = useRespondPermission();
  const [resolution, setResolution] = useState<{
    kind: PermissionDecision;
    label: string;
  } | null>(null);

  const { allow, reject } = partition(p.options ?? []);

  async function pick(opt: OptionShape) {
    if (resolution || respond.isPending) return;
    setResolution({ kind: opt.kind, label: opt.name });
    try {
      await respond.mutateAsync({
        runId,
        requestId: p.request_id,
        decision: opt.kind,
      });
    } catch (err) {
      // Rollback on failure so the user can retry. The server may also have
      // already resolved (404) — leave the resolution shown in that case.
      const status = (err as { issues?: string[] } & Error).message;
      if (!status.includes("not found")) setResolution(null);
    }
  }

  const isResolved = !!resolution;
  const toolLabel = p.tool_call.title?.trim() || p.tool_call.kind;

  return (
    <div className="mt-1 border border-accent/60 bg-accent/5 p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
          Permission
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {p.tool_call.kind}
        </span>
      </div>
      <p className="mt-1 break-words font-mono text-[11px] text-foreground/90">
        {toolLabel}
      </p>
      {!!p.tool_call.raw_input && (
        <pre className="mt-1 max-h-28 overflow-auto border-l-2 border-l-border pl-2 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(p.tool_call.raw_input, null, 2)}
        </pre>
      )}

      {isResolved ? (
        <p
          className={cn(
            "mt-2 font-mono text-[10px]",
            resolution!.kind.startsWith("allow")
              ? "text-success"
              : "text-destructive",
          )}
        >
          → {resolution!.label}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {allow.map((o) => (
            <Button
              key={o.id}
              size="sm"
              className="h-6 px-2 text-[11px]"
              disabled={respond.isPending}
              onClick={() => pick(o)}
            >
              {o.name}
            </Button>
          ))}
          {reject.map((o) => (
            <Button
              key={o.id}
              size="sm"
              variant="outline"
              className="h-6 border-destructive/50 px-2 text-[11px] text-destructive hover:bg-destructive/10"
              disabled={respond.isPending}
              onClick={() => pick(o)}
            >
              {o.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
