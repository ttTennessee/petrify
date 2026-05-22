// 行类型直接照搬 server 当前 column 形状,含 *_json 字符串字段。
// 两套实现都基于这些 row 类型对接,避免引入新概念。

export type ProjectRow = {
  id: string;
  goal: string;
  description: string | null;
  constraints_json: string | null;
  preferred_tools_json: string | null;
  runtime_policy_json: string | null;
  status: string;
  created_at: number;
};

export type WorkflowRow = {
  id: string;
  project_id: string;
  graph_json: string;
  last_verify_json: string | null;
  created_at: number;
};

export type RunRow = {
  id: string;
  workflow_id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  error: string | null;
  resumed_from: string | null;
  target_node_id: string | null;
  last_checkpoint_id: string | null;
};

export type RunEventRow = {
  /** 自增 id;append 时由实现分配,调用方传入时忽略。 */
  id?: number;
  event_id: string;
  run_id: string;
  node_id: string | null;
  type: string;
  payload_json: string;
  ts: number;
};

export type CheckpointRow = {
  id: string;
  run_id: string;
  label: string | null;
  blob_json: string;
  created_at: number;
};

export type GlobalConfigRow = {
  key: string;
  value_json: string;
  updated_at: number;
};

export type AdapterInstanceRow = {
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
};

export type PermissionGrantRow = {
  project_id: string;
  node_id: string;
  tool_kind: string;
  decision: string;
  created_at: number;
};

export type BreakpointRow = {
  id: string;
  workflow_id: string;
  node_id: string;
  enabled: number;
  created_at: number;
};

export type McpServerRow = {
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
};

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  tags_json: string | null;
  graph_json: string;
  runtime_policy_json: string | null;
  adapter_bindings_json: string | null;
  source_workflow_id: string | null;
  origin: string;
  created_at: number;
  updated_at: number;
};
