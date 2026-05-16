import type { InvokeRequest } from "../types.js";

export function buildPromptText(req: InvokeRequest): string {
  const task = req.node.prompt?.task_prompt ?? "";
  const sys = req.node.prompt?.system_prompt;
  const inputsBlob = JSON.stringify(req.inputs, null, 2);
  const parts: string[] = [];
  if (sys) parts.push(`<system>\n${sys}\n</system>`);
  if (task) parts.push(task);
  parts.push(`<inputs>\n${inputsBlob}\n</inputs>`);
  return parts.join("\n\n");
}
