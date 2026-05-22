// Drizzle schema —— 11 张表 + 索引,作为类型源 + drizzle-kit migration 输入。
//
// 列形状严格对齐 @petrify/db-core 的 Row 类型(types.ts);不切 text({ mode: 'json' }),
// 保留 *_json 为 TEXT 字符串,以维持 db-pearl 接口契约。

import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  goal: text("goal").notNull(),
  description: text("description"),
  constraints_json: text("constraints_json"),
  preferred_tools_json: text("preferred_tools_json"),
  runtime_policy_json: text("runtime_policy_json"),
  status: text("status").notNull().default("draft"),
  created_at: integer("created_at").notNull(),
});

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  project_id: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  graph_json: text("graph_json").notNull(),
  last_verify_json: text("last_verify_json"),
  created_at: integer("created_at").notNull(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at"),
    error: text("error"),
    resumed_from: text("resumed_from"),
    target_node_id: text("target_node_id"),
    last_checkpoint_id: text("last_checkpoint_id"),
  },
  (t) => ({
    idxWorkflowStarted: index("idx_runs_workflow_started").on(
      t.workflow_id,
      t.started_at,
    ),
  }),
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    event_id: text("event_id").notNull(),
    run_id: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    node_id: text("node_id"),
    type: text("type").notNull(),
    payload_json: text("payload_json").notNull(),
    ts: integer("ts").notNull(),
  },
  (t) => ({
    idxRun: index("idx_run_events_run").on(t.run_id, t.id),
  }),
);

export const checkpoints = sqliteTable(
  "checkpoints",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    label: text("label"),
    blob_json: text("blob_json").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => ({
    // DESC 子句 drizzle-kit 在 schema 层不直接支持;靠 ORDER BY 在查询里走 DESC。
    // 索引列顺序保持 (run_id, created_at) 即可被复用。
    idxRun: index("idx_checkpoints_run").on(t.run_id, t.created_at),
  }),
);

export const globalConfig = sqliteTable("global_config", {
  key: text("key").primaryKey(),
  value_json: text("value_json").notNull(),
  updated_at: integer("updated_at").notNull(),
});

export const adapterInstances = sqliteTable(
  "adapter_instances",
  {
    name: text("name").primaryKey(),
    catalog_id: text("catalog_id"),
    kind: text("kind").notNull(),
    enabled: integer("enabled").notNull().default(0),
    command: text("command"),
    args_json: text("args_json"),
    env_json: text("env_json"),
    default_cwd: text("default_cwd"),
    endpoint: text("endpoint"),
    status: text("status").notNull().default("unknown"),
    status_detail: text("status_detail"),
    last_probed_at: integer("last_probed_at"),
    keep_alive: integer("keep_alive").notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => ({
    idxEnabled: index("idx_adapter_instances_enabled").on(t.enabled),
  }),
);

export const permissionGrants = sqliteTable(
  "permission_grants",
  {
    project_id: text("project_id").notNull(),
    node_id: text("node_id").notNull(),
    tool_kind: text("tool_kind").notNull(),
    decision: text("decision").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.project_id, t.node_id, t.tool_kind] }),
  }),
);

export const breakpoints = sqliteTable(
  "breakpoints",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    node_id: text("node_id").notNull(),
    enabled: integer("enabled").notNull().default(1),
    created_at: integer("created_at").notNull(),
  },
  (t) => ({
    uniqWfNode: uniqueIndex("uniq_breakpoints_wf_node").on(
      t.workflow_id,
      t.node_id,
    ),
    idxWf: index("idx_breakpoints_wf").on(t.workflow_id),
  }),
);

export const mcpServers = sqliteTable(
  "mcp_servers",
  {
    name: text("name").primaryKey(),
    transport: text("transport").notNull(),
    command: text("command"),
    args_json: text("args_json"),
    env_json: text("env_json"),
    url: text("url"),
    headers_json: text("headers_json"),
    enabled: integer("enabled").notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => ({
    idxEnabled: index("idx_mcp_servers_enabled").on(t.enabled),
  }),
);

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    tags_json: text("tags_json"),
    graph_json: text("graph_json").notNull(),
    runtime_policy_json: text("runtime_policy_json"),
    adapter_bindings_json: text("adapter_bindings_json"),
    source_workflow_id: text("source_workflow_id"),
    origin: text("origin").notNull().default("local"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => ({
    idxName: index("idx_templates_name").on(t.name),
  }),
);

export const schema = {
  projects,
  workflows,
  runs,
  runEvents,
  checkpoints,
  globalConfig,
  adapterInstances,
  permissionGrants,
  breakpoints,
  mcpServers,
  templates,
};

// 启动时调用,确保 schema 在内存库 / 全新文件 / 已有用户库 三种情况都幂等可用。
//
// 不走 drizzle-kit migrator —— 它对已有 schema 没有 IF NOT EXISTS 容错,
// 且 server 历史上靠 ensureColumn 增量 ALTER 兼容老库。本函数把 CREATE
// 全部用 IF NOT EXISTS,把后加的列走 ensureColumn,行为与旧 server/src/db.ts
// 完全等价。
//
// 后续如要切到正式 migrator,把这里的内容替换为 `migrate(drizzleDb, ...)` 即可。
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
      error TEXT
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
      keep_alive     INTEGER NOT NULL DEFAULT 0,
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

  // 兼容老库:在已有 schema 上增量补 4 个后加的列。新建库 CREATE TABLE 里
  // 没列这些列(保持 CREATE 与历史 server/src/db.ts 一致),用 ALTER 补齐。
  ensureColumn(db, "runs", "resumed_from", "TEXT");
  ensureColumn(db, "runs", "target_node_id", "TEXT");
  ensureColumn(db, "runs", "last_checkpoint_id", "TEXT");
  ensureColumn(db, "workflows", "last_verify_json", "TEXT");
  ensureColumn(
    db,
    "adapter_instances",
    "keep_alive",
    "INTEGER NOT NULL DEFAULT 0",
  );
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

