// Built-in catalog of well-known ACP-compatible CLI runners. Entries are static;
// users opt into any of these via the Adapters UI, which creates an instance
// row in `adapter_instances`. Defaults are best-effort hints — the actual probe
// uses whatever the user submits.
//
// Command/args are aligned with the official ACP registry:
// https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json

export type CatalogCategory = "acp" | "other";

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  category: CatalogCategory;
  defaultKind: "spawn" | "connect";
  defaultCommand?: string;
  defaultArgs?: string[];
  homepage?: string;
  icon?: string;
}

const ICON_BASE = "https://cdn.agentclientprotocol.com/registry/v1/latest";

export const ADAPTER_CATALOG: CatalogEntry[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic Claude Code, exposed via the official ACP wrapper.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "npx",
    defaultArgs: ["-y", "@agentclientprotocol/claude-agent-acp"],
    homepage: "https://docs.claude.com/en/docs/claude-code",
    icon: `${ICON_BASE}/claude-acp.svg`,
  },
  {
    id: "codex",
    label: "Codex CLI",
    description: "OpenAI Codex agent via the Zed-maintained ACP wrapper.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "npx",
    defaultArgs: ["-y", "@zed-industries/codex-acp"],
    homepage: "https://github.com/openai/codex",
    icon: `${ICON_BASE}/codex-acp.svg`,
  },
  {
    id: "opencode",
    label: "opencode",
    description: "Open-source coding agent with ACP transport.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "opencode",
    defaultArgs: ["acp"],
    homepage: "https://opencode.ai",
    icon: `${ICON_BASE}/opencode.svg`,
  },
  {
    id: "cursor",
    label: "Cursor Agent",
    description: "Cursor agent CLI in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "cursor-agent",
    defaultArgs: ["acp"],
    homepage: "https://cursor.com",
    icon: `${ICON_BASE}/cursor.svg`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    description: "Google Gemini CLI in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "npx",
    defaultArgs: ["-y", "@google/gemini-cli", "--acp"],
    homepage: "https://github.com/google-gemini/gemini-cli",
    icon: `${ICON_BASE}/gemini.svg`,
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot CLI",
    description: "GitHub Copilot CLI in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "npx",
    defaultArgs: ["-y", "@github/copilot", "--acp"],
    homepage: "https://github.com/features/copilot",
    icon: `${ICON_BASE}/github-copilot-cli.svg`,
  },
  {
    id: "qwen-code",
    label: "Qwen Code",
    description: "Alibaba Qwen Code CLI in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "npx",
    defaultArgs: ["-y", "@qwen-code/qwen-code", "--acp"],
    homepage: "https://github.com/QwenLM/qwen-code",
    icon: `${ICON_BASE}/qwen-code.svg`,
  },
  {
    id: "goose",
    label: "goose",
    description: "Block's goose agent in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "goose",
    defaultArgs: ["acp"],
    homepage: "https://block.github.io/goose/",
    icon: `${ICON_BASE}/goose.svg`,
  },
  {
    id: "amp",
    label: "Amp",
    description: "Sourcegraph Amp coding agent via the ACP wrapper.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "amp-acp",
    homepage: "https://ampcode.com",
    icon: `${ICON_BASE}/amp-acp.svg`,
  },
  {
    id: "kilo",
    label: "Kilo",
    description: "Kilo Code CLI in ACP mode.",
    category: "acp",
    defaultKind: "spawn",
    defaultCommand: "kilo",
    defaultArgs: ["acp"],
    homepage: "https://kilocode.ai",
    icon: `${ICON_BASE}/kilo.svg`,
  },
];

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return ADAPTER_CATALOG.find((e) => e.id === id);
}
