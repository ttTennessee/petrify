import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export interface GlobalConfig {
  auto_run: boolean;
  permission_default_policy: "ask" | "deny-all";
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
  return res.json() as Promise<T>;
}

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => http<GlobalConfig>("/api/config"),
    staleTime: 30_000,
  });
}

export function usePatchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<GlobalConfig>) =>
      http<GlobalConfig>("/api/config", {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => qc.setQueryData(["config"], data),
  });
}
