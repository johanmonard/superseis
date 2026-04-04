// -----------------------------------------------------------------------
// REFERENCE ONLY — do not copy this file as a starting point.
// Use `npm run new-module <name>` to scaffold new features instead.
// This module demonstrates Stage 3 patterns (tables, tabs, search, filters).
// See AGENTS.md > Feature Stages for guidance.
// -----------------------------------------------------------------------

"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  operationsSampleTasks,
  type OperationsTask,
  type OperationsTaskPriority,
  type OperationsTaskStatus,
} from "./operations-sample-data";

type QueueTab = "all" | OperationsTaskStatus;

function getStatusBadgeVariant(status: OperationsTaskStatus) {
  if (status === "blocked") {
    return "danger";
  }

  if (status === "done") {
    return "success";
  }

  if (status === "in-progress") {
    return "info";
  }

  return "outline";
}

function getPriorityBadgeVariant(priority: OperationsTaskPriority) {
  if (priority === "high") {
    return "danger";
  }

  if (priority === "medium") {
    return "info";
  }

  return "neutral";
}

function filterTasks(tasks: OperationsTask[], tab: QueueTab, search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesTab = tab === "all" ? true : task.status === tab;
    const matchesSearch =
      normalizedSearch.length === 0
        ? true
        : `${task.id} ${task.title} ${task.owner} ${task.summary}`
            .toLowerCase()
            .includes(normalizedSearch);

    return matchesTab && matchesSearch;
  });
}

export function OperationsQueueSurface() {
  const [tasks, setTasks] = useState(operationsSampleTasks);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<QueueTab>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("Mae");
  const [status, setStatus] = useState<OperationsTaskStatus>("new");
  const [priority, setPriority] = useState<OperationsTaskPriority>("medium");
  const [summary, setSummary] = useState("");
  const [needsEscalation, setNeedsEscalation] = useState(false);

  const columns: DataTableColumn<OperationsTask>[] = [
    {
      id: "id",
      header: "ID",
      cell: (task) => task.id,
      tone: "strong",
    },
    {
      id: "title",
      header: "Task",
      cell: (task) => (
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-[var(--color-text-primary)]">{task.title}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{task.summary}</p>
        </div>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      cell: (task) => task.owner,
    },
    {
      id: "status",
      header: "Status",
      cell: (task) => (
        <Badge variant={getStatusBadgeVariant(task.status)}>
          {task.status}
        </Badge>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      cell: (task) => (
        <Badge variant={getPriorityBadgeVariant(task.priority)}>
          {task.priority}
        </Badge>
      ),
    },
    {
      id: "updatedAt",
      header: "Updated",
      cell: (task) => task.updatedAt,
      align: "right",
      tone: "muted",
    },
  ];

  const resetForm = () => {
    setTitle("");
    setOwner("Mae");
    setStatus("new");
    setPriority("medium");
    setSummary("");
    setNeedsEscalation(false);
  };

  const handleCreateTask = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }

    const nextPriority = needsEscalation ? "high" : priority;
    const nextTask: OperationsTask = {
      id: `OPS-${String(tasks.length + 105).padStart(3, "0")}`,
      title: normalizedTitle,
      owner: owner.trim() || "Unassigned",
      status,
      priority: nextPriority,
      updatedAt: "Just now",
      summary:
        summary.trim().length > 0
          ? summary.trim()
          : "New starter item added from the sample queue dialog.",
    };

    setTasks((current) => [nextTask, ...current]);
    setTab("all");
    setSearch("");
    resetForm();
    setIsDialogOpen(false);
  };

  const renderTable = (currentTab: QueueTab) => {
    const visibleTasks = filterTasks(tasks, currentTab, search);

    return (
      <DataTable
        columns={columns}
        data={visibleTasks}
        title="Live Queue"
        description="Search, tabs, badges, and dialog actions on top of the canonical table surface."
        search={
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ID, task, owner, or summary"
          />
        }
        headerAction={
          <Button variant="secondary" size="sm" onClick={() => setIsDialogOpen(true)}>
            New Task
          </Button>
        }
        emptyMessage="No queue items match the current filter."
        getRowId={(task) => task.id}
      />
    );
  };

  return (
    <>
      <div className="space-y-[var(--space-4)]">
        <Card>
          <CardHeader>
            <CardTitle>Queue Reference Pattern</CardTitle>
            <CardDescription>
              This surface is intentionally generic. Use it as the baseline for
              a compact Stage 3 module before introducing heavier data-grid behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-[var(--space-2)]">
            <Badge variant="info">Tabs</Badge>
            <Badge variant="outline">Search</Badge>
            <Badge variant="success">DataTable</Badge>
            <Badge variant="neutral">Dialog Action</Badge>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(value) => setTab(value as QueueTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="new">New</TabsTrigger>
            <TabsTrigger value="in-progress">In Progress</TabsTrigger>
            <TabsTrigger value="blocked">Blocked</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
          <TabsContent value="all">{renderTable("all")}</TabsContent>
          <TabsContent value="new">{renderTable("new")}</TabsContent>
          <TabsContent value="in-progress">{renderTable("in-progress")}</TabsContent>
          <TabsContent value="blocked">{renderTable("blocked")}</TabsContent>
          <TabsContent value="done">{renderTable("done")}</TabsContent>
        </Tabs>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>Create Queue Item</DialogTitle>
            <DialogDescription>
              Starter example for a compact Stage 2 mutation flow.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Owner">
              <Input value={owner} onChange={(event) => setOwner(event.target.value)} />
            </Field>
            <Field label="Status">
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value as OperationsTaskStatus)}
              >
                <option value="new">new</option>
                <option value="in-progress">in-progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as OperationsTaskPriority)}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </Select>
            </Field>
            <Field label="Summary" className="sm:col-span-2">
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Describe what changed, what is blocked, and what should happen next."
              />
            </Field>
            <label className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)] sm:col-span-2">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Escalate to high priority
              </span>
              <Switch checked={needsEscalation} onCheckedChange={setNeedsEscalation} />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogCloseButton onClose={() => setIsDialogOpen(false)} />
          <Button onClick={handleCreateTask} disabled={title.trim().length === 0}>
            Add Task
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
