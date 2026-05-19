import { nanoid } from "nanoid";
import type { RuntimeEvent, WorkflowNode } from "@petrify/shared";
import { getAdapter } from "../adapters/registry.js";
import { compile, CompileError, type ExecutablePlan } from "../runtime/compiler.js";
import { buildPromptTemplate } from "./prompt-template.js";

export class GenerateError extends Error {
  constructor(
    message: string,
    readonly stage: "adapter" | "parse" | "compile",
    readonly raw: string,
    readonly attempts: number,
    readonly issues?: unknown,
  ) {
    super(message);
  }
}

export interface GenerateOptions {
  adapterName: string;
  goal: string;
  description: string | null;
  /** Retry once with the validation error appended to the prompt. Defaults true. */
  retryOnInvalid?: boolean;
}

export interface GenerateResult {
  plan: ExecutablePlan;
  raw: string;
  attempts: number;
}

export async function generateWorkflowJson(
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const adapter = getAdapter(opts.adapterName);
  if (!adapter) {
    throw new GenerateError(
      `adapter "${opts.adapterName}" not registered`,
      "adapter",
      "",
      0,
    );
  }

  const basePrompt = buildPromptTemplate(opts.goal, opts.description);
  const maxAttempts = opts.retryOnInvalid === false ? 1 : 2;

  let lastRaw = "";
  let lastErr: GenerateError | null = null;
  let priorErrorContext = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\n# Previous attempt failed validation\n${priorErrorContext}\n\nPrevious output:\n${lastRaw}\n\nReturn ONLY a corrected JSON object.`;

    let raw: string;
    try {
      raw = await invokeForText(adapter, prompt);
    } catch (err) {
      throw new GenerateError(
        `adapter invocation failed: ${(err as Error).message}`,
        "adapter",
        "",
        attempt,
      );
    }
    lastRaw = raw;

    const extracted = extractJson(raw);
    if (!extracted) {
      lastErr = new GenerateError(
        "no JSON object found in adapter output",
        "parse",
        raw,
        attempt,
      );
      priorErrorContext = lastErr.message;
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted);
    } catch (err) {
      lastErr = new GenerateError(
        `invalid JSON: ${(err as Error).message}`,
        "parse",
        raw,
        attempt,
      );
      priorErrorContext = lastErr.message;
      continue;
    }

    try {
      const plan = compile(parsed);
      return { plan, raw, attempts: attempt };
    } catch (err) {
      if (err instanceof CompileError) {
        lastErr = new GenerateError(err.message, "compile", raw, attempt, err.issues);
        priorErrorContext = `${err.message}\n${JSON.stringify(err.issues ?? [], null, 2)}`;
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new GenerateError("unknown failure", "adapter", lastRaw, maxAttempts);
}

async function invokeForText(
  adapter: ReturnType<typeof getAdapter> & {},
  promptText: string,
): Promise<string> {
  const node: WorkflowNode = {
    id: "__compile__",
    ref: "__compile__",
    title: "Compile workflow",
    adapter: { name: "compile-stub" },
    dependencies: [],
    inputs: {},
    outputs: {},
    resources: [],
    runtime: { timeout: 120, retries: 0, checkpoint: false },
    prompt: { task_prompt: promptText },
    on_failure: { strategy: "abort" },
    status: "idle",
    mcp_servers: [],
  };

  const req = {
    invocationId: nanoid(),
    runId: nanoid(),
    projectId: null,
    node,
    inputs: {},
  };

  const chunks: string[] = [];
  let completed = false;
  let failureReason: string | null = null;

  for await (const ev of adapter.invoke(req) as AsyncIterable<RuntimeEvent>) {
    if (ev.type === "OutputGenerated") {
      const payload = ev.payload as { output?: { text?: string }; text?: string };
      const text = payload.output?.text ?? payload.text;
      if (typeof text === "string") chunks.push(text);
    } else if (ev.type === "NodeCompleted") {
      completed = true;
      const payload = ev.payload as { output?: { text?: string } };
      const text = payload.output?.text;
      if (typeof text === "string" && chunks.length === 0) chunks.push(text);
    } else if (ev.type === "NodeFailed") {
      const payload = ev.payload as { reason?: string };
      failureReason = payload.reason ?? "node failed";
    }
  }

  if (failureReason) throw new Error(failureReason);
  if (!completed && chunks.length === 0) {
    throw new Error("adapter produced no output");
  }
  return chunks.join("");
}

/** Pull the first balanced JSON object out of arbitrary text (handles ```json fences). */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenced ? fenced[1]! : text;

  const start = haystack.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < haystack.length; i++) {
    const ch = haystack[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  return null;
}
