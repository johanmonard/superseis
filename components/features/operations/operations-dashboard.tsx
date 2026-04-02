// -----------------------------------------------------------------------
// REFERENCE ONLY — do not copy this file as a starting point.
// Use `npm run new-module <name>` to scaffold new features instead.
// This module demonstrates Stage 2 patterns (dialogs, forms, local state).
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
import { Textarea } from "@/components/ui/textarea";

import {
  operationsSampleBriefings,
  operationsSampleTasks,
} from "./operations-sample-data";

export function OperationsDashboard() {
  const [briefings, setBriefings] = useState(operationsSampleBriefings);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("Nora");
  const [scope, setScope] = useState("Arrival briefing");
  const [notes, setNotes] = useState("");
  const [needsFollowUp, setNeedsFollowUp] = useState(true);

  const openTasks = operationsSampleTasks.filter((task) => task.status !== "done").length;
  const blockedTasks = operationsSampleTasks.filter((task) => task.status === "blocked").length;
  const activeOwners = new Set(operationsSampleTasks.map((task) => task.owner)).size;

  const resetForm = () => {
    setTitle("");
    setOwner("Nora");
    setScope("Arrival briefing");
    setNotes("");
    setNeedsFollowUp(true);
  };

  const handleSubmit = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }

    setBriefings((current) => [
      {
        id: `BRF-${String(current.length + 1).padStart(2, "0")}`,
        title: normalizedTitle,
        owner: owner.trim() || "Unassigned",
        scope,
        notes:
          notes.trim().length > 0
            ? notes.trim()
            : "No additional detail captured in this starter example.",
        needsFollowUp,
        createdAt: "Just now",
      },
      ...current,
    ]);
    resetForm();
    setIsDialogOpen(false);
  };

  return (
    <>
      <div className="space-y-[var(--space-4)]">
        <div className="grid grid-cols-1 gap-[var(--space-4)] md:grid-cols-3">
          <Card>
            <CardHeader className="flex-col items-start gap-[var(--space-1)]">
              <CardTitle>Open Tasks</CardTitle>
              <CardDescription>Live sample count from the bundled queue data.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {openTasks}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-[var(--space-1)]">
              <CardTitle>Blocked Items</CardTitle>
              <CardDescription>Useful for escalation and daily handoff checks.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-[var(--color-status-danger)]">
                {blockedTasks}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-[var(--space-1)]">
              <CardTitle>Active Owners</CardTitle>
              <CardDescription>Reference card showing compact metric treatment.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {activeOwners}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-[var(--space-4)] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
          <Card>
            <CardHeader className="items-start sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>Recent Briefings</CardTitle>
                <CardDescription>
                  Stage 2 example: dialog-driven mutation UI using local state only.
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setIsDialogOpen(true)}>
                New Briefing
              </Button>
            </CardHeader>
            <CardContent className="space-y-[var(--space-3)]">
              {briefings.map((briefing) => (
                <div
                  key={briefing.id}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]"
                >
                  <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {briefing.title}
                    </p>
                    <Badge variant={briefing.needsFollowUp ? "info" : "success"}>
                      {briefing.needsFollowUp ? "Follow-up" : "Shared"}
                    </Badge>
                  </div>
                  <p className="mt-[var(--space-1)] text-sm text-[var(--color-text-secondary)]">
                    {briefing.scope} • {briefing.owner}
                  </p>
                  <p className="mt-[var(--space-1)] text-sm text-[var(--color-text-secondary)]">
                    {briefing.notes}
                  </p>
                  <p className="mt-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
                    {briefing.createdAt}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What This Module Shows</CardTitle>
              <CardDescription>
                Keep this sample generic. It is here to demonstrate composition, not product logic.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-[var(--space-2)] text-sm text-[var(--color-text-secondary)]">
              <p>Use cards for compact summaries before escalating to tables.</p>
              <p>Keep dialogs local and reversible while the data model is still unstable.</p>
              <p>Move to `/demo/tasks` for the Stage 3 search and table reference.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>Create Briefing</DialogTitle>
            <DialogDescription>
              Starter example only. This demonstrates a low-friction Stage 2 form flow.
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
            <Field label="Scope">
              <Select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option>Arrival briefing</option>
                <option>Shift handoff</option>
                <option>Escalation note</option>
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Capture what changed, what remains blocked, and who should act next."
              />
            </Field>
            <label className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]">
              <span className="text-sm text-[var(--color-text-secondary)]">Needs follow-up</span>
              <Switch checked={needsFollowUp} onCheckedChange={setNeedsFollowUp} />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogCloseButton onClose={() => setIsDialogOpen(false)} />
          <Button onClick={handleSubmit} disabled={title.trim().length === 0}>
            Save Briefing
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
