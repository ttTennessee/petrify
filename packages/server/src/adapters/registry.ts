import type { AgentAdapter } from "./types.js";

export interface RegistryEntry {
  adapter: AgentAdapter;
  meta?: {
    kind?: "spawn" | "connect" | "builtin";
    source?: "builtin" | "env" | "db";
    catalog_id?: string;
  };
}

const registry = new Map<string, RegistryEntry>();

export function registerAdapter(
  name: string,
  adapter: AgentAdapter,
  meta?: RegistryEntry["meta"],
): void {
  registry.set(name, { adapter, meta });
}

export function unregisterAdapter(name: string): boolean {
  return registry.delete(name);
}

export function getAdapter(name: string): AgentAdapter | undefined {
  return registry.get(name)?.adapter;
}

export function getAdapterEntry(name: string): RegistryEntry | undefined {
  return registry.get(name);
}

export function listAdapters(): string[] {
  return [...registry.keys()];
}

export function listAdapterEntries(): Array<{ name: string; meta?: RegistryEntry["meta"] }> {
  return [...registry.entries()].map(([name, entry]) => ({ name, meta: entry.meta }));
}
