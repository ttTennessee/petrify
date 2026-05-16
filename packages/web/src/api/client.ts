import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProjectInput,
  WorkflowGraph,
  RuntimeEvent,
  VerificationReport,
  DryRunReport,
  Template,
  TemplateSummary,
  TemplateExport,
  Breakpoint,
} from "@petrify/shared";

export interface PreflightFailure {
  node_ref: string;
  node_id: string;
  adapter: string;
  reason: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly issues: string[] = [],
    public readonly status: number = 0,
    public readonly failures: PreflightFailure[] = [],
  ) {
    super(message);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: string[];
      failures?: PreflightFailure[];
    };
    throw new ApiError(
      body.error ?? `HTTP ${res.status}`,
      body.issues ?? [],
      res.status,
      body.failures ?? [],
    );
  }
  return res.json() as Promise<T>;
}

export interface ProjectSummary {
  id: string;
  goal: string;
  description: string | null;
  status: string;
  created_at: number;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => http<ProjectSummary[]>("/api/projects"),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["projects", id],
    queryFn: () => http<ProjectSummary & Record<string, unknown>>(`/api/projects/${id}`),
  });
}

export function useCreateProject() {
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      http<{ id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function usePromptTemplate(projectId: string | undefined) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["prompt-template", projectId],
    queryFn: () => http<{ template: string }>(`/api/projects/${projectId}/prompt-template`),
  });
}

export interface GenerateWorkflowResult {
  workflowId: string;
  attempts: number;
  order: string[];
}

export class GenerateApiError extends Error {
  constructor(
    message: string,
    public readonly stage?: string,
    public readonly attempts?: number,
    public readonly raw?: string,
    public readonly issues?: unknown,
  ) {
    super(message);
  }
}

export function useGenerateWorkflow(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (adapter: string) => {
      const res = await fetch(`/api/projects/${projectId}/generate-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adapter }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        stage?: string;
        attempts?: number;
        raw?: string;
        issues?: unknown;
        workflowId?: string;
        order?: string[];
      };
      if (!res.ok) {
        throw new GenerateApiError(
          body.error ?? `HTTP ${res.status}`,
          body.stage,
          body.attempts,
          body.raw,
          body.issues,
        );
      }
      return {
        workflowId: body.workflowId!,
        attempts: body.attempts ?? 1,
        order: body.order ?? [],
      } as GenerateWorkflowResult;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-workflows", projectId] }),
  });
}

export function useImportWorkflow(projectId: string) {
  return useMutation({
    mutationFn: (graph: WorkflowGraph) =>
      http<{ id: string; order: string[] }>(
        `/api/projects/${projectId}/workflow`,
        { method: "POST", body: JSON.stringify(graph) },
      ),
  });
}

export interface WorkflowSummary {
  id: string;
  created_at: number;
}

export function useProjectWorkflows(projectId: string | undefined) {
  return useQuery({
    enabled: !!projectId,
    queryKey: ["project-workflows", projectId],
    queryFn: () => http<WorkflowSummary[]>(`/api/projects/${projectId}/workflows`),
  });
}

export function useWorkflow(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["workflow", id],
    queryFn: () =>
      http<{ id: string; project_id: string; graph: WorkflowGraph }>(`/api/workflows/${id}`),
  });
}

export function usePatchNode(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      nodeId,
      patch,
    }: {
      nodeId: string;
      patch: Record<string, unknown>;
    }) =>
      http<{ id: string; graph: WorkflowGraph }>(
        `/api/workflows/${workflowId}/nodes/${nodeId}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    onSuccess: (data) => {
      qc.setQueryData(
        ["workflow", workflowId],
        (
          old:
            | { id: string; project_id: string; graph: WorkflowGraph }
            | undefined,
        ) => (old ? { ...old, graph: data.graph } : old),
      );
      qc.invalidateQueries({ queryKey: ["verify", workflowId] });
    },
  });
}

export function useStartRun(workflowId: string) {
  return useMutation({
    mutationFn: (opts: { stepMode?: boolean } = {}) =>
      http<{ id: string }>(
        `/api/workflows/${workflowId}/runs${opts.stepMode ? "?step=true" : ""}`,
        { method: "POST" },
      ),
  });
}

export function useRunSingleNode(workflowId: string) {
  return useMutation({
    mutationFn: (nodeId: string) =>
      http<{ id: string; target_node_id: string }>(
        `/api/workflows/${workflowId}/nodes/${nodeId}/run`,
        { method: "POST" },
      ),
  });
}

export function useRunEvents(runId: string | undefined) {
  return useQuery({
    enabled: !!runId,
    queryKey: ["run-events", runId],
    queryFn: () => http<RuntimeEvent[]>(`/api/runs/${runId}/events`),
  });
}

export interface RunSummary {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled" | "paused";
  started_at: number;
  finished_at: number | null;
  error: string | null;
  resumed_from?: string | null;
  last_checkpoint_id?: string | null;
  target_node_id?: string | null;
}

export function useWorkflowRuns(workflowId: string | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ["workflow-runs", workflowId],
    queryFn: () => http<RunSummary[]>(`/api/workflows/${workflowId}/runs`),
    refetchInterval: 2000,
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    enabled: !!runId,
    queryKey: ["run", runId],
    queryFn: () => http<RunSummary & { workflow_id: string }>(`/api/runs/${runId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === undefined ? 1500 : false;
    },
  });
}

export interface CheckpointSummary {
  id: string;
  run_id: string;
  label: string | null;
  created_at: number;
  blob: {
    completed_node_ids: string[];
    skipped_node_ids: string[];
  };
}

export function useCheckpoints(runId: string | undefined, isLive = true) {
  return useQuery({
    enabled: !!runId,
    queryKey: ["checkpoints", runId],
    queryFn: () => http<CheckpointSummary[]>(`/api/runs/${runId}/checkpoints`),
    refetchInterval: isLive ? 2000 : false,
  });
}

export function useResumeRun() {
  return useMutation({
    mutationFn: ({
      runId,
      checkpointId,
      stepMode,
    }: {
      runId: string;
      checkpointId?: string;
      stepMode?: boolean;
    }) =>
      http<{ id: string; resumed_from: string }>(`/api/runs/${runId}/resume`, {
        method: "POST",
        body: JSON.stringify({
          ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
          ...(stepMode ? { step_mode: true } : {}),
        }),
      }),
  });
}

export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) =>
      http<{ cancelled: boolean }>(`/api/runs/${runId}/cancel`, { method: "POST" }),
  });
}

// ---- M4: breakpoints ------------------------------------------------------

export function useBreakpoints(workflowId: string | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ["breakpoints", workflowId],
    queryFn: () =>
      http<Breakpoint[]>(`/api/workflows/${workflowId}/breakpoints`),
  });
}

export function useSetBreakpoint(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, enabled }: { nodeId: string; enabled: boolean }) =>
      http<Breakpoint>(
        `/api/workflows/${workflowId}/breakpoints/${nodeId}`,
        { method: "PUT", body: JSON.stringify({ enabled }) },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["breakpoints", workflowId] }),
  });
}

export function useDeleteBreakpoint(workflowId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) =>
      http<{ deleted: number }>(
        `/api/workflows/${workflowId}/breakpoints/${nodeId}`,
        { method: "DELETE" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["breakpoints", workflowId] }),
  });
}

export function useContinueBreakpoint() {
  return useMutation({
    mutationFn: ({ runId, nodeId }: { runId: string; nodeId: string }) =>
      http<{ continued: boolean }>(
        `/api/runs/${runId}/breakpoints/${nodeId}/continue`,
        { method: "POST" },
      ),
  });
}

export type PermissionDecision =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always"
  | "cancelled";

export function useRespondPermission() {
  return useMutation({
    mutationFn: ({
      runId,
      requestId,
      decision,
    }: {
      runId: string;
      requestId: string;
      decision: PermissionDecision;
    }) =>
      http<{ ok: true }>(
        `/api/runs/${runId}/permissions/${requestId}/respond`,
        { method: "POST", body: JSON.stringify({ decision }) },
      ),
  });
}

export function useVerifyWorkflow(workflowId: string | undefined) {
  return useQuery({
    enabled: !!workflowId,
    queryKey: ["verify", workflowId],
    queryFn: () => http<VerificationReport | null>(`/api/workflows/${workflowId}/verify`),
  });
}

export function useRunVerify(workflowId: string) {
  return useMutation({
    mutationFn: () =>
      http<VerificationReport>(`/api/workflows/${workflowId}/verify`, { method: "POST" }),
  });
}

export function useRunDryRun(workflowId: string) {
  return useMutation({
    mutationFn: () =>
      http<DryRunReport>(`/api/workflows/${workflowId}/dry-run`, { method: "POST" }),
  });
}

// ---- M5: templates ---------------------------------------------------------

export function useTemplates(filters?: { q?: string; tag?: string }) {
  const qs = new URLSearchParams();
  if (filters?.q) qs.set("q", filters.q);
  if (filters?.tag) qs.set("tag", filters.tag);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return useQuery({
    queryKey: ["templates", filters?.q ?? "", filters?.tag ?? ""],
    queryFn: () => http<TemplateSummary[]>(`/api/templates${suffix}`),
  });
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: ["template", id],
    queryFn: () => http<Template>(`/api/templates/${id}`),
  });
}

export function useSaveAsTemplate() {
  return useMutation({
    mutationFn: (input: {
      workflowId: string;
      name: string;
      description?: string;
      tags?: string[];
    }) =>
      http<{ id: string }>(`/api/templates`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useImportTemplate() {
  return useMutation({
    mutationFn: (data: TemplateExport) =>
      http<{ id: string }>(`/api/templates/import`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });
}

export function useInstantiateTemplate() {
  return useMutation({
    mutationFn: ({ templateId, projectId }: { templateId: string; projectId: string }) =>
      http<{ workflowId: string; order: string[] }>(
        `/api/templates/${templateId}/instantiate`,
        { method: "POST", body: JSON.stringify({ projectId }) },
      ),
  });
}

export function useDeleteTemplate() {
  return useMutation({
    mutationFn: (id: string) =>
      http<{ deleted: boolean }>(`/api/templates/${id}`, { method: "DELETE" }),
  });
}

export function templateExportUrl(id: string): string {
  return `/api/templates/${id}/export`;
}
