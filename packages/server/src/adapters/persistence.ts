import { db } from "../db.js";
import { registerAdapter, unregisterAdapter } from "./registry.js";
import { AcpAdapter } from "./acp.js";
import { permissionBroker } from "./acp/permission-broker.js";

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
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function listInstances(): AdapterInstanceRow[] {
  const rows = db
    .prepare(`SELECT * FROM adapter_instances ORDER BY created_at ASC`)
    .all() as RawRow[];
  return rows.map(mapRow);
}

export function getInstance(name: string): AdapterInstanceRow | null {
  const r = db
    .prepare(`SELECT * FROM adapter_instances WHERE name = ?`)
    .get(name) as RawRow | undefined;
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
  db.prepare(
    `INSERT INTO adapter_instances
      (name, catalog_id, kind, enabled, command, args_json, env_json, default_cwd, endpoint, status, status_detail, last_probed_at, created_at, updated_at)
     VALUES (@name, @catalog_id, @kind, 0, @command, @args_json, @env_json, @default_cwd, @endpoint, 'unknown', NULL, NULL, @created_at, @updated_at)`,
  ).run({
    name: input.name,
    catalog_id: input.catalog_id ?? null,
    kind: input.kind,
    command: input.command ?? null,
    args_json: JSON.stringify(input.args ?? []),
    env_json: JSON.stringify(input.env ?? {}),
    default_cwd: input.default_cwd ?? null,
    endpoint: input.endpoint ?? null,
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
  db.prepare(
    `UPDATE adapter_instances
       SET catalog_id=@catalog_id, kind=@kind, command=@command,
           args_json=@args_json, env_json=@env_json, default_cwd=@default_cwd,
           endpoint=@endpoint, enabled=0,
           status='unknown', status_detail=NULL, last_probed_at=NULL,
           updated_at=@updated_at
     WHERE name=@name`,
  ).run({
    name,
    catalog_id: next.catalog_id,
    kind: next.kind,
    command: next.command,
    args_json: JSON.stringify(next.args),
    env_json: JSON.stringify(next.env),
    default_cwd: next.default_cwd,
    endpoint: next.endpoint,
    updated_at: Date.now(),
  });
  // Editing implies disabling — drop from runtime registry.
  unregisterAdapter(name);
  return getInstance(name);
}

export function deleteInstance(name: string): boolean {
  unregisterAdapter(name);
  const info = db.prepare(`DELETE FROM adapter_instances WHERE name = ?`).run(name);
  return info.changes > 0;
}

export function setEnabled(name: string, enabled: boolean): void {
  db.prepare(
    `UPDATE adapter_instances SET enabled = ?, updated_at = ? WHERE name = ?`,
  ).run(enabled ? 1 : 0, Date.now(), name);
}

export function setStatus(
  name: string,
  status: AdapterStatus,
  detail: string | null,
): void {
  db.prepare(
    `UPDATE adapter_instances
       SET status = ?, status_detail = ?, last_probed_at = ?, updated_at = ?
     WHERE name = ?`,
  ).run(status, detail, Date.now(), Date.now(), name);
}

export function buildAdapterFromRow(row: AdapterInstanceRow): AcpAdapter {
  if (row.kind === "connect") {
    throw new Error("connect mode is not implemented yet");
  }
  if (!row.command) {
    throw new Error(`adapter '${row.name}' has no command configured`);
  }
  return new AcpAdapter({
    command: row.command,
    args: row.args,
    env: row.env,
    defaultCwd: row.default_cwd ?? undefined,
    onPermission: (ctx) => permissionBroker.request(ctx),
  });
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
    } catch (err) {
      console.warn(
        `[petrify] failed to restore adapter '${row.name}': ${(err as Error).message}`,
      );
      setStatus(row.name, "error", (err as Error).message);
    }
  }
}
