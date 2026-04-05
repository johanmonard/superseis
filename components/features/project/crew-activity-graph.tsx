"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityGraphItem {
  id: string;
  name: string;
  pointType: string;
  predecessors: string[];
  resources: string[];
}

type ActivityNodeData = {
  label: string;
  pointType: string;
  resources: string[];
  minHeight?: number;
};

// ---------------------------------------------------------------------------
// Custom activity card node
// ---------------------------------------------------------------------------

function ActivityNode({ data, sourcePosition, targetPosition }: NodeProps<Node<ActivityNodeData>>) {
  return (
    <div
      className="w-44 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)] shadow-[0_1px_2px_var(--color-shadow-alpha)]"
      // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing for rank alignment
      style={data.minHeight ? { minHeight: data.minHeight } : undefined}
    >
      <Handle type="target" position={targetPosition ?? Position.Top} className="!bg-[var(--color-border-strong)]" />
      <div className="flex items-center gap-[var(--space-2)]">
        <span
          className={
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white " +
            (data.pointType === "SP"
              ? "bg-[var(--color-status-danger)]"
              : "bg-[var(--color-status-info)]")
          }
        >
          {data.pointType}
        </span>
        <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
          {data.label}
        </span>
      </div>
      {data.resources.length > 0 && (
        <div className="mt-[var(--space-1)] flex flex-col gap-px pl-[calc(1.25rem+var(--space-2))]">
          {data.resources.map((name) => (
            <span key={name} className="text-[10px] text-[var(--color-text-muted)] truncate">
              {name}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={sourcePosition ?? Position.Bottom} className="!bg-[var(--color-border-strong)]" />
    </div>
  );
}

const nodeTypes = { activity: ActivityNode };

// ---------------------------------------------------------------------------
// Graph configuration
// ---------------------------------------------------------------------------

export type EdgeType = "smoothstep" | "default" | "straight" | "step";
export type RankDirection = "TB" | "LR" | "BT" | "RL";

export interface GraphConfig {
  edgeType: EdgeType;
  rankDirection: RankDirection;
  nodeSpacing: number;
  rankSpacing: number;
  animated: boolean;
}

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  edgeType: "smoothstep",
  rankDirection: "TB",
  nodeSpacing: 40,
  rankSpacing: 60,
  animated: false,
};

// ---------------------------------------------------------------------------
// Layout with Dagre
// ---------------------------------------------------------------------------

const NODE_WIDTH = 176; // w-44
const BASE_NODE_HEIGHT = 48;
const RESOURCE_LINE_HEIGHT = 14;

function buildGraph(
  activities: ActivityGraphItem[],
  config: GraphConfig = DEFAULT_GRAPH_CONFIG
): { nodes: Node[]; edges: Edge[] } {
  if (activities.length === 0) return { nodes: [], edges: [] };

  const isHorizontal = config.rankDirection === "LR" || config.rankDirection === "RL";
  const sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
  const targetPosition = isHorizontal ? Position.Left : Position.Top;

  const nodes: Node[] = activities.map((act) => ({
    id: act.id,
    type: "activity",
    position: { x: 0, y: 0 },
    data: { label: act.name, pointType: act.pointType, resources: act.resources },
    sourcePosition,
    targetPosition,
  }));

  const edges: Edge[] = activities.flatMap((act) =>
    act.predecessors.map((predId) => ({
      id: `e-${predId}-${act.id}`,
      source: predId,
      target: act.id,
      type: config.edgeType,
      animated: config.animated,
    }))
  );

  // Run Dagre layout
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: config.rankDirection,
    nodesep: config.nodeSpacing,
    ranksep: config.rankSpacing,
  });

  for (const node of nodes) {
    const resCount = (node.data as ActivityNodeData).resources.length;
    const height = BASE_NODE_HEIGHT + resCount * RESOURCE_LINE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  // Group nodes by rank (y position) and find max height per rank
  const rankHeights = new Map<number, number>();
  for (const node of nodes) {
    const pos = g.node(node.id);
    const resCount = (node.data as ActivityNodeData).resources.length;
    const height = BASE_NODE_HEIGHT + resCount * RESOURCE_LINE_HEIGHT;
    const y = Math.round(pos.y);
    rankHeights.set(y, Math.max(rankHeights.get(y) ?? 0, height));
  }

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const y = Math.round(pos.y);
    const rankMax = rankHeights.get(y) ?? BASE_NODE_HEIGHT;
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - rankMax / 2 },
      data: { ...node.data, minHeight: rankMax },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider)
// ---------------------------------------------------------------------------

function CrewActivityGraphInner({
  activities,
  config,
}: {
  activities: ActivityGraphItem[];
  config: GraphConfig;
}) {
  const { nodes, edges } = React.useMemo(() => buildGraph(activities, config), [activities, config]);
  const { fitView } = useReactFlow();

  // Auto fit view whenever the graph changes — delay to let React Flow measure nodes
  React.useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.1 }), 50);
    return () => clearTimeout(t);
  }, [nodes, edges, fitView]);

  if (activities.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Add activities to see the graph
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={{
        type: config.edgeType,
        animated: config.animated,
        style: { stroke: "var(--color-border-strong)", strokeWidth: 1 },
      }}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Controls showInteractive={false} />
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-border-subtle)" />
    </ReactFlow>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export function CrewActivityGraph({
  activities,
  config = DEFAULT_GRAPH_CONFIG,
}: {
  activities: ActivityGraphItem[];
  config?: GraphConfig;
}) {
  return (
    <div className="h-full w-full">
      <ReactFlowProvider>
        <CrewActivityGraphInner activities={activities} config={config} />
      </ReactFlowProvider>
    </div>
  );
}
