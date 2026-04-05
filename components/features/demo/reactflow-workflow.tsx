"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Controls,
  Panel,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type EdgeMarker,
  type Connection,
  type NodeProps,
  type OnSelectionChangeParams,
  Handle,
  Position,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "completed" | "ongoing" | "todo";

type StepData = {
  label: string;
  description: string;
  status: StepStatus;
  number: number;
  onCycleStatus: (id: string) => void;
};

type EdgeType = "default" | "straight" | "step" | "smoothstep";

// ---------------------------------------------------------------------------
// Custom step node
// ---------------------------------------------------------------------------

function StepNode({ id, data, selected }: NodeProps<Node<StepData>>) {
  const statusClasses =
    data.status === "completed"
      ? "bg-[var(--color-status-success)] text-white"
      : data.status === "ongoing"
        ? "bg-[var(--color-status-info)] text-white"
        : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]";

  return (
    <div
      className={
        "w-48 rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] p-[var(--space-3)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors " +
        (selected
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          : "border-[var(--color-border-subtle)]")
      }
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--color-border-strong)]" />
      <div className="flex items-center gap-[var(--space-2)]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onCycleStatus(id);
          }}
          className="cursor-pointer"
        >
          <span
            className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-opacity hover:opacity-80 " +
              statusClasses
            }
          >
            {data.status === "completed" ? "\u2713" : data.number}
          </span>
        </button>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {data.label}
        </span>
      </div>
      <p className="mt-[var(--space-1)] text-xs text-[var(--color-text-secondary)] line-clamp-2">
        {data.description}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--color-border-strong)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gate node (fork / merge indicator)
// ---------------------------------------------------------------------------

function GateNode() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]">
      <Handle type="target" position={Position.Top} className="!bg-[var(--color-border-strong)]" />
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--color-border-strong)]" />
    </div>
  );
}

const nodeTypes = { step: StepNode, gate: GateNode };

// ---------------------------------------------------------------------------
// Initial graph
// ---------------------------------------------------------------------------

const X_CENTER = 300;
const X_LEFT = 100;
const X_RIGHT = 500;
const Y_GAP = 120;

const noop = () => {};

const initialNodes: Node[] = [
  {
    id: "s1",
    type: "step",
    position: { x: X_CENTER - 96, y: 0 },
    data: { label: "Project kickoff", description: "Align stakeholders on scope and timeline.", status: "completed", number: 1, onCycleStatus: noop },
  },
  {
    id: "s2",
    type: "step",
    position: { x: X_CENTER - 96, y: Y_GAP },
    data: { label: "Requirements gathering", description: "Collect functional and non-functional requirements.", status: "completed", number: 2, onCycleStatus: noop },
  },
  {
    id: "fork1",
    type: "gate",
    position: { x: X_CENTER - 12, y: Y_GAP * 2 },
    data: {},
  },
  {
    id: "s3a",
    type: "step",
    position: { x: X_LEFT - 96, y: Y_GAP * 2.8 },
    data: { label: "Frontend design", description: "Create wireframes and visual mockups.", status: "ongoing", number: 3, onCycleStatus: noop },
  },
  {
    id: "s4a",
    type: "step",
    position: { x: X_LEFT - 96, y: Y_GAP * 3.8 },
    data: { label: "Frontend implementation", description: "Build UI components and integrate APIs.", status: "todo", number: 4, onCycleStatus: noop },
  },
  {
    id: "s5a",
    type: "step",
    position: { x: X_LEFT - 96, y: Y_GAP * 4.8 },
    data: { label: "Frontend testing", description: "Unit and integration tests for the UI.", status: "todo", number: 5, onCycleStatus: noop },
  },
  {
    id: "s3b",
    type: "step",
    position: { x: X_RIGHT - 96, y: Y_GAP * 2.8 },
    data: { label: "Backend architecture", description: "Design data models and API contracts.", status: "ongoing", number: 3, onCycleStatus: noop },
  },
  {
    id: "s4b",
    type: "step",
    position: { x: X_RIGHT - 96, y: Y_GAP * 3.8 },
    data: { label: "Backend implementation", description: "Implement services, routes, and persistence.", status: "todo", number: 4, onCycleStatus: noop },
  },
  {
    id: "merge1",
    type: "gate",
    position: { x: X_CENTER - 12, y: Y_GAP * 5.8 },
    data: {},
  },
  {
    id: "s6",
    type: "step",
    position: { x: X_CENTER - 96, y: Y_GAP * 6.6 },
    data: { label: "Integration testing", description: "End-to-end tests after both branches complete.", status: "todo", number: 6, onCycleStatus: noop },
  },
  {
    id: "s7",
    type: "step",
    position: { x: X_CENTER - 96, y: Y_GAP * 7.6 },
    data: { label: "Deployment", description: "Release to staging, then production.", status: "todo", number: 7, onCycleStatus: noop },
  },
];

const initialEdges: Edge[] = [
  { id: "e-s1-s2", source: "s1", target: "s2" },
  { id: "e-s2-fork", source: "s2", target: "fork1" },
  { id: "e-fork-s3a", source: "fork1", target: "s3a" },
  { id: "e-fork-s3b", source: "fork1", target: "s3b" },
  { id: "e-s3a-s4a", source: "s3a", target: "s4a" },
  { id: "e-s4a-s5a", source: "s4a", target: "s5a" },
  { id: "e-s3b-s4b", source: "s3b", target: "s4b" },
  { id: "e-s5a-merge", source: "s5a", target: "merge1" },
  { id: "e-s4b-merge", source: "s4b", target: "merge1" },
  { id: "e-merge-s6", source: "merge1", target: "s6" },
  { id: "e-s6-s7", source: "s6", target: "s7" },
];

// ---------------------------------------------------------------------------
// Dagre auto-layout
// ---------------------------------------------------------------------------

const NODE_WIDTH = 192;
const NODE_HEIGHT = 72;
const GATE_SIZE = 24;

function getLayoutedElements(nodes: Node[], edges: Edge[], nodesep: number, ranksep: number) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep, ranksep });

  for (const node of nodes) {
    const isGate = node.type === "gate";
    g.setNode(node.id, {
      width: isGate ? GATE_SIZE : NODE_WIDTH,
      height: isGate ? GATE_SIZE : NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const isGate = node.type === "gate";
    const w = isGate ? GATE_SIZE : NODE_WIDTH;
    const h = isGate ? GATE_SIZE : NODE_HEIGHT;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  return { nodes: layoutedNodes, edges };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 100;
function nextId() {
  return `node-${++idCounter}`;
}

const STATUS_CYCLE: StepStatus[] = ["todo", "ongoing", "completed"];
const EDGE_TYPES: EdgeType[] = ["default", "straight", "step", "smoothstep"];
const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  default: "Bezier",
  straight: "Straight",
  step: "Step",
  smoothstep: "Smooth Step",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ReactFlowWorkflowInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  // --- Settings ---
  const [edgeType, setEdgeType] = useState<EdgeType>("default");
  const [animated, setAnimated] = useState(false);
  const [arrowheads, setArrowheads] = useState(false);
  const [nodesep, setNodesep] = useState(60);
  const [ranksep, setRanksep] = useState(80);

  // --- Status cycling ---
  const cycleStatus = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId || n.type !== "step") return n;
          const cur = (n.data as StepData).status;
          const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
          return { ...n, data: { ...n.data, status: next } };
        }),
      );
    },
    [setNodes],
  );

  // Inject cycleStatus callback into step nodes
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) =>
        n.type === "step" ? { ...n, data: { ...n.data, onCycleStatus: cycleStatus } } : n,
      ),
    [nodes, cycleStatus],
  );

  // Apply edge type, animated, and arrowhead settings to all edges
  const styledEdges = useMemo(() => {
    const marker: EdgeMarker | undefined = arrowheads
      ? { type: MarkerType.ArrowClosed, color: "var(--color-border-strong)" }
      : undefined;
    return edges.map((e) => ({
      ...e,
      type: edgeType,
      animated,
      markerEnd: marker,
    }));
  }, [edges, edgeType, animated, arrowheads]);

  // --- Selection tracking ---
  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    const stepNode = sel.find((n) => n.type === "step");
    setSelectedNodeId(stepNode?.id ?? null);
  }, []);

  // --- Re-number step nodes ---
  const renumber = useCallback(() => {
    setTimeout(() => {
      setNodes((nds) => {
        const steps = nds.filter((n) => n.type === "step").sort((a, b) => a.position.y - b.position.y);
        const numberMap = new Map<string, number>();
        steps.forEach((s, i) => numberMap.set(s.id, i + 1));
        return nds.map((n) =>
          n.type === "step" && numberMap.has(n.id)
            ? { ...n, data: { ...n.data, number: numberMap.get(n.id) } }
            : n,
        );
      });
    }, 0);
  }, [setNodes]);

  // --- Auto-layout helper ---
  const autoLayout = useCallback(() => {
    setTimeout(() => {
      setNodes((nds) => {
        setEdges((eds) => {
          const { nodes: ln, edges: le } = getLayoutedElements(nds, eds, nodesep, ranksep);
          setTimeout(() => {
            setNodes(ln);
            setEdges(le);
            requestAnimationFrame(() => fitView({ padding: 0.3 }));
          }, 0);
          return eds;
        });
        return nds;
      });
    }, 50);
  }, [setNodes, setEdges, fitView, nodesep, ranksep]);

  // --- Add step after selected node ---
  const addStepAfter = useCallback(() => {
    if (!selectedNodeId) return;
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (!selected) return;

    const id = nextId();
    const newNode: Node = {
      id,
      type: "step",
      position: { x: selected.position.x, y: selected.position.y + Y_GAP },
      data: {
        label: "New step",
        description: "Describe this step.",
        status: "todo" as StepStatus,
        number: 0,
        onCycleStatus: noop,
      },
    };

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => {
      const updated = eds.map((e) =>
        e.source === selectedNodeId ? { ...e, source: id } : e,
      );
      return [...updated, { id: `e-${selectedNodeId}-${id}`, source: selectedNodeId, target: id }];
    });

    renumber();
    autoLayout();
  }, [selectedNodeId, nodes, edges, setNodes, setEdges, renumber, autoLayout]);

  // --- Add fork after selected node ---
  const addForkAfter = useCallback(() => {
    if (!selectedNodeId) return;
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (!selected) return;

    const forkId = nextId();
    const mergeId = nextId();
    const leftId = nextId();
    const rightId = nextId();

    const baseX = selected.position.x;
    const baseY = selected.position.y + Y_GAP;

    const forkNode: Node = {
      id: forkId,
      type: "gate",
      position: { x: baseX + NODE_WIDTH / 2 - GATE_SIZE / 2, y: baseY },
      data: {},
    };
    const leftNode: Node = {
      id: leftId,
      type: "step",
      position: { x: baseX - 120, y: baseY + 80 },
      data: { label: "Branch A", description: "Left branch step.", status: "todo" as StepStatus, number: 0, onCycleStatus: noop },
    };
    const rightNode: Node = {
      id: rightId,
      type: "step",
      position: { x: baseX + 120, y: baseY + 80 },
      data: { label: "Branch B", description: "Right branch step.", status: "todo" as StepStatus, number: 0, onCycleStatus: noop },
    };
    const mergeNode: Node = {
      id: mergeId,
      type: "gate",
      position: { x: baseX + NODE_WIDTH / 2 - GATE_SIZE / 2, y: baseY + 180 },
      data: {},
    };

    setNodes((nds) => [...nds, forkNode, leftNode, rightNode, mergeNode]);
    setEdges((eds) => {
      const updated = eds.map((e) =>
        e.source === selectedNodeId ? { ...e, source: mergeId, id: `e-${mergeId}-${e.target}` } : e,
      );
      return [
        ...updated,
        { id: `e-${selectedNodeId}-${forkId}`, source: selectedNodeId, target: forkId },
        { id: `e-${forkId}-${leftId}`, source: forkId, target: leftId },
        { id: `e-${forkId}-${rightId}`, source: forkId, target: rightId },
        { id: `e-${leftId}-${mergeId}`, source: leftId, target: mergeId },
        { id: `e-${rightId}-${mergeId}`, source: rightId, target: mergeId },
      ];
    });

    renumber();
    autoLayout();
  }, [selectedNodeId, nodes, edges, setNodes, setEdges, renumber, autoLayout]);

  // --- Delete selected step node ---
  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.type !== "step") return;

    const incoming = edges.filter((e) => e.target === selectedNodeId);
    const outgoing = edges.filter((e) => e.source === selectedNodeId);

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => {
      const filtered = eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      );
      const bridges: Edge[] = [];
      for (const inc of incoming) {
        for (const out of outgoing) {
          bridges.push({
            id: `e-${inc.source}-${out.target}`,
            source: inc.source,
            target: out.target,
          });
        }
      }
      return [...filtered, ...bridges];
    });

    setSelectedNodeId(null);
    renumber();
    autoLayout();
  }, [selectedNodeId, nodes, edges, setNodes, setEdges, renumber, autoLayout]);

  // --- Manual re-arrange ---
  const onLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, nodesep, ranksep);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    requestAnimationFrame(() => fitView({ padding: 0.3 }));
  }, [nodes, edges, setNodes, setEdges, fitView, nodesep, ranksep]);

  // --- Connect handler ---
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  const selectedIsStep = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)?.type === "step"
    : false;

  return (
    <div className="h-[calc(100vh-8rem)] w-full rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          style: { stroke: "var(--color-border-strong)", strokeWidth: 1 },
        }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
      >
        {/* Action toolbar */}
        <Panel position="top-right">
          <div className="flex gap-[var(--space-2)]">
            {selectedIsStep && (
              <>
                <Button variant="secondary" size="sm" onClick={addStepAfter}>
                  + Step
                </Button>
                <Button variant="secondary" size="sm" onClick={addForkAfter}>
                  + Fork
                </Button>
                <Button variant="ghost" size="sm" onClick={deleteSelected} className="text-[var(--color-status-danger)]">
                  Delete
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={onLayout}>
              Re-arrange
            </Button>
          </div>
        </Panel>

        {/* Settings panel */}
        <Panel position="top-left">
          <div className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)] shadow-[0_1px_2px_var(--color-shadow-alpha)] w-56">
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Settings
            </span>

            {/* Edge type */}
            <div className="flex flex-col gap-[var(--space-1)]">
              <label className="text-xs text-[var(--color-text-secondary)]">Connector type</label>
              <Select
                value={edgeType}
                onChange={(e) => setEdgeType(e.target.value as EdgeType)}
              >
                {EDGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EDGE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>

            {/* Animated */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--color-text-secondary)]">Animated</label>
              <Switch checked={animated} onCheckedChange={setAnimated} />
            </div>

            {/* Arrowheads */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--color-text-secondary)]">Arrowheads</label>
              <Switch checked={arrowheads} onCheckedChange={setArrowheads} />
            </div>

            {/* Horizontal spacing */}
            <div className="flex flex-col gap-[var(--space-1)]">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--color-text-secondary)]">H spacing</label>
                <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{nodesep}px</span>
              </div>
              <Slider
                value={[nodesep]}
                onValueChange={([v]) => setNodesep(v)}
                min={20}
                max={200}
                step={10}
              />
            </div>

            {/* Vertical spacing */}
            <div className="flex flex-col gap-[var(--space-1)]">
              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--color-text-secondary)]">V spacing</label>
                <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{ranksep}px</span>
              </div>
              <Slider
                value={[ranksep]}
                onValueChange={([v]) => setRanksep(v)}
                min={20}
                max={200}
                step={10}
              />
            </div>

            {/* Apply spacing button */}
            <Button variant="secondary" size="sm" onClick={onLayout} className="w-full">
              Apply spacing
            </Button>
          </div>
        </Panel>

        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-border-subtle)" />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper
// ---------------------------------------------------------------------------

export function ReactFlowWorkflow() {
  return (
    <ReactFlowProvider>
      <ReactFlowWorkflowInner />
    </ReactFlowProvider>
  );
}
