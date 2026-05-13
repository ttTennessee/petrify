import type { AgentAdapter } from "./types.js";

const registry = new Map<string, AgentAdapter>();

export function registerAdapter(name: string, adapter: AgentAdapter): void {
  registry.set(name, adapter);
}

export function getAdapter(name: string): AgentAdapter | undefined {
  return registry.get(name);
}

export function listAdapters(): string[] {
  return [...registry.keys()];
}
