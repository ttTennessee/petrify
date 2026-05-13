import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { WorkflowGraph, NodeStatus } from "@petrify/shared";
import { NodeCard, type NodeCardData } from "./NodeCard";

const nodeTypes = { petrify: NodeCard };

const KIND_STYLE: Record<string, { stroke: string; dasharray?: string }> = {
  control: { stroke: "#0f172a" },
  data: { stroke: "#94a3b8", dasharray: "4 4" },
  resource: { stroke: "#a855f7", dasharray: "2 2" },
};

export function DagCanvas({
  graph,
  nodeStatus,
}: {
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
}) {
  const { nodes, edges } = useMemo(() => {
    const layoutNodes: Node<NodeCardData>[] = graph.nodes.map((n, idx) => ({
      id: n.id,
      type: "petrify",
      position: { x: 80 + (idx % 4) * 240, y: 80 + Math.floor(idx / 4) * 160 },
      data: { node: n, status: nodeStatus[n.id] ?? "idle" },
    }));
    const layoutEdges: Edge[] = graph.edges
      .filter((e) => e.kind !== "resource") // resource arcs render as node badges, not lines
      .map((e, i) => {
        const style = KIND_STYLE[e.kind] ?? KIND_STYLE.control!;
        return {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          label: e.kind,
          style: { stroke: style.stroke, strokeDasharray: style.dasharray },
          labelStyle: { fontSize: 10, fill: style.stroke },
        };
      });
    return { nodes: layoutNodes, edges: layoutEdges };
  }, [graph, nodeStatus]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
