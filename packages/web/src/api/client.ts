import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProjectInput, WorkflowGraph, RuntimeEvent } from "@petrify/shared";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
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

export function useImportWorkflow(projectId: string) {
  return useMutation({
    mutationFn: (graph: WorkflowGraph) =>
      http<{ id: string; order: string[] }>(
        `/api/projects/${projectId}/workflow`,
        { method: "POST", body: JSON.stringify(graph) },
      ),
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

export function useStartRun(workflowId: string) {
  return useMutation({
    mutationFn: () =>
      http<{ id: string }>(`/api/workflows/${workflowId}/runs`, { method: "POST" }),
  });
}

export function useRunEvents(runId: string | undefined) {
  return useQuery({
    enabled: !!runId,
    queryKey: ["run-events", runId],
    queryFn: () => http<RuntimeEvent[]>(`/api/runs/${runId}/events`),
  });
}
