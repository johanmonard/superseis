"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/features/activities/section";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Tag select (matches Layers source-file picker)
   ------------------------------------------------------------------ */

function TagSelect({
  selected,
  available,
  onAdd,
  onRemove,
  label,
}: {
  selected: string[];
  available: string[];
  onAdd: (v: string) => void;
  onRemove: (index: number) => void;
  label: string;
}) {
  const unselected = available.filter((v) => !selected.includes(v));
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-[var(--space-1)]">
          {selected.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-secondary)]"
            >
              {v}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      {unselected.length > 0 && (
        <div ref={ref} className="relative self-start">
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            <Plus size={12} className="mr-[var(--space-1)]" /> {label}
          </Button>
          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[10rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
              {unselected.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { onAdd(v); setOpen(false); }}
                  className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface Resource {
  id: string;
  name: string;
}

interface Activity {
  id: string;
  name: string;
  predecessors: string[];
  pointType: "SP" | "RP";
  resources: Resource[];
}

interface CrewOption {
  id: string;
  name: string;
  activities: Activity[];
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function createResource(name: string): Resource {
  return { id: crypto.randomUUID(), name };
}

function createActivity(name: string): Activity {
  return { id: crypto.randomUUID(), name, predecessors: [], pointType: "SP", resources: [] };
}

function createCrewOption(name: string): CrewOption {
  return { id: crypto.randomUUID(), name, activities: [] };
}

/* ------------------------------------------------------------------
   Option selector (pill-style, matches Partitioning GroupSelector)
   ------------------------------------------------------------------ */

function OptionSelector({
  options,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  options: CrewOption[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editingId]);

  const startEdit = (opt: CrewOption) => {
    setEditingId(opt.id);
    setEditValue(opt.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {options.map((opt) => {
          const isActive = opt.id === activeId;
          const isEditing = opt.id === editingId;

          if (isEditing) {
            return (
              <div
                key={opt.id}
                className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
              >
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 w-24 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={commitEdit}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]"
                >
                  <Check size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"
                >
                  <X size={10} />
                </button>
              </div>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={cn(
                "flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {opt.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add option"
        >
          <Plus size={12} />
        </button>
      </div>
      {/* Edit / Delete actions for active option */}
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = options.find((o) => o.id === activeId);
            if (active) startEdit(active);
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {options.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export interface CrewActivityInfo {
  id: string;
  name: string;
  pointType: string;
  predecessors: string[];
  resources: string[];
}

export function ProjectCrew({
  onActivitiesChange,
}: {
  onActivitiesChange?: (activities: CrewActivityInfo[]) => void;
} = {}) {
  const [options, setOptions] = React.useState<CrewOption[]>([
    createCrewOption("Option 1"),
  ]);
  const [activeId, setActiveId] = React.useState<string>(options[0].id);

  const active = options.find((o) => o.id === activeId) ?? options[0];
  const [newActivityIds] = React.useState(() => new Set<string>());

  // Notify parent of activity changes for the graph
  React.useEffect(() => {
    onActivitiesChange?.(
      active.activities.map((a) => ({
        id: a.id,
        name: a.name,
        pointType: a.pointType,
        predecessors: a.predecessors,
        resources: a.resources.map((r) => r.name),
      }))
    );
  }, [active.activities, onActivitiesChange]);

  /* ── Option CRUD ───────────────────────────────────────────────── */

  const handleAdd = React.useCallback(() => {
    const opt = createCrewOption(`Option ${options.length + 1}`);
    setOptions((prev) => [...prev, opt]);
    setActiveId(opt.id);
  }, [options.length]);

  const handleDelete = React.useCallback(
    (id: string) => {
      setOptions((prev) => {
        const next = prev.filter((o) => o.id !== id);
        if (activeId === id && next.length > 0) {
          setActiveId(next[0].id);
        }
        return next;
      });
    },
    [activeId]
  );

  const handleRename = React.useCallback(
    (id: string, name: string) => {
      setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, name } : o)));
    },
    []
  );

  /* ── Activity CRUD ─────────────────────────────────────────────── */

  const addActivity = (optionId: string) => {
    const act = createActivity(`Activity ${(options.find((o) => o.id === optionId)?.activities.length ?? 0) + 1}`);
    newActivityIds.add(act.id);
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? { ...o, activities: [...o.activities, act] }
          : o
      )
    );
  };

  const updateActivity = (optionId: string, actId: string, patch: Partial<Activity>) => {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? { ...o, activities: o.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)) }
          : o
      )
    );
  };

  const removeActivity = (optionId: string, actId: string) => {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? {
              ...o,
              activities: o.activities
                .filter((a) => a.id !== actId)
                .map((a) => ({
                  ...a,
                  predecessors: a.predecessors.filter((p) => p !== actId),
                })),
            }
          : o
      )
    );
  };

  /* ── Resource CRUD ─────────────────────────────────────────────── */

  const addResource = (optionId: string, actId: string) => {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? {
              ...o,
              activities: o.activities.map((a) =>
                a.id === actId
                  ? { ...a, resources: [...a.resources, createResource(`Resource ${a.resources.length + 1}`)] }
                  : a
              ),
            }
          : o
      )
    );
  };

  const updateResource = (optionId: string, actId: string, resId: string, name: string) => {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? {
              ...o,
              activities: o.activities.map((a) =>
                a.id === actId
                  ? { ...a, resources: a.resources.map((r) => (r.id === resId ? { ...r, name } : r)) }
                  : a
              ),
            }
          : o
      )
    );
  };

  const removeResource = (optionId: string, actId: string, resId: string) => {
    setOptions((prev) =>
      prev.map((o) =>
        o.id === optionId
          ? {
              ...o,
              activities: o.activities.map((a) =>
                a.id === actId
                  ? { ...a, resources: a.resources.filter((r) => r.id !== resId) }
                  : a
              ),
            }
          : o
      )
    );
  };

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Option selector */}
      <OptionSelector
        options={options}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={handleAdd}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Active option content */}
      <div className="flex flex-col gap-[var(--space-4)]">
        {/* Activities list */}
        {active.activities.map((act) => (
          <Section
            key={act.id}
            title={`${act.name} (${act.pointType})`}
            defaultOpen={newActivityIds.has(act.id)}
            action={
              <button
                type="button"
                onClick={() => removeActivity(active.id, act.id)}
                className="text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-status-danger)]"
              >
                <Trash2 size={10} />
              </button>
            }
          >
            <Field label="Name" htmlFor={`act-name-${act.id}`} layout="horizontal">
              <div className="flex items-center gap-[var(--space-3)]">
                <Input
                  id={`act-name-${act.id}`}
                  value={act.name}
                  onChange={(e) => updateActivity(active.id, act.id, { name: e.target.value })}
                  className="flex-1"
                />
                {(["SP", "RP"] as const).map((pt) => (
                  <label key={pt} className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)]">
                    <Checkbox
                      checked={act.pointType === pt}
                      onCheckedChange={() => updateActivity(active.id, act.id, { pointType: pt })}
                    />
                    {pt}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Predecessors" layout="horizontal">
              <TagSelect
                selected={act.predecessors.map(
                  (pId) => active.activities.find((a) => a.id === pId)?.name ?? pId
                )}
                available={active.activities
                  .filter((other) => other.id !== act.id)
                  .map((other) => other.name)}
                onAdd={(name) => {
                  const target = active.activities.find((a) => a.name === name);
                  if (target) {
                    updateActivity(active.id, act.id, {
                      predecessors: [...act.predecessors, target.id],
                    });
                  }
                }}
                onRemove={(i) =>
                  updateActivity(active.id, act.id, {
                    predecessors: act.predecessors.filter((_, idx) => idx !== i),
                  })
                }
                label="Predecessor"
              />
            </Field>

            <Field label="Resources" layout="horizontal">
              <div className="flex flex-col gap-[var(--space-2)]">
                {act.resources.map((res) => (
                  <div key={res.id} className="flex items-center gap-[var(--space-2)]">
                    <Input
                      value={res.name}
                      onChange={(e) => updateResource(active.id, act.id, res.id, e.target.value)}
                      className="text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeResource(active.id, act.id, res.id)}
                      className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-status-danger)]"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addResource(active.id, act.id)}
                  className="self-start"
                >
                  <Plus size={12} className="mr-[var(--space-1)]" />
                  Resource
                </Button>
              </div>
            </Field>
          </Section>
        ))}

        {/* Add activity button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => addActivity(active.id)}
          className="self-start"
        >
          <Plus size={12} className="mr-[var(--space-1)]" />
          Activity
        </Button>
      </div>
    </div>
  );
}
