import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Resolve to an absolute path so it doesn't depend on the parent process's
// cwd — important under Tauri sidecar where cwd may be the app bundle dir.
const RAW_DB_PATH = process.env.PETRIFY_DB ?? "./data/petrify.sqlite";
const DB_PATH = RAW_DB_PATH === ":memory:" ? ":memory:" : resolve(RAW_DB_PATH);

if (DB_PATH !== ":memory:") {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function closeDb(): void {
  try {
    db.close();
  } catch {
    /* ignore double-close */
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    description TEXT,
    constraints_json TEXT,
    preferred_tools_json TEXT,
    runtime_policy_json TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    graph_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    error TEXT,
    resumed_from TEXT
  );

  CREATE TABLE IF NOT EXISTS run_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    node_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, id);

  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    label TEXT,
    blob_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_checkpoints_run ON checkpoints(run_id, created_at DESC);
`);

try {
  const cols = db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "resumed_from")) {
    db.exec(`ALTER TABLE runs ADD COLUMN resumed_from TEXT`);
  }
} catch {
  /* ignore */
}

try {
  const cols = db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "target_node_id")) {
    db.exec(`ALTER TABLE runs ADD COLUMN target_node_id TEXT`);
  }
} catch {
  /* ignore */
}

db.exec(`
  CREATE TABLE IF NOT EXISTS global_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

try {
  const cols = db.prepare(`PRAGMA table_info(workflows)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "last_verify_json")) {
    db.exec(`ALTER TABLE workflows ADD COLUMN last_verify_json TEXT`);
  }
} catch {
  /* ignore */
}

db.exec(`
  CREATE TABLE IF NOT EXISTS adapter_instances (
    name           TEXT PRIMARY KEY,
    catalog_id     TEXT,
    kind           TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 0,
    command        TEXT,
    args_json      TEXT,
    env_json       TEXT,
    default_cwd    TEXT,
    endpoint       TEXT,
    status         TEXT NOT NULL DEFAULT 'unknown',
    status_detail  TEXT,
    last_probed_at INTEGER,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_adapter_instances_enabled ON adapter_instances(enabled);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS permission_grants (
    project_id TEXT NOT NULL,
    node_id    TEXT NOT NULL,
    tool_kind  TEXT NOT NULL,
    decision   TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, node_id, tool_kind)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS breakpoints (
    id          TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    node_id     TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL,
    UNIQUE(workflow_id, node_id)
  );
  CREATE INDEX IF NOT EXISTS idx_breakpoints_wf ON breakpoints(workflow_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    name         TEXT PRIMARY KEY,
    transport    TEXT NOT NULL,
    command      TEXT,
    args_json    TEXT,
    env_json     TEXT,
    url          TEXT,
    headers_json TEXT,
    enabled      INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    tags_json TEXT,
    graph_json TEXT NOT NULL,
    runtime_policy_json TEXT,
    adapter_bindings_json TEXT,
    source_workflow_id TEXT,
    origin TEXT NOT NULL DEFAULT 'local',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);
`);
