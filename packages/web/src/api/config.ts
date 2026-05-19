import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GlobalConfig } from "@petrify/shared";
import { http } from "./http";

export type { GlobalConfig };

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
