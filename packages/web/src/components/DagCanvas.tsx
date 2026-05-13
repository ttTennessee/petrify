import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { WorkflowGraph, NodeStatus, WorkflowNode } from "@petrify/shared";
import { NodeCard, type NodeCardData } from "./NodeCard";

const nodeTypes = { petrify: NodeCard };

const NODE_W = 220;
const NODE_H = 88;

const KIND_STYLE: Record<string, { stroke: string; dasharray?: string }> = {
  control: { stroke: "#0f172a" },
  data: { stroke: "#94a3b8", dasharray: "4 4" },
  resource: { stroke: "#a855f7", dasharray: "2 2" },
};

function layout(graph: WorkflowGraph) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of graph.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });

  // Only control edges + dependencies shape the layout (matches scheduler semantics).
  const refToId = new Map(graph.nodes.map((n) => [n.ref, n.id]));
  for (const n of graph.nodes) {
    for (const depRef of n.dependencies ?? []) {
      const from = refToId.get(depRef);
      if (from) g.setEdge(from, n.id);
    }
  }
  for (const e of graph.edges) {
    if (e.kind === "control") g.setEdge(e.from, e.to);
  }

  dagre.layout(g);
  return g;
}

export function DagCanvas({
  graph,
  nodeStatus,
  onSelectNode,
  selectedNodeId,
}: {
  graph: WorkflowGraph;
  nodeStatus: Record<string, NodeStatus>;
  onSelectNode?: (n: WorkflowNode | null) => void;
  selectedNodeId?: string | null;
}) {
  const { nodes, edges } = useMemo(() => {
    const g = layout(graph);

    const layoutNodes: Node<NodeCardData>[] = graph.nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        id: n.id,
        type: "petrify",
        position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
        data: {
          node: n,
          status: nodeStatus[n.id] ?? "idle",
          selected: selectedNodeId === n.id,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      };
    });

    const layoutEdges: Edge[] = graph.edges
      .filter((e) => e.kind !== "resource")
      .map((e, i) => {
        const style = KIND_STYLE[e.kind] ?? KIND_STYLE.control!;
        return {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          label: e.kind === "control" ? undefined : e.kind,
          style: { stroke: style.stroke, strokeDasharray: style.dasharray, strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: style.stroke },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
          animated: e.kind === "control",
        };
      });

    return { nodes: layoutNodes, edges: layoutEdges };
  }, [graph, nodeStatus, selectedNodeId]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => {
        const found = graph.nodes.find((x) => x.id === n.id) ?? null;
        onSelectNode?.(found);
      }}
      onPaneClick={() => onSelectNode?.(null)}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}
