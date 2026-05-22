// checkpoints 在 pearl 里被拆成 entity 图，blob_json 不再作为黑盒落地：
//
//   checkpoint        attrs = { run_id, label, created_at,
//                                saved_at, completed_node_ids[], skipped_node_ids[] }
//   cp_node_output    attrs = { run_id, node_id, value_json }
//   cp_variable       attrs = { run_id, key, value_json }
//   cp_adapter_blob   attrs = { run_id, node_id, value_json }
//
// 子实体通过 of_checkpoint 边挂回 checkpoint，由 traverse(direction:"in") 收回。
// 对外仍以 CheckpointRow.blob_json 字符串呈现，server 层零感知。
//
// 这样做的目的：让 pearl 的 at(asOfSeq)/history 能直接看到 runtime state 的
// 细粒度变更，而不是只看到一个不透明的 JSON 块。后续 Time Travel 实现可以
// 升级为直接走 pearl 而非 server 重放层。

import type { Pearl, Entity, CommitIntent } from "@petrify/pearl";
import type { CheckpointRow, CheckpointsRepo } from "@petrify/db-core";

const TYPE_CHECKPOINT = "checkpoint";
const TYPE_NODE_OUTPUT = "cp_node_output";
const TYPE_VARIABLE = "cp_variable";
const TYPE_ADAPTER_BLOB = "cp_adapter_blob";
const EDGE_OF_CHECKPOINT = "of_checkpoint";
const EDGE_OF_RUN = "of_run_checkpoint";

type DecomposedBlob = {
  run_id: string;
  saved_at: number;
  completed_node_ids: string[];
  skipped_node_ids: string[];
  node_outputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  adapter_blobs?: Record<string, unknown>;
};

export function createCheckpointsRepo(pearl: Pearl): CheckpointsRepo {
  return {
    insert(row) {
      const blob = parseBlob(row.blob_json);
      const intent: CommitIntent = {
        events: [
          {
            entityId: row.id,
            type: "Created",
            payload: {
              entityType: TYPE_CHECKPOINT,
              attrs: {
                run_id: row.run_id,
                label: row.label,
                created_at: row.created_at,
                saved_at: blob.saved_at,
                completed_node_ids: blob.completed_node_ids,
                skipped_node_ids: blob.skipped_node_ids,
              },
            },
          },
        ],
        edges: { add: [{ from: row.id, to: row.run_id, type: EDGE_OF_RUN }] },
      };

      for (const [nodeId, value] of Object.entries(blob.node_outputs)) {
        const childId = `${row.id}:out:${nodeId}`;
        intent.events!.push({
          entityId: childId,
          type: "Created",
          payload: {
            entityType: TYPE_NODE_OUTPUT,
            attrs: {
              run_id: row.run_id,
              node_id: nodeId,
              value_json: JSON.stringify(value ?? null),
            },
          },
        });
        intent.edges!.add!.push({
          from: childId,
          to: row.id,
          type: EDGE_OF_CHECKPOINT,
        });
      }

      for (const [key, value] of Object.entries(blob.variables)) {
        const childId = `${row.id}:var:${key}`;
        intent.events!.push({
          entityId: childId,
          type: "Created",
          payload: {
            entityType: TYPE_VARIABLE,
            attrs: {
              run_id: row.run_id,
              key,
              value_json: JSON.stringify(value ?? null),
            },
          },
        });
        intent.edges!.add!.push({
          from: childId,
          to: row.id,
          type: EDGE_OF_CHECKPOINT,
        });
      }

      if (blob.adapter_blobs) {
        for (const [nodeId, value] of Object.entries(blob.adapter_blobs)) {
          const childId = `${row.id}:ab:${nodeId}`;
          intent.events!.push({
            entityId: childId,
            type: "Created",
            payload: {
              entityType: TYPE_ADAPTER_BLOB,
              attrs: {
                run_id: row.run_id,
                node_id: nodeId,
                value_json: JSON.stringify(value ?? null),
              },
            },
          });
          intent.edges!.add!.push({
            from: childId,
            to: row.id,
            type: EDGE_OF_CHECKPOINT,
          });
        }
      }

      pearl.commit(intent);
    },

    listByRun(runId) {
      return pearl
        .match(TYPE_CHECKPOINT, { run_id: runId })
        .filter((e) => !e.deleted)
        .map((e) => foldCheckpoint(pearl, e))
        .sort((a, b) => b.created_at - a.created_at);
    },

    getById(id) {
      const ent = pearl.get(id);
      if (!ent || ent.type !== TYPE_CHECKPOINT || ent.deleted) return undefined;
      return foldCheckpoint(pearl, ent);
    },
  };
}

function parseBlob(json: string): DecomposedBlob {
  const raw = JSON.parse(json) as Partial<DecomposedBlob>;
  return {
    run_id: String(raw.run_id ?? ""),
    saved_at: Number(raw.saved_at ?? 0),
    completed_node_ids: Array.isArray(raw.completed_node_ids)
      ? (raw.completed_node_ids as string[])
      : [],
    skipped_node_ids: Array.isArray(raw.skipped_node_ids)
      ? (raw.skipped_node_ids as string[])
      : [],
    node_outputs:
      raw.node_outputs && typeof raw.node_outputs === "object"
        ? (raw.node_outputs as Record<string, unknown>)
        : {},
    variables:
      raw.variables && typeof raw.variables === "object"
        ? (raw.variables as Record<string, unknown>)
        : {},
    adapter_blobs:
      raw.adapter_blobs && typeof raw.adapter_blobs === "object"
        ? (raw.adapter_blobs as Record<string, unknown>)
        : undefined,
  };
}

function foldCheckpoint(pearl: Pearl, ent: Entity): CheckpointRow {
  const id = ent.id;
  const run_id = String(ent.attrs["run_id"] ?? "");
  const label = ent.attrs["label"] == null ? null : String(ent.attrs["label"]);
  const created_at = Number(ent.attrs["created_at"] ?? 0);
  const saved_at = Number(ent.attrs["saved_at"] ?? created_at);
  const completed_node_ids = toStringArray(ent.attrs["completed_node_ids"]);
  const skipped_node_ids = toStringArray(ent.attrs["skipped_node_ids"]);

  const children = pearl.traverse(id, {
    direction: "in",
    edgeType: EDGE_OF_CHECKPOINT,
  });

  const node_outputs: Record<string, unknown> = {};
  const variables: Record<string, unknown> = {};
  const adapter_blobs: Record<string, unknown> = {};
  let hasAdapterBlobs = false;

  for (const c of children) {
    if (c.deleted) continue;
    const valueJson = String(c.attrs["value_json"] ?? "null");
    const value = safeParse(valueJson);
    if (c.type === TYPE_NODE_OUTPUT) {
      node_outputs[String(c.attrs["node_id"] ?? "")] = value;
    } else if (c.type === TYPE_VARIABLE) {
      variables[String(c.attrs["key"] ?? "")] = value;
    } else if (c.type === TYPE_ADAPTER_BLOB) {
      adapter_blobs[String(c.attrs["node_id"] ?? "")] = value;
      hasAdapterBlobs = true;
    }
  }

  const blob: DecomposedBlob = {
    run_id,
    saved_at,
    completed_node_ids,
    skipped_node_ids,
    node_outputs,
    variables,
  };
  if (hasAdapterBlobs) blob.adapter_blobs = adapter_blobs;

  return {
    id,
    run_id,
    label,
    blob_json: JSON.stringify(blob),
    created_at,
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x));
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
