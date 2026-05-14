import { getAdapter, listAdapterEntries } from "../adapters/registry.js";

export interface AvailableAdapter {
  name: string;
  capabilities: string[];
  kind?: "spawn" | "connect" | "builtin";
}

/** Snapshot of adapters currently registered, exposed for prompt construction. */
export function listAvailableAdapters(): AvailableAdapter[] {
  return listAdapterEntries().map(({ name, meta }) => {
    const caps = getAdapter(name)?.manifest().capabilities ?? [];
    return { name, capabilities: caps, kind: meta?.kind };
  });
}

export function buildPromptTemplate(
  goal: string,
  description: string | null,
  adapters: AvailableAdapter[] = listAvailableAdapters(),
): string {
  const adapterList = adapters.length
    ? adapters
        .map((a) => {
          const caps = a.capabilities.length ? a.capabilities.join(", ") : "(none reported)";
          const kind = a.kind ? ` [${a.kind}]` : "";
          return `- \`${a.name}\`${kind} — capabilities: ${caps}`;
        })
        .join("\n")
    : "- (no adapters registered — workflow will fail to execute until one is registered)";

  // Hint the planner about which adapter type each registered instance uses,
  // so it knows whether `prompt` / `inputs.emit_variables` are appropriate.
  const acpish = adapters.filter(
    (a) => a.capabilities.includes("streaming") && a.name !== "mock",
  );
  const mockish = adapters.filter((a) => a.name === "mock");
  const adapterHints: string[] = [];
  if (mockish.length) {
    adapterHints.push(
      "- `mock`: instant echo, no real work. Use `inputs.emit_variables` to push values into `$.variables`. Ignores `prompt`.",
    );
  }
  if (acpish.length) {
    const names = acpish.map((a) => `\`${a.name}\``).join(" / ");
    adapterHints.push(
      `- ${names}: real ACP agent(s). MUST set \`prompt.task_prompt\` (and usually \`prompt.system_prompt\`). \`inputs\` is appended as an \`<inputs>\` block; upstream node outputs are NOT auto-injected — pass them through \`inputs\` explicitly.`,
    );
  }

  return [
    "You are Petrify's workflow planner. Turn the user's goal + notes into ONE JSON workflow that Petrify's compiler accepts.",
    "",
    "# Output contract",
    "Emit a single JSON object — no prose, no markdown fences, no comments. Shape:",
    "```",
    `{ "nodes": [...], "edges": [], "runtime_policy": { "pools": { "<name>": { "capacity": <int> } } } }`,
    "```",
    "- `edges` is usually `[]`; express ordering through each node's `dependencies` (array of upstream `ref`s).",
    "- `runtime_policy.pools` is required only if any node declares `resources[]`.",
    "",
    "# Available adapters in this Petrify instance",
    "Use ONLY these names in `node.adapter.name`. Do not invent adapter names.",
    "",
    adapterList,
    adapterHints.length ? "\n" + adapterHints.join("\n") : "",
    "",
    "Pick the adapter that actually matches each step. Prefer real adapters for steps the user clearly wants performed; fall back to `mock` only for placeholders, fan-in/fan-out coordination nodes, or when nothing real is registered.",
    "",
    "# WorkflowNode — required fields",
    "- `id`: unique string (e.g. `n_fetch`).",
    "- `ref`: unique snake_case slug — referenced by `dependencies` and expressions.",
    "- `title`: short human label.",
    `- \`adapter\`: \`{ "name": "<one of the registered names above>" }\`.`,
    "- `dependencies`: array of upstream **`ref`s** (not ids); `[]` for roots.",
    "- `inputs`: object (can be empty). For ACP nodes, this is your channel for passing data the agent must read.",
    "- `outputs`: object (can be empty). Convention: `{ \"text\": \"$.outputs.<this_ref>.text\" }` for ACP nodes.",
    "",
    "# Optional fields",
    "- `prompt`: `{ system_prompt, task_prompt }` — REQUIRED for ACP-style adapters.",
    "- `condition`: expression string; node is skipped when false (downstream still runs, just doesn't see this node's outputs).",
    "- `loop`: `{ max_iterations: int, exit_condition: \"<expr>\" }` — re-runs after completion until exit_condition is true.",
    "- `resources`: `[{ name: \"<pool>\", amount: int, release: true }]`. Every `name` MUST also appear in `runtime_policy.pools`.",
    "- `on_failure`: `{ strategy: \"retry\"|\"skip\"|\"abort\"|\"compensate\", max_attempts?: int, backoff_ms?: int }` (default `abort`).",
    "- `runtime`: `{ timeout: <seconds>, retries: int }` (consulted by Dry Run / planning, not strict at exec).",
    "",
    "# Expression DSL (for `condition` and `loop.exit_condition`)",
    "Scopes: `$.variables.<k>` · `$.outputs.<ref>.<k>` · `$.env.<K>`.",
    "Operators: `+ - * / %`, `== != < > <= >=`, `&& || !` (also keywords `and` `or`).",
    "Literals: numbers, `'string'`, `\"string\"`, `true`, `false`, `null`.",
    "Disallowed: function calls, object/array literals, assignment, any eval.",
    "Examples: `$.outputs.intake.score > 0.8` · `$.variables.ready == true && !$.variables.fatal`.",
    "",
    "# Hard constraints (compile fails otherwise)",
    "1. `dependencies` + control edges form a DAG (no cycles).",
    "2. `id` and `ref` are globally unique.",
    "3. Every `resources[].name` MUST be declared in `runtime_policy.pools`.",
    "4. ACP-style nodes MUST have `prompt.task_prompt` — empty prompt yields meaningless output.",
    "5. Upstream node outputs are NOT auto-fed into prompts. Pass them through `inputs` explicitly, e.g.",
    `   \`"inputs": { "prev_text": "$.outputs.draft.text" }\` — and reference \`inputs.prev_text\` in the task_prompt.`,
    "6. Don't write `\"condition\": null` — omit the field instead.",
    "",
    "# ACP node prompt writing tips",
    "- `system_prompt`: role + output format constraints (e.g. \"output only valid JSON\"). Node-specific, not the whole workflow's goal.",
    "- `task_prompt`: describe the concrete action AND name the `inputs.<key>` fields the agent should read.",
    "- End with an explicit output contract so downstream `$.outputs.<ref>.text` is usable by `condition`/dataflow.",
    "- Thinking / chain-of-thought is NOT included in `output.text` — final answer must be in the actual reply.",
    "- For prompts prone to empty / drifted output, set `on_failure.strategy: \"retry\", max_attempts: 2-3`.",
    "",
    "# Example 1 — linear with a conditional step (all mock)",
    "```json",
    `{ "nodes": [
  { "id":"n_seed","ref":"seed","title":"Gather requirements","adapter":{"name":"mock"},
    "dependencies":[],"inputs":{"emit_variables":{"need_review":true}},"outputs":{} },
  { "id":"n_draft","ref":"draft","title":"Write draft","adapter":{"name":"mock"},
    "dependencies":["seed"],"inputs":{},"outputs":{} },
  { "id":"n_review","ref":"review","title":"Review","adapter":{"name":"mock"},
    "dependencies":["draft"],"inputs":{},"outputs":{},
    "condition":"$.variables.need_review == true" },
  { "id":"n_publish","ref":"publish","title":"Publish","adapter":{"name":"mock"},
    "dependencies":["review"],"inputs":{},"outputs":{} }
], "edges": [] }`,
    "```",
    "",
    "# Example 2 — mock prep + real ACP analysis + mock summary gate",
    `Replace \`<acp>\` below with one of the real adapter names listed above (NOT \`mock\`).`,
    "```json",
    `{ "nodes": [
  { "id":"n_prep","ref":"prep","title":"Prepare inputs","adapter":{"name":"mock"},
    "dependencies":[],"inputs":{"emit_variables":{"dataset":"q1_report"}},"outputs":{} },
  { "id":"n_analyze","ref":"analyze","title":"Agent analysis","adapter":{"name":"<acp>"},
    "dependencies":["prep"],
    "inputs":{"dataset":"q1_report"},
    "outputs":{"text":"$.outputs.analyze.text"},
    "prompt":{
      "system_prompt":"You are a data analyst. Be concise.",
      "task_prompt":"Read the dataset name from inputs.dataset. Produce the single most important finding as one sentence. Output only that sentence."
    },
    "runtime":{"timeout":180,"retries":1},
    "on_failure":{"strategy":"retry","max_attempts":2,"backoff_ms":2000} },
  { "id":"n_summary","ref":"summary","title":"Summarize","adapter":{"name":"mock"},
    "dependencies":["analyze"],"inputs":{},"outputs":{},
    "condition":"$.outputs.analyze.text != ''" }
], "edges": [] }`,
    "```",
    "",
    "# Design principles (apply them, don't recite them)",
    "- Decompose into atomic, individually retryable nodes — one `ref` = one thing.",
    "- Prefer `dependencies` over explicit control edges. Reach for `edges` only when you really need typed (data/resource) arcs.",
    "- Use `condition` for optional branches instead of placeholder nodes.",
    "- For loops, ensure something inside the loop body updates a variable that `exit_condition` reads — otherwise it will hit `max_iterations` and fail.",
    "- Resource pool `capacity` should leave slack (>=2 for shared rate-limited resources); capacity 1 deadlocks easily.",
    "- Validate the topology with cheap `mock` placeholders first if the user's intent is ambiguous — but produce a real workflow now, you only get one shot.",
    "",
    "# User input",
    "## Goal",
    goal,
    description ? `\n## Notes\n${description}` : "",
    "",
    "Now emit the JSON object — and nothing else.",
  ]
    .filter(Boolean)
    .join("\n");
}
