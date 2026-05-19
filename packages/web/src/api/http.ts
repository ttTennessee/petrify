import type { PreflightFailure } from "@petrify/shared";
import { getApiBase } from "./transport";

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

export interface HttpOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
  signal?: AbortSignal;
  // Skip default JSON content-type — caller handles raw body/response.
  raw?: boolean;
  // Custom error path invoked on !res.ok before the default ApiError throw.
  // If it returns instead of throwing, the default ApiError is thrown next.
  errorParser?: (res: Response, body: unknown) => never | void | Promise<never | void>;
}

export async function http<T>(path: string, opts: HttpOptions = {}): Promise<T> {
  const { method, body, headers, signal, raw, errorParser } = opts;
  const baseHeaders: Record<string, string> = raw
    ? {}
    : { "Content-Type": "application/json" };
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    body,
    signal,
    headers: { ...baseHeaders, ...(headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({}))) as {
      error?: string;
      issues?: string[];
      failures?: PreflightFailure[];
    };
    if (errorParser) await errorParser(res, parsed);
    throw new ApiError(
      parsed.error ?? `HTTP ${res.status}`,
      parsed.issues ?? [],
      res.status,
      parsed.failures ?? [],
    );
  }
  if (res.status === 204) return undefined as T;
  if (raw) return res as unknown as T;
  return res.json() as Promise<T>;
}
