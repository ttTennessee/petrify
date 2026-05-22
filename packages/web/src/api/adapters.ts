import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdapterInput,
  AdapterInstance,
  CatalogCategory,
  CatalogEntry,
  ProbeResult,
} from "@petrify/shared";
import { http } from "./http";

export type { AdapterInput, AdapterInstance, CatalogCategory, CatalogEntry, ProbeResult };

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

export function useSetKeepAlive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; keep_alive: boolean }) =>
      http<AdapterInstance>(
        `/api/adapters/${encodeURIComponent(vars.name)}/keep-alive`,
        {
          method: "PATCH",
          body: JSON.stringify({ keep_alive: vars.keep_alive }),
        },
      ),
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
