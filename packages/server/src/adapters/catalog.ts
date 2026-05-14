// Built-in catalog of well-known ACP-compatible CLI runners. Entries are static;
// users opt into any of these via the Adapters UI, which creates an instance
// row in `adapter_instances`. Defaults are best-effort hints — the actual probe
// uses whatever the user submits.

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  defaultKind: "spawn" | "connect";
  defaultCommand?: string;
  defaultArgs?: string[];
  homepage?: string;
}

export const ADAPTER_CATALOG: CatalogEntry[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic Claude Code, exposed via the ACP runner.",
    defaultKind: "spawn",
    defaultCommand: "claude-code-acp",
    homepage: "https://docs.claude.com/en/docs/claude-code",
  },
  {
    id: "codex",
    label: "Codex CLI",
    description: "OpenAI Codex agent (ACP-compatible build).",
    defaultKind: "spawn",
    defaultCommand: "codex",
    defaultArgs: ["acp"],
  },
  {
    id: "opencode",
    label: "opencode",
    description: "Open-source coding agent with ACP transport.",
    defaultKind: "spawn",
    defaultCommand: "opencode",
    defaultArgs: ["acp"],
    homepage: "https://opencode.ai",
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    description: "Cursor agent CLI in ACP mode.",
    defaultKind: "spawn",
    defaultCommand: "cursor-agent",
    defaultArgs: ["acp"],
  },
];

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return ADAPTER_CATALOG.find((e) => e.id === id);
}
