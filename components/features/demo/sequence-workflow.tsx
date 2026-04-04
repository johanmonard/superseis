"use client";

import { useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "todo" | "ongoing" | "completed";

type WorkflowNode =
  | { type: "step"; id: string; number: number; title: string; description: string; status: StepStatus }
  | { type: "fork"; id: string; branches: WorkflowNode[][] }
  | { type: "merge"; id: string };

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const initialWorkflow: WorkflowNode[] = [
  {
    type: "step",
    id: "s1",
    number: 1,
    title: "Project kickoff",
    description: "Align stakeholders on scope and timeline.",
    status: "completed",
  },
  {
    type: "step",
    id: "s2",
    number: 2,
    title: "Requirements gathering",
    description: "Collect functional and non-functional requirements.",
    status: "completed",
  },
  {
    type: "fork",
    id: "f1",
    branches: [
      [
        {
          type: "step",
          id: "s3a",
          number: 3,
          title: "Frontend design",
          description: "Create wireframes and visual mockups.",
          status: "ongoing",
        },
        {
          type: "step",
          id: "s4a",
          number: 4,
          title: "Frontend implementation",
          description: "Build UI components and integrate APIs.",
          status: "todo",
        },
        {
          type: "step",
          id: "s5a",
          number: 5,
          title: "Frontend testing",
          description: "Unit and integration tests for the UI.",
          status: "todo",
        },
      ],
      [
        {
          type: "step",
          id: "s3b",
          number: 3,
          title: "Backend architecture",
          description: "Design data models and API contracts.",
          status: "ongoing",
        },
        {
          type: "step",
          id: "s4b",
          number: 4,
          title: "Backend implementation",
          description: "Implement services, routes, and persistence.",
          status: "todo",
        },
      ],
    ],
  },
  { type: "merge", id: "m1" },
  {
    type: "step",
    id: "s6",
    number: 6,
    title: "Integration testing",
    description: "End-to-end tests after both branches complete.",
    status: "todo",
  },
  {
    type: "step",
    id: "s7",
    number: 7,
    title: "Deployment",
    description: "Release to staging, then production.",
    status: "todo",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-update a step's status by id */
function updateStepStatus(nodes: WorkflowNode[], stepId: string, status: StepStatus): WorkflowNode[] {
  return nodes.map((node) => {
    if (node.type === "step" && node.id === stepId) return { ...node, status };
    if (node.type === "fork") {
      return { ...node, branches: node.branches.map((branch) => updateStepStatus(branch, stepId, status)) };
    }
    return node;
  });
}

/** Deep-insert nodes after a step with the given id */
function insertAfterStep(nodes: WorkflowNode[], afterId: string, toInsert: WorkflowNode[]): WorkflowNode[] {
  const result: WorkflowNode[] = [];
  for (const node of nodes) {
    if (node.type === "step") {
      result.push(node);
      if (node.id === afterId) result.push(...toInsert);
    } else if (node.type === "fork") {
      result.push({
        ...node,
        branches: node.branches.map((branch) => insertAfterStep(branch, afterId, toInsert)),
      });
    } else {
      result.push(node);
    }
  }
  return result;
}

/** Deep-remove a step by id, then collapse degenerate forks. */
function removeStep(nodes: WorkflowNode[], stepId: string): WorkflowNode[] {
  const result: WorkflowNode[] = [];
  for (const node of nodes) {
    if (node.type === "step" && node.id === stepId) continue;
    if (node.type === "fork") {
      const cleaned: WorkflowNode = {
        ...node,
        branches: node.branches.map((branch) => removeStep(branch, stepId)),
      };
      // Filter out empty branches
      const nonEmpty = cleaned.branches.filter((b) => b.length > 0);
      if (nonEmpty.length === 0) {
        // All branches empty — drop the fork entirely
        continue;
      }
      if (nonEmpty.length === 1) {
        // Only one branch left — inline its nodes
        result.push(...nonEmpty[0]);
        continue;
      }
      result.push({ ...cleaned, branches: nonEmpty });
    } else {
      result.push(node);
    }
  }
  return result;
}

let nextId = 100;

// ---------------------------------------------------------------------------
// Step card component
// ---------------------------------------------------------------------------

function StepCard({
  node,
  isSelected,
  onSelect,
  onCycleStatus,
}: {
  node: Extract<WorkflowNode, { type: "step" }>;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onCycleStatus: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(node.id); }}
      className={
        "group w-44 cursor-pointer rounded-[var(--radius-md)] border bg-[var(--color-bg-surface)] p-[var(--space-3)] text-left shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors " +
        (isSelected
          ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
          : "border-[var(--color-border-subtle)] hover:border-[var(--color-accent)]")
      }
    >
      <div className="flex items-center gap-[var(--space-2)]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCycleStatus(node.id);
          }}
          className="cursor-pointer"
        >
          <span
            className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-opacity hover:opacity-80 " +
              (node.status === "completed"
                ? "bg-[var(--color-status-success)] text-white"
                : node.status === "ongoing"
                  ? "bg-[var(--color-status-info)] text-white"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]")
            }
          >
            {node.status === "completed" ? "\u2713" : node.number}
          </span>
        </button>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {node.title}
        </span>
      </div>
      <p className="mt-[var(--space-1)] text-xs text-[var(--color-text-secondary)] line-clamp-2">
        {node.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline action buttons shown below selected step
// ---------------------------------------------------------------------------

function InlineActions({
  onAddStep,
  onAddFork,
  onDelete,
}: {
  onAddStep: () => void;
  onAddFork: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-center gap-[var(--space-2)] py-[var(--space-1)]">
      <Button variant="secondary" size="sm" onClick={onAddStep}>
        + Step
      </Button>
      <Button variant="secondary" size="sm" onClick={onAddFork}>
        + Fork
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} className="text-[var(--color-status-danger)]">
        Delete
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector drawing helpers
// ---------------------------------------------------------------------------

/** Fixed-height vertical connector. */
function VLine({ height = 24 }: { height?: number }) {
  return (
    // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
    <div className="flex justify-center" style={{ height }}>
      <div className="w-px bg-[var(--color-border-strong)] h-full" />
    </div>
  );
}

/** Growable vertical connector — fills remaining space in a flex column. */
function VLineFill({ minHeight = 16 }: { minHeight?: number }) {
  return (
    // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
    <div className="flex flex-1 justify-center" style={{ minHeight }}>
      <div className="w-px bg-[var(--color-border-strong)] h-full" />
    </div>
  );
}

/**
 * Per-column horizontal rail segment.
 * First column: center → right edge.  Last column: left edge → center.
 * Middle columns: full width.  Adjacent segments connect because columns
 * are gap-free, so this works regardless of column sizing.
 */
/* eslint-disable template/no-jsx-style-prop -- runtime sizing for connectors */
function HRailSegment({ isFirst, isLast }: { isFirst: boolean; isLast: boolean }) {
  return (
    <div className="relative w-full" style={{ height: 1 }}>
      <div
        className="absolute top-0 h-px bg-[var(--color-border-strong)]"
        style={{
          left: isFirst ? "50%" : 0,
          right: isLast ? "50%" : 0,
        }}
      />
    </div>
  );
}
/* eslint-enable template/no-jsx-style-prop */

// ---------------------------------------------------------------------------
// Recursive renderer
// ---------------------------------------------------------------------------

function RenderNodes({
  nodes,
  selectedId,
  onSelect,
  onCycleStatus,
  onAddStep,
  onAddFork,
  onDelete,
}: {
  nodes: WorkflowNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCycleStatus: (id: string) => void;
  onAddStep: (afterId: string) => void;
  onAddFork: (afterId: string) => void;
  onDelete: (id: string) => void;
}) {
  const visible = nodes.filter((n) => n.type !== "merge");

  return (
    <>
      {visible.map((node, i) => {
        const isFirst = i === 0;
        const isLast = i === visible.length - 1;

        if (node.type === "step") {
          const selected = node.id === selectedId;
          return (
            <div key={node.id}>
              {/* Connector from previous node */}
              {!isFirst && <VLine />}
              {/* Card */}
              <div className="flex justify-center">
                <StepCard
                  node={node}
                  isSelected={selected}
                  onSelect={onSelect}
                  onCycleStatus={onCycleStatus}
                />
              </div>
              {/* Inline actions when selected */}
              {selected && (
                <>
                  <VLine height={12} />
                  <InlineActions
                    onAddStep={() => onAddStep(node.id)}
                    onAddFork={() => onAddFork(node.id)}
                    onDelete={() => onDelete(node.id)}
                  />
                  {!isLast && <VLine height={12} />}
                </>
              )}
            </div>
          );
        }

        if (node.type === "fork") {
          const branchCount = node.branches.length;
          return (
            <div key={node.id}>
              {/* Connector from previous node */}
              {!isFirst && <VLine />}
              {/* Branches — grid gives equal row height; each column draws its own rail segment */}
              <div
                className="grid"
                // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
                style={{ gridTemplateColumns: `repeat(${branchCount}, 1fr)` }}
              >
                {node.branches.map((branch, bi) => {
                  const isFirstBranch = bi === 0;
                  const isLastBranch = bi === branchCount - 1;
                  return (
                    <div key={bi} className="flex flex-col px-[var(--space-4)]">
                      {/* Top rail segment — connects to adjacent columns */}
                      <HRailSegment isFirst={isFirstBranch} isLast={isLastBranch} />
                      {/* Vertical drop from rail into branch */}
                      <VLine height={16} />
                      {/* Branch content */}
                      <RenderNodes
                        nodes={branch}
                        selectedId={selectedId}
                        onSelect={onSelect}
                        onCycleStatus={onCycleStatus}
                        onAddStep={onAddStep}
                        onAddFork={onAddFork}
                        onDelete={onDelete}
                      />
                      {/* Growable rise — stretches in shorter branches to reach merge rail */}
                      <VLineFill minHeight={16} />
                      {/* Bottom rail segment — connects to adjacent columns */}
                      <HRailSegment isFirst={isFirstBranch} isLast={isLastBranch} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SequenceWorkflow() {
  const [workflow, setWorkflow] = useState<WorkflowNode[]>(initialWorkflow);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStatus, setNewStatus] = useState<StepStatus>("todo");
  const [forkBranchCount, setForkBranchCount] = useState(2);
  const [forkBranchLabels, setForkBranchLabels] = useState<string[]>(["Branch A", "Branch B"]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const cycleStatus = useCallback((id: string) => {
    setWorkflow((prev) => {
      const cycle: Record<StepStatus, StepStatus> = { todo: "ongoing", ongoing: "completed", completed: "todo" };
      const find = (nodes: WorkflowNode[]): StepStatus | null => {
        for (const n of nodes) {
          if (n.type === "step" && n.id === id) return n.status;
          if (n.type === "fork") {
            for (const b of n.branches) {
              const s = find(b);
              if (s) return s;
            }
          }
        }
        return null;
      };
      const current = find(prev);
      if (!current) return prev;
      return updateStepStatus(prev, id, cycle[current]);
    });
  }, []);

  const countSteps = (nodes: WorkflowNode[]): number => {
    let count = 0;
    for (const n of nodes) {
      if (n.type === "step") count++;
      if (n.type === "fork") n.branches.forEach((b) => (count += countSteps(b)));
    }
    return count;
  };

  const handleDelete = useCallback((id: string) => {
    setWorkflow((prev) => removeStep(prev, id));
    setSelectedId(null);
  }, []);

  const openAddStep = useCallback((afterId: string) => {
    setInsertAfterId(afterId);
    setAddDialogOpen(true);
  }, []);

  const openAddFork = useCallback((afterId: string) => {
    setInsertAfterId(afterId);
    setForkDialogOpen(true);
  }, []);

  const handleAddStep = () => {
    const title = newTitle.trim();
    if (!title) return;
    const step: WorkflowNode = {
      type: "step",
      id: `s${++nextId}`,
      number: countSteps(workflow) + 1,
      title,
      description: newDesc.trim() || "No description.",
      status: newStatus,
    };
    if (insertAfterId) {
      setWorkflow((prev) => insertAfterStep(prev, insertAfterId, [step]));
    } else {
      setWorkflow((prev) => [...prev, step]);
    }
    setNewTitle("");
    setNewDesc("");
    setNewStatus("todo");
    setInsertAfterId(null);
    setSelectedId(null);
    setAddDialogOpen(false);
  };

  const handleBranchCountChange = (count: number) => {
    setForkBranchCount(count);
    const letters = "ABCDEFGHIJ";
    setForkBranchLabels(Array.from({ length: count }, (_, i) => forkBranchLabels[i] || `Branch ${letters[i]}`));
  };

  const handleAddFork = () => {
    const totalSteps = countSteps(workflow);
    const branches: WorkflowNode[][] = forkBranchLabels.slice(0, forkBranchCount).map((label) => [
      {
        type: "step" as const,
        id: `s${++nextId}`,
        number: totalSteps + 1,
        title: label.trim() || "New step",
        description: "First step of this branch.",
        status: "todo" as StepStatus,
      },
    ]);
    const fork: WorkflowNode = { type: "fork", id: `f${++nextId}`, branches };
    if (insertAfterId) {
      setWorkflow((prev) => insertAfterStep(prev, insertAfterId, [fork]));
    } else {
      setWorkflow((prev) => [...prev, fork]);
    }
    setForkBranchCount(2);
    setForkBranchLabels(["Branch A", "Branch B"]);
    setInsertAfterId(null);
    setSelectedId(null);
    setForkDialogOpen(false);
  };

  return (
    <>
      <div className="space-y-[var(--space-4)]">
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <CardTitle>Workflow Sequence</CardTitle>
              <CardDescription>
                Click a step to select it and insert after it. Click the status badge to cycle status.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-[var(--space-4)]">
              <RenderNodes
                nodes={workflow}
                selectedId={selectedId}
                onSelect={handleSelect}
                onCycleStatus={cycleStatus}
                onAddStep={openAddStep}
                onAddFork={openAddFork}
                onDelete={handleDelete}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-[var(--space-2)] text-sm text-[var(--color-text-secondary)]">
            <p><strong>Select</strong> — click a step card to select it. Two buttons appear below: + Step and + Fork.</p>
            <p><strong>Status</strong> — click the status badge to cycle: to do → ongoing → completed → to do.</p>
            <p><strong>Forks</strong> split the workflow into parallel branches that run side by side.</p>
            <p><strong>Merges</strong> wait until every step on every branch is completed before unblocking the next step.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>Add Step</DialogTitle>
            <DialogDescription>Insert a new step after the selected step.</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-[var(--space-3)]">
            <Field label="Title">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as StepStatus)}>
                <option value="todo">To do</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogCloseButton onClose={() => setAddDialogOpen(false)} />
          <Button onClick={handleAddStep} disabled={newTitle.trim().length === 0}>
            Add
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={forkDialogOpen} onOpenChange={setForkDialogOpen}>
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>Add Fork</DialogTitle>
            <DialogDescription>
              Split into parallel branches after the selected step. Each branch starts with one step.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-[var(--space-3)]">
            <Field label="Number of branches">
              <Select
                value={String(forkBranchCount)}
                onChange={(e) => handleBranchCountChange(Number(e.target.value))}
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={String(n)}>
                    {n} branches
                  </option>
                ))}
              </Select>
            </Field>
            {Array.from({ length: forkBranchCount }, (_, i) => (
              <Field key={i} label={`Branch ${i + 1} label`}>
                <Input
                  value={forkBranchLabels[i] || ""}
                  onChange={(e) => {
                    const updated = [...forkBranchLabels];
                    updated[i] = e.target.value;
                    setForkBranchLabels(updated);
                  }}
                />
              </Field>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogCloseButton onClose={() => setForkDialogOpen(false)} />
          <Button onClick={handleAddFork}>Add Fork</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
