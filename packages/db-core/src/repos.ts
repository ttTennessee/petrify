// Repository 接口集合。
//
// 设计约定:
// - 方法名 = 当前 server 各 route 里实际用到的 SQL 操作,逆向枚举,不臆造。
// - 行类型直接复用 ./types.ts,不引入新的 DTO。
// - 时间旅行 / history 等 pearl 特有能力不在接口上暴露,以确保 SQLite/Pearl 两侧
//   都能实现。

import type {
  AdapterInstanceRow,
  BreakpointRow,
  CheckpointRow,
  GlobalConfigRow,
  McpServerRow,
  PermissionGrantRow,
  ProjectRow,
  RunEventRow,
  RunRow,
  TemplateRow,
  WorkflowRow,
} from "./types.js";

export interface ProjectsRepo {
  /** workflows.ts 用来校验 projectId 是否存在。 */
  existsById(id: string): boolean;
  insert(row: ProjectRow): void;
  list(): Array<
    Pick<ProjectRow, "id" | "goal" | "description" | "status" | "created_at">
  >;
  getById(id: string): ProjectRow | undefined;
  getGoalAndDescription(
    id: string,
  ): { goal: string; description: string | null } | undefined;
  /** routes/templates.ts 仅取 runtime_policy_json 列。 */
  getRuntimePolicy(id: string): { runtime_policy_json: string | null } | undefined;
}

export interface WorkflowsRepo {
  insert(row: {
    id: string;
    project_id: string;
    graph_json: string;
    created_at: number;
  }): Promise<void>;
  getById(id: string): WorkflowRow | undefined;
  /** routes/workflows.ts PATCH 路径只需要 graph_json。 */
  getGraphById(id: string): { id: string; graph_json: string } | undefined;
  listByProject(projectId: string): Array<Pick<WorkflowRow, "id" | "created_at">>;
  updateGraph(id: string, graphJson: string): Promise<void>;
  updateVerify(id: string, lastVerifyJson: string): Promise<void>;
  /** permission-broker.test 用,只取 project_id 列。 */
  getProjectId(id: string): { project_id: string } | undefined;
  /** routes/verification.ts、routes/runs.ts 用。 */
  getGraphAndVerify(
    id: string,
  ): { graph_json: string; last_verify_json: string | null } | undefined;
  getLastVerify(id: string): { last_verify_json: string | null } | undefined;
  /** templates.ts 用,取 id + project_id + graph_json。 */
  getForTemplate(
    id: string,
  ): { id: string; project_id: string; graph_json: string } | undefined;
}

export interface RunsRepo {
  /** routes/runs.ts 标准 run 创建。 */
  insert(row: {
    id: string;
    workflow_id: string;
    status: string;
    started_at: number;
    resumed_from?: string | null;
  }): void;
  /** routes/runs.ts single-node run 创建,额外有 target_node_id。 */
  insertSingleNode(row: {
    id: string;
    workflow_id: string;
    status: string;
    started_at: number;
    resumed_from?: string | null;
    target_node_id: string;
  }): void;
  /** test-helpers 用的最简插入。 */
  insertMinimal(row: {
    id: string;
    workflow_id: string;
    status: string;
    started_at: number;
  }): void;
  /** routes/runs.ts 列表;含 last_checkpoint_id。 */
  listByWorkflow(workflowId: string, limit: number): Array<
    Pick<
      RunRow,
      | "id"
      | "status"
      | "started_at"
      | "finished_at"
      | "error"
      | "resumed_from"
      | "target_node_id"
      | "last_checkpoint_id"
    >
  >;
  /** routes/runs.ts 详情;含 last_checkpoint_id 与 workflow_id。 */
  getById(id: string): RunRow | undefined;
  /** routes/runs.ts 仅需 id+workflow_id+status。 */
  getCore(id: string): Pick<RunRow, "id" | "workflow_id" | "status"> | undefined;
  /** routes/runs.ts 取最近 1 条 run id。 */
  getLatestByWorkflow(workflowId: string): { id: string } | undefined;
  /** scheduler.ts;status / finished_at / error 更新。 */
  updateStatus(
    id: string,
    patch: { status: string; finished_at: number | null; error: string | null },
  ): void;
  /** runs.ts / checkpoints.ts;指向最后一次 checkpoint。 */
  updateLastCheckpoint(id: string, checkpointId: string): void;
  /** test-helpers 用。 */
  getStatus(id: string): string | undefined;
}

export interface RunEventsRepo {
  /** append-only;实现需为 row 分配自增 id 并写入。 */
  append(row: RunEventRow): Promise<void>;
  /** 列出 run 内 id > sinceId 的事件,按 id 升序。 */
  listSince(runId: string, sinceId?: number): Array<RunEventRow & { id: number }>;
  /** test-helpers 用,只取 type+node_id。 */
  listTypesAndNodes(
    runId: string,
  ): Array<{ type: string; node_id: string | null }>;
}

export interface CheckpointsRepo {
  insert(row: CheckpointRow): void;
  /** 含 blob_json,按 created_at DESC。 */
  listByRun(runId: string): CheckpointRow[];
  getById(id: string): CheckpointRow | undefined;
}

export interface GlobalConfigRepo {
  list(): GlobalConfigRow[];
  upsert(key: string, valueJson: string, updatedAt: number): void;
  /** 测试清理用。 */
  deleteByKey(key: string): void;
}

export interface AdapterInstancesRepo {
  list(): AdapterInstanceRow[];
  getByName(name: string): AdapterInstanceRow | undefined;
  insert(row: AdapterInstanceRow): void;
  patch(
    name: string,
    patch: {
      catalog_id: string | null;
      kind: string;
      command: string | null;
      args_json: string | null;
      env_json: string | null;
      default_cwd: string | null;
      endpoint: string | null;
      updated_at: number;
    },
  ): void;
  deleteByName(name: string): { changes: number };
  setEnabled(name: string, enabled: 0 | 1, updatedAt: number): void;
  setStatus(
    name: string,
    patch: {
      status: string;
      status_detail: string | null;
      last_probed_at: number | null;
      updated_at: number;
    },
  ): void;
}

export interface PermissionGrantsRepo {
  upsert(row: PermissionGrantRow): void;
  getDecision(
    projectId: string,
    nodeId: string,
    toolKind: string,
  ): string | undefined;
  /** 测试清理。 */
  deleteAll(): void;
}

export interface BreakpointsRepo {
  listByWorkflow(workflowId: string): BreakpointRow[];
  findByWorkflowAndNode(
    workflowId: string,
    nodeId: string,
  ): BreakpointRow | undefined;
  insert(row: BreakpointRow): void;
  setEnabled(id: string, enabled: 0 | 1): void;
  deleteByWorkflowAndNode(
    workflowId: string,
    nodeId: string,
  ): { changes: number };
  /** scheduler 热路径,存在性检查。 */
  hasEnabled(workflowId: string, nodeId: string): boolean;
}

export interface McpServersRepo {
  list(): McpServerRow[];
  getByName(name: string): McpServerRow | undefined;
  insert(row: McpServerRow): void;
  patch(
    name: string,
    patch: {
      transport: string;
      command: string | null;
      args_json: string | null;
      env_json: string | null;
      url: string | null;
      headers_json: string | null;
      updated_at: number;
    },
  ): void;
  deleteByName(name: string): { changes: number };
  setEnabled(name: string, enabled: 0 | 1, updatedAt: number): void;
}

export interface TemplatesRepo {
  list(): TemplateRow[];
  getById(id: string): TemplateRow | undefined;
  findByName(name: string): { id: string } | undefined;
  insert(row: TemplateRow): void;
  deleteById(id: string): { changes: number };
}
