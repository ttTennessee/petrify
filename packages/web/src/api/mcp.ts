import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  McpEnvVarSpec,
  McpHttpHeaderSpec,
  McpServerSpec,
} from "@petrify/shared";
import { http } from "./http";

export type McpTransport = "stdio" | "http" | "sse";

export interface McpServerRow {
  name: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  env: McpEnvVarSpec[];
  url: string | null;
  headers: McpHttpHeaderSpec[];
  enabled: 0 | 1;
  created_at: number;
  updated_at: number;
}

export type { McpServerSpec, McpEnvVarSpec, McpHttpHeaderSpec };

export function useMcpServers() {
  return useQuery({
    queryKey: ["mcp-servers"],
    queryFn: () => http<McpServerRow[]>("/api/mcp-servers"),
  });
}

export function useCreateMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: McpServerSpec) =>
      http<McpServerRow>("/api/mcp-servers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export type McpServerPatch =
  | { transport: "stdio"; command?: string; args?: string[]; env?: McpEnvVarSpec[] }
  | { transport: "http"; url?: string; headers?: McpHttpHeaderSpec[] }
  | { transport: "sse"; url?: string; headers?: McpHttpHeaderSpec[] };

export function usePatchMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; patch: McpServerPatch }) =>
      http<McpServerRow>(`/api/mcp-servers/${encodeURIComponent(vars.name)}`, {
        method: "PATCH",
        body: JSON.stringify(vars.patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useDeleteMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<void>(`/api/mcp-servers/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useEnableMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<{ ok: boolean; enabled: boolean }>(
        `/api/mcp-servers/${encodeURIComponent(name)}/enable`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useDisableMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<{ ok: boolean; enabled: boolean }>(
        `/api/mcp-servers/${encodeURIComponent(name)}/disable`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}
