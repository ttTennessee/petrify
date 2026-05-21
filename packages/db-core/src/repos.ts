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
  // 完整 CRUD 在后续迁移 routes/projects.ts 时补齐。
}

export interface WorkflowsRepo {
  insert(row: {
    id: string;
    project_id: string;
    graph_json: string;
    created_at: number;
  }): Promise<void>;
  getById(id: string): WorkflowRow | undefined;
  /** routes/workflows.ts PATCH 路径只需要 graph_json,这里给个轻量变体。 */
  getGraphById(id: string): { id: string; graph_json: string } | undefined;
  listByProject(projectId: string): Array<Pick<WorkflowRow, "id" | "created_at">>;
  updateGraph(id: string, graphJson: string): Promise<void>;
  updateVerify(id: string, lastVerifyJson: string): Promise<void>;
}

export interface RunsRepo {
  // 占位 —— 等迁移 routes/runs.ts 时补。
}

export interface RunEventsRepo {
  /** append-only;实现需为 row 分配自增 id 并写入。 */
  append(row: RunEventRow): Promise<void>;
  /** 列出 run 内 id > sinceId 的事件,按 id 升序。 */
  listSince(runId: string, sinceId?: number): Array<RunEventRow & { id: number }>;
}

export interface CheckpointsRepo {
  // 占位
}

export interface GlobalConfigRepo {
  // 占位
}

export interface AdapterInstancesRepo {
  // 占位
}

export interface PermissionGrantsRepo {
  // 占位
}

export interface BreakpointsRepo {
  // 占位
}

export interface McpServersRepo {
  // 占位
}

export interface TemplatesRepo {
  // 占位
}

// 用 `_` 前缀引用未实现 Repo 的 row 类型,纯粹是 verbatim placeholder
// 防止类型在 d.ts 里被 tree-shake 掉(未来迁移时直接用)。
export type __PlaceholderRowExports = {
  _project: ProjectRow;
  _run: RunRow;
  _checkpoint: CheckpointRow;
  _globalConfig: GlobalConfigRow;
  _adapterInstance: AdapterInstanceRow;
  _permissionGrant: PermissionGrantRow;
  _breakpoint: BreakpointRow;
  _mcpServer: McpServerRow;
  _template: TemplateRow;
};
