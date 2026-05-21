// Schema 原样从 packages/server/src/db.ts 搬过来。
//
// 不优化、不调整、不引入 migration 框架 —— 本次只是搭脚手架,等所有调用点都
// 迁过来后再考虑统一处理。

import type Database from "better-sqlite3";

export function applySchema(db: Database.Database): void {
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

  // 增量 ALTER —— 保持与 server/src/db.ts 一致的兼容老库逻辑。
  ensureColumn(db, "runs", "resumed_from", "TEXT");
  ensureColumn(db, "runs", "target_node_id", "TEXT");
  ensureColumn(db, "runs", "last_checkpoint_id", "TEXT");
  ensureColumn(db, "workflows", "last_verify_json", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS global_config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS permission_grants (
      project_id TEXT NOT NULL,
      node_id    TEXT NOT NULL,
      tool_kind  TEXT NOT NULL,
      decision   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, node_id, tool_kind)
    );

    CREATE TABLE IF NOT EXISTS breakpoints (
      id          TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      node_id     TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      UNIQUE(workflow_id, node_id)
    );
    CREATE INDEX IF NOT EXISTS idx_breakpoints_wf ON breakpoints(workflow_id);

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
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch {
    /* ignore */
  }
}
