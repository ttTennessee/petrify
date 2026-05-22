import { nanoid } from "nanoid";
import { dbContext } from "../db-context.js";

export function ensureWorkflow(graph: unknown): string {
  const projectId = nanoid();
  const workflowId = nanoid();
  dbContext.projects.insert({
    id: projectId,
    goal: "test",
    description: null,
    constraints_json: null,
    preferred_tools_json: null,
    runtime_policy_json: null,
    status: "draft",
    created_at: Date.now(),
  });
  dbContext.workflows.insert({
    id: workflowId,
    project_id: projectId,
    graph_json: JSON.stringify(graph),
    created_at: Date.now(),
  });
  return workflowId;
}

export function createRun(workflowId: string): string {
  const runId = nanoid();
  dbContext.runs.insertMinimal({
    id: runId,
    workflow_id: workflowId,
    status: "running",
    started_at: Date.now(),
  });
  return runId;
}

export function getRunStatus(runId: string): string {
  return dbContext.runs.getStatus(runId) ?? "missing";
}

export function listRunEvents(
  runId: string,
): Array<{ type: string; node_id: string | null }> {
  return dbContext.runEvents.listTypesAndNodes(runId);
}
