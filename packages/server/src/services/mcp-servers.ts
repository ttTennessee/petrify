import { dbContext } from "../db-context.js";
import type {
  McpEnvVarSpec,
  McpHttpHeaderSpec,
  McpServerSpec,
} from "@petrify/shared";

export type McpTransport = "stdio" | "http" | "sse";

export interface McpServerRow {
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  env: McpEnvVarSpec[];
  url: string | null;
  headers: McpHttpHeaderSpec[];
  enabled: 0 | 1;
  created_at: number;
  updated_at: number;
}

interface RawRow {
  name: string;
  transport: string;
  command: string | null;
  args_json: string | null;
  env_json: string | null;
  url: string | null;
  headers_json: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function mapRow(r: RawRow): McpServerRow {
  return {
    name: r.name,
    transport: r.transport as McpTransport,
    command: r.command,
    args: r.args_json ? (JSON.parse(r.args_json) as string[]) : [],
    env: r.env_json ? (JSON.parse(r.env_json) as McpEnvVarSpec[]) : [],
    url: r.url,
    headers: r.headers_json
      ? (JSON.parse(r.headers_json) as McpHttpHeaderSpec[])
      : [],
    enabled: r.enabled ? 1 : 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function listServers(): McpServerRow[] {
  return dbContext.mcpServers.list().map((r) => mapRow(r as RawRow));
}

export function getServer(name: string): McpServerRow | null {
  const r = dbContext.mcpServers.getByName(name) as RawRow | undefined;
  return r ? mapRow(r) : null;
}

export interface McpUpsertInput {
  name: string;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  env?: McpEnvVarSpec[];
  url?: string | null;
  headers?: McpHttpHeaderSpec[];
}

export function createServer(input: McpUpsertInput): McpServerRow {
  const now = Date.now();
  dbContext.mcpServers.insert({
    name: input.name,
    transport: input.transport,
    command: input.command ?? null,
    args_json: JSON.stringify(input.args ?? []),
    env_json: JSON.stringify(input.env ?? []),
    url: input.url ?? null,
    headers_json: JSON.stringify(input.headers ?? []),
    enabled: 1,
    created_at: now,
    updated_at: now,
  });
  return getServer(input.name)!;
}

export function patchServer(
  name: string,
  patch: Partial<Omit<McpUpsertInput, "name">>,
): McpServerRow | null {
  const row = getServer(name);
  if (!row) return null;
  const next = {
    transport: patch.transport ?? row.transport,
    command: patch.command !== undefined ? patch.command : row.command,
    args: patch.args ?? row.args,
    env: patch.env ?? row.env,
    url: patch.url !== undefined ? patch.url : row.url,
    headers: patch.headers ?? row.headers,
  };
  dbContext.mcpServers.patch(name, {
    transport: next.transport,
    command: next.command,
    args_json: JSON.stringify(next.args),
    env_json: JSON.stringify(next.env),
    url: next.url,
    headers_json: JSON.stringify(next.headers),
    updated_at: Date.now(),
  });
  return getServer(name);
}

export function deleteServer(name: string): boolean {
  const info = dbContext.mcpServers.deleteByName(name);
  return info.changes > 0;
}

export function setEnabled(name: string, enabled: boolean): void {
  dbContext.mcpServers.setEnabled(name, enabled ? 1 : 0, Date.now());
}

/** Convert a stored row to the wire-format spec consumed by adapters.
 *  Disabled rows return null — callers should filter them out. */
export function rowToSpec(row: McpServerRow): McpServerSpec | null {
  if (row.transport === "stdio") {
    if (!row.command) return null;
    return {
      transport: "stdio",
      name: row.name,
      command: row.command,
      args: row.args,
      env: row.env,
    };
  }
  if (!row.url) return null;
  return {
    transport: row.transport,
    name: row.name,
    url: row.url,
    headers: row.headers,
  };
}

/** Resolve an array of server names (as stored on a WorkflowNode) into full
 *  specs, filtering out unknown / disabled entries. Safe to call with []. */
export function resolveServers(names: string[]): McpServerSpec[] {
  if (names.length === 0) return [];
  const out: McpServerSpec[] = [];
  for (const name of names) {
    const row = getServer(name);
    if (!row || !row.enabled) continue;
    const spec = rowToSpec(row);
    if (spec) out.push(spec);
  }
  return out;
}
