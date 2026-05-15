import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export type CatalogCategory = "acp" | "other";

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  category: CatalogCategory;
  defaultKind: "spawn" | "connect";
  defaultCommand?: string;
  defaultArgs?: string[];
  homepage?: string;
}

export interface AdapterInstance {
  name: string;
  catalog_id: string | null;
  kind: "spawn" | "connect" | "builtin";
  enabled: 0 | 1;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  default_cwd: string | null;
  endpoint: string | null;
  status: "ok" | "error" | "unknown";
  status_detail: string | null;
  last_probed_at: number | null;
  created_at: number;
  updated_at: number;
  live: boolean;
  read_only?: boolean;
}

export interface ProbeResult {
  ok: boolean;
  protocolVersion?: number;
  capabilities?: unknown;
  durationMs?: number;
  error?: string;
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
    };
    throw new ApiError(body.error ?? `HTTP ${res.status}`, body.issues ?? []);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function useAdapterCatalog() {
  return useQuery({
    queryKey: ["adapters", "catalog"],
    queryFn: () => http<CatalogEntry[]>("/api/adapters/catalog"),
    staleTime: Infinity,
  });
}

export function useAdapters() {
  return useQuery({
    queryKey: ["adapters"],
    queryFn: () => http<AdapterInstance[]>("/api/adapters"),
  });
}

export interface AdapterInput {
  name: string;
  catalog_id?: string | null;
  kind: "spawn" | "connect";
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  default_cwd?: string | null;
  endpoint?: string | null;
}

export function useCreateAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdapterInput) =>
      http<AdapterInstance>("/api/adapters", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}

export function usePatchAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; patch: Partial<AdapterInput> }) =>
      http<AdapterInstance>(`/api/adapters/${encodeURIComponent(vars.name)}`, {
        method: "PATCH",
        body: JSON.stringify(vars.patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}

export function useDeleteAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<void>(`/api/adapters/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}

export function useProbeAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<ProbeResult>(`/api/adapters/${encodeURIComponent(name)}/probe`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}

export function useEnableAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<ProbeResult>(`/api/adapters/${encodeURIComponent(name)}/enable`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}

export function useDisableAdapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<{ ok: boolean }>(`/api/adapters/${encodeURIComponent(name)}/disable`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adapters"] }),
  });
}
