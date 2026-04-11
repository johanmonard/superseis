"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Panel,
  Background,
  BackgroundVariant,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import Dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { appIcons } from "@/components/ui/icon";
import { useDefinitionForm, getDefinitionStatus } from "@/lib/use-definition-form";

const { settings: Settings, x: X } = appIcons;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "todo" | "ongoing" | "completed";

type StepData = {
  label: string;
  description: string;
  href: string;
  status: StepStatus;
  number: number;
  showHandles: boolean;
  onCycleStatus: (id: string) => void;
  onNavigate: (href: string) => void;
};

type EdgeType = "smoothstep" | "default" | "straight" | "step";
type RankDirection = "TB" | "LR" | "BT" | "RL";
type ConnectorEnd = "none" | "arrow" | "arrowclosed";

interface WorkflowConfig {
  edgeType: EdgeType;
  rankDirection: RankDirection;
  connectorEnd: ConnectorEnd;
  nodeSpacing: number;
  rankSpacing: number;
  animated: boolean;
  showHandles: boolean;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  edgeType: "step",
  rankDirection: "TB",
  connectorEnd: "none",
  nodeSpacing: 40,
  rankSpacing: 20,
  animated: false,
  showHandles: false,
};

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
      role="button"
      tabIndex={0}
      onClick={() => data.onNavigate(data.href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") data.onNavigate(data.href);
      }}
      className={
        "w-52 h-[72px] cursor-pointer rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] p-[var(--space-3)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:border-[var(--color-accent)] " +
        (selected
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          : "border-[var(--color-border-subtle)]")
      }
    >
      <Handle type="target" position={Position.Top} className={data.showHandles ? "!bg-[var(--color-border-strong)]" : "!opacity-0"} />
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
      <p className="mt-[var(--space-1)] pl-[calc(1.5rem+var(--space-2))] text-xs text-[var(--color-text-secondary)] line-clamp-2">
        {data.description}
      </p>
      <Handle type="source" position={Position.Bottom} className={data.showHandles ? "!bg-[var(--color-border-strong)]" : "!opacity-0"} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Title node
// ---------------------------------------------------------------------------

function TitleNode(_props: NodeProps) {
  return (
    <div className="flex w-52 h-[72px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-accent)] px-[var(--space-4)] shadow-[0_2px_8px_var(--color-shadow-alpha)]">
      <span className="text-sm font-bold tracking-wide text-[var(--color-accent-foreground)]">
        Project Settings
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--color-accent-foreground)]" />
    </div>
  );
}

const nodeTypes = { step: StepNode, title: TitleNode };

// ---------------------------------------------------------------------------
// Steps definition
// ---------------------------------------------------------------------------

const STEPS = [
  { id: "definition", number: 1, label: "Definition", description: "Project base information.", href: "/project/definition" },
  { id: "partitioning", number: 2, label: "Partitioning", description: "Partition the project area in regions.", href: "/project/partitioning" },
  { id: "design", number: 3, label: "Design", description: "Survey design parameters & region assignment.", href: "/project/design" },
  { id: "terrain", number: 4, label: "Terrain", description: "Define project extents and boundaries.", href: "/project/terrain" },
  { id: "osm", number: 5, label: "OSM", description: "OpenStreetMap data configuration.", href: "/project/osm" },
  { id: "layers", number: 6, label: "Layers", description: "Layer management and configuration.", href: "/project/layers" },
  { id: "maps", number: 7, label: "Maps", description: "Map layer composition and sorting.", href: "/project/maps" },
  { id: "offsetters", number: 8, label: "Offsetters", description: "Offset relocation parameters.", href: "/project/offsetters" },
] as const;

// ---------------------------------------------------------------------------
// Dagre layout
// ---------------------------------------------------------------------------

const NODE_WIDTH = 208;
const NODE_HEIGHT = 72;

function layoutElements(nodes: Node[], edges: Edge[], config: WorkflowConfig) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: config.rankDirection, nodesep: config.nodeSpacing, ranksep: config.rankSpacing });

  // Use uniform height for all nodes so Dagre produces even spacing
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

// ---------------------------------------------------------------------------
// Build initial nodes & edges
// ---------------------------------------------------------------------------

const noop = () => {};

const TITLE_NODE_ID = "title";

function createInitialNodes(showHandles = true): Node[] {
  const titleNode: Node = {
    id: TITLE_NODE_ID,
    type: "title",
    position: { x: 0, y: 0 },
    data: {},
  };

  const stepNodes: Node[] = STEPS.map((step) => ({
    id: step.id,
    type: "step" as const,
    position: { x: 0, y: 0 },
    data: {
      label: step.label,
      description: step.description,
      href: step.href,
      status: "todo" as StepStatus,
      number: step.number,
      showHandles,
      onCycleStatus: noop,
      onNavigate: noop,
    },
  }));

  return [titleNode, ...stepNodes];
}

function createInitialEdges(config: WorkflowConfig): Edge[] {
  const edgeStyle = {
    type: config.edgeType,
    animated: config.animated,
    ...(config.connectorEnd !== "none" && {
      markerEnd: {
        type: config.connectorEnd === "arrow" ? MarkerType.Arrow : MarkerType.ArrowClosed,
        color: "var(--color-border-strong)",
      },
    }),
  } as const;

  const titleEdge: Edge = {
    id: `e-${TITLE_NODE_ID}-${STEPS[0].id}`,
    source: TITLE_NODE_ID,
    target: STEPS[0].id,
    ...edgeStyle,
  };

  const stepEdges: Edge[] = STEPS.slice(0, -1).map((step, i) => ({
    id: `e-${step.id}-${STEPS[i + 1].id}`,
    source: step.id,
    target: STEPS[i + 1].id,
    ...edgeStyle,
  }));

  return [titleEdge, ...stepEdges];
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

function WorkflowSettingsPanel({
  config,
  onUpdate,
}: {
  config: WorkflowConfig;
  onUpdate: <K extends keyof WorkflowConfig>(key: K, value: WorkflowConfig[K]) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:text-[var(--color-text-primary)]"
        aria-label="Workflow settings"
      >
        <Settings size={13} />
      </button>
    );
  }

  return (
    <div className="w-70 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--space-3)] py-[var(--space-2)]">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">Workflow Settings</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
        >
          <X size={12} />
        </button>
      </div>
      <div className="space-y-[var(--space-3)] p-[var(--space-3)]">
        <Field label="Edge Type" layout="horizontal">
          <Select
            value={config.edgeType}
            onChange={(e) => onUpdate("edgeType", e.target.value as EdgeType)}
          >
            <option value="smoothstep">Smooth Step</option>
            <option value="default">Bezier</option>
            <option value="straight">Straight</option>
            <option value="step">Step</option>
          </Select>
        </Field>

        <Field label="Connector End" layout="horizontal">
          <Select
            value={config.connectorEnd}
            onChange={(e) => onUpdate("connectorEnd", e.target.value as ConnectorEnd)}
          >
            <option value="none">None</option>
            <option value="arrow">Arrow</option>
            <option value="arrowclosed">Arrow (filled)</option>
          </Select>
        </Field>

        <Field label="Direction" layout="horizontal">
          <Select
            value={config.rankDirection}
            onChange={(e) => onUpdate("rankDirection", e.target.value as RankDirection)}
          >
            <option value="TB">Top to Bottom</option>
            <option value="LR">Left to Right</option>
            <option value="BT">Bottom to Top</option>
            <option value="RL">Right to Left</option>
          </Select>
        </Field>

        <Field label="Node Spacing" layout="horizontal">
          <Input
            type="number"
            min={10}
            max={200}
            value={config.nodeSpacing}
            onChange={(e) => onUpdate("nodeSpacing", Number(e.target.value))}
          />
        </Field>

        <Field label="Rank Spacing" layout="horizontal">
          <Input
            type="number"
            min={10}
            max={200}
            value={config.rankSpacing}
            onChange={(e) => onUpdate("rankSpacing", Number(e.target.value))}
          />
        </Field>

        <Field label="Animated" layout="horizontal">
          <label className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)]">
            <Checkbox
              checked={config.animated}
              onCheckedChange={(checked) => onUpdate("animated", Boolean(checked))}
            />
            Enable
          </label>
        </Field>

        <Field label="Handles" layout="horizontal">
          <label className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)]">
            <Checkbox
              checked={config.showHandles}
              onCheckedChange={(checked) => onUpdate("showHandles", Boolean(checked))}
            />
            Show
          </label>
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const STATUS_CYCLE: Record<StepStatus, StepStatus> = {
  todo: "ongoing",
  ongoing: "completed",
  completed: "todo",
};

function ProjectSettingsWorkflowInner() {
  const router = useRouter();
  const { fitView } = useReactFlow();
  const { definition } = useDefinitionForm();
  const [config, setConfig] = useState<WorkflowConfig>(DEFAULT_CONFIG);

  const updateConfig = useCallback(
    <K extends keyof WorkflowConfig>(key: K, value: WorkflowConfig[K]) =>
      setConfig((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // Derive step statuses from shared form state
  const definitionStatus = getDefinitionStatus(definition);

  // Compute layout from config
  const rawNodes = useMemo(() => createInitialNodes(config.showHandles), [config.showHandles]);
  const initialEdges = useMemo(() => createInitialEdges(config), [config]);
  const initialLayoutedNodes = useMemo(
    () => layoutElements(rawNodes, initialEdges, config),
    [rawNodes, initialEdges, config],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialLayoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync definition status into the "definition" node
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "definition" && n.type === "step"
          ? { ...n, data: { ...n.data, status: definitionStatus } }
          : n,
      ),
    );
  }, [definitionStatus, setNodes]);

  // Re-layout when config changes
  useEffect(() => {
    const newEdges = createInitialEdges(config);
    setNodes((nds) => {
      // Preserve step statuses
      const statusMap = new Map<string, StepStatus>();
      for (const n of nds) {
        if (n.type === "step") statusMap.set(n.id, (n.data as StepData).status);
      }
      const fresh = createInitialNodes(config.showHandles).map((n) => {
        if (n.type === "step" && statusMap.has(n.id)) {
          return { ...n, data: { ...n.data, status: statusMap.get(n.id) } };
        }
        return n;
      });
      return layoutElements(fresh, newEdges, config);
    });
    setEdges(newEdges);
    setTimeout(() => fitView(), 50);
  }, [config, setNodes, setEdges, fitView]);

  const cycleStatus = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const cur = (n.data as StepData).status;
          return { ...n, data: { ...n.data, status: STATUS_CYCLE[cur] } };
        }),
      );
    },
    [setNodes],
  );

  const navigate = useCallback(
    (href: string) => router.push(href),
    [router],
  );

  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) =>
        n.type === "step"
          ? { ...n, data: { ...n.data, onCycleStatus: cycleStatus, onNavigate: navigate } }
          : n,
      ),
    [nodes, cycleStatus, navigate],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          style: { stroke: "var(--color-border-strong)", strokeWidth: 1 },
        }}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <WorkflowSettingsPanel config={config} onUpdate={updateConfig} />
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-border-subtle)" />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper
// ---------------------------------------------------------------------------

export function ProjectSettingsWorkflow() {
  return (
    <ReactFlowProvider>
      <ProjectSettingsWorkflowInner />
    </ReactFlowProvider>
  );
}
