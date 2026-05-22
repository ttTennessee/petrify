import { dbContext } from "../db-context.js";
import { registerAdapter, unregisterAdapter } from "./registry.js";
import { AcpAdapter } from "./acp/index.js";
import { permissionBroker } from "./acp/permission-broker.js";
import type { AgentAdapter } from "./types.js";

/** Factory table: protocol-keyed builders. Default `"acp"` builds AcpAdapter;
 *  additional protocols (openai-tools, http, ...) register their own factory
 *  via {@link registerAdapterFactory} without changing this file's callers. */
type AdapterFactory = (row: AdapterInstanceRow) => AgentAdapter;
const adapterFactories = new Map<string, AdapterFactory>();

export function registerAdapterFactory(
  protocol: string,
  factory: AdapterFactory,
): void {
  adapterFactories.set(protocol, factory);
}

export type AdapterKind = "spawn" | "connect";
export type AdapterStatus = "ok" | "error" | "unknown";

export interface AdapterInstanceRow {
  name: string;
  catalog_id: string | null;
  kind: AdapterKind;
  enabled: 0 | 1;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  default_cwd: string | null;
  endpoint: string | null;
  status: AdapterStatus;
  status_detail: string | null;
  last_probed_at: number | null;
  keep_alive: 0 | 1;
  created_at: number;
  updated_at: number;
}

interface RawRow {
  name: string;
  catalog_id: string | null;
  kind: string;
  enabled: number;
  command: string | null;
  args_json: string | null;
  env_json: string | null;
  default_cwd: string | null;
  endpoint: string | null;
  status: string;
  status_detail: string | null;
  last_probed_at: number | null;
  keep_alive: number;
  created_at: number;
  updated_at: number;
}

function mapRow(r: RawRow): AdapterInstanceRow {
  return {
    name: r.name,
    catalog_id: r.catalog_id,
    kind: r.kind as AdapterKind,
    enabled: r.enabled ? 1 : 0,
    command: r.command,
    args: r.args_json ? (JSON.parse(r.args_json) as string[]) : [],
    env: r.env_json ? (JSON.parse(r.env_json) as Record<string, string>) : {},
    default_cwd: r.default_cwd,
    endpoint: r.endpoint,
    status: (r.status as AdapterStatus) ?? "unknown",
    status_detail: r.status_detail,
    last_probed_at: r.last_probed_at,
    keep_alive: r.keep_alive ? 1 : 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function listInstances(): AdapterInstanceRow[] {
  return dbContext.adapterInstances.list().map((r) => mapRow(r as RawRow));
}

export function getInstance(name: string): AdapterInstanceRow | null {
  const r = dbContext.adapterInstances.getByName(name) as RawRow | undefined;
  return r ? mapRow(r) : null;
}

export interface UpsertInput {
  name: string;
  catalog_id?: string | null;
  kind: AdapterKind;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  default_cwd?: string | null;
  endpoint?: string | null;
}

export function createInstance(input: UpsertInput): AdapterInstanceRow {
  const now = Date.now();
  dbContext.adapterInstances.insert({
    name: input.name,
    catalog_id: input.catalog_id ?? null,
    kind: input.kind,
    enabled: 0,
    command: input.command ?? null,
    args_json: JSON.stringify(input.args ?? []),
    env_json: JSON.stringify(input.env ?? {}),
    default_cwd: input.default_cwd ?? null,
    endpoint: input.endpoint ?? null,
    status: "unknown",
    status_detail: null,
    last_probed_at: null,
    keep_alive: 0,
    created_at: now,
    updated_at: now,
  });
  return getInstance(input.name)!;
}

export function patchInstance(
  name: string,
  patch: Partial<UpsertInput>,
): AdapterInstanceRow | null {
  const row = getInstance(name);
  if (!row) return null;
  const next = {
    catalog_id: patch.catalog_id !== undefined ? patch.catalog_id : row.catalog_id,
    kind: patch.kind ?? row.kind,
    command: patch.command !== undefined ? patch.command : row.command,
    args: patch.args ?? row.args,
    env: patch.env ?? row.env,
    default_cwd: patch.default_cwd !== undefined ? patch.default_cwd : row.default_cwd,
    endpoint: patch.endpoint !== undefined ? patch.endpoint : row.endpoint,
  };
  dbContext.adapterInstances.patch(name, {
    catalog_id: next.catalog_id,
    kind: next.kind,
    command: next.command,
    args_json: JSON.stringify(next.args),
    env_json: JSON.stringify(next.env),
    default_cwd: next.default_cwd,
    endpoint: next.endpoint,
    // 编辑配置不应丢失保活意图 —— 透传当前值。
    keep_alive: row.keep_alive,
    updated_at: Date.now(),
  });
  // Editing implies disabling — drop from runtime registry.
  unregisterAdapter(name);
  return getInstance(name);
}

export function deleteInstance(name: string): boolean {
  unregisterAdapter(name);
  const info = dbContext.adapterInstances.deleteByName(name);
  return info.changes > 0;
}

export function setEnabled(name: string, enabled: boolean): void {
  dbContext.adapterInstances.setEnabled(name, enabled ? 1 : 0, Date.now());
}

export function setKeepAlive(name: string, keepAlive: boolean): void {
  dbContext.adapterInstances.setKeepAlive(name, keepAlive ? 1 : 0, Date.now());
}

export function setStatus(
  name: string,
  status: AdapterStatus,
  detail: string | null,
): void {
  const now = Date.now();
  dbContext.adapterInstances.setStatus(name, {
    status,
    status_detail: detail,
    last_probed_at: now,
    updated_at: now,
  });
}

function defaultAcpFactory(row: AdapterInstanceRow): AgentAdapter {
  if (!row.command) {
    throw new Error(`adapter '${row.name}' has no command configured`);
  }
  return new AcpAdapter({
    command: row.command,
    args: row.args,
    env: row.env,
    defaultCwd: row.default_cwd ?? undefined,
    instanceName: row.name,
    keepAlive: row.keep_alive === 1,
    onPermission: (ctx) => permissionBroker.request(ctx),
  });
}
adapterFactories.set("acp", defaultAcpFactory);

/** Pick a protocol key for a row. Today catalog entries are all ACP; the
 *  catalog_id is used as the lookup so future entries can carry distinct
 *  protocols without schema change. */
function protocolOf(row: AdapterInstanceRow): string {
  // For now every persisted instance is ACP-based. Future: catalog entries
  // will declare an explicit `protocol` field.
  return "acp";
}

export function buildAdapterFromRow(row: AdapterInstanceRow): AgentAdapter {
  if (row.kind === "connect") {
    throw new Error("connect mode is not implemented yet");
  }
  const factory = adapterFactories.get(protocolOf(row));
  if (!factory) {
    throw new Error(`no adapter factory registered for protocol '${protocolOf(row)}'`);
  }
  return factory(row);
}

export function restoreEnabledAdapters(): void {
  const rows = listInstances().filter((r) => r.enabled === 1);
  for (const row of rows) {
    try {
      const adapter = buildAdapterFromRow(row);
      registerAdapter(row.name, adapter, {
        kind: row.kind,
        source: "db",
        catalog_id: row.catalog_id ?? undefined,
      });
      console.log(`[petrify] restored adapter '${row.name}' (${row.kind})`);
      if (row.keep_alive === 1 && adapter instanceof AcpAdapter) {
        adapter.prewarm().then(
          () =>
            console.log(`[petrify] prewarmed adapter '${row.name}'`),
          (err) => {
            const msg = (err as Error).message;
            console.warn(
              `[petrify] prewarm failed for '${row.name}': ${msg}`,
            );
            setStatus(row.name, "error", msg);
          },
        );
      }
    } catch (err) {
      console.warn(
        `[petrify] failed to restore adapter '${row.name}': ${(err as Error).message}`,
      );
      setStatus(row.name, "error", (err as Error).message);
    }
  }
}
