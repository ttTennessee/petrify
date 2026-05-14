export function buildPromptTemplate(goal: string, description: string | null): string {
  return [
    "You are a workflow planner for Petrify (a Verifiable Agent Workflow Runtime).",
    "Produce a JSON workflow graph that conforms to the schema below.",
    "",
    `# Goal`,
    goal,
    "",
    description ? `# Notes\n${description}\n` : "",
    `# Schema (PRD §6.3 / §6.4)`,
    "```json",
    JSON.stringify(
      {
        nodes: [
          {
            id: "<uuid>",
            ref: "<unique slug>",
            title: "<human title>",
            adapter: { name: "mock", version: "^0.1" },
            dependencies: ["<ref of prerequisite>"],
            inputs: { key: "value or $.variables.x" },
            outputs: { name: "artifact://path or $.variables.x" },
            condition: null,
            loop: null,
            resources: [],
            runtime: { timeout: 300, retries: 0, checkpoint: true },
            prompt: { system_prompt: "...", task_prompt: "..." },
            on_failure: { strategy: "abort" },
          },
        ],
        edges: [
          { from: "<node_id>", to: "<node_id>", kind: "control" },
        ],
      },
      null,
      2,
    ),
    "```",
    "",
    "# Constraints",
    "- Use adapter.name = \"mock\" for every node (M1 only registers the mock adapter).",
    "- Keep the graph acyclic in `kind=control` edges.",
    "- Refs must be unique slugs (snake_case).",
    "- Emit ONLY the JSON object, no prose.",
  ]
    .filter(Boolean)
    .join("\n");
}
