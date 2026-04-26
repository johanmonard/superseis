"use client";

/**
 * Demo copy of the Crew settings page — preserves the original dummy data
 * (Permitting / Survey / Dozing / Drilling / Layout / Recording / Pickup /
 * Green Team) and the full Option / Activity / Resource editor UI.
 *
 * Differs from the production component (`components/features/project/project-crew.tsx`)
 * in that it uses local React state instead of the autosave/active-project
 * hooks, so it works as a standalone demo with no backend.
 */

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
              className="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-secondary)]"
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
  max: number;
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
  return { id: crypto.randomUUID(), name, max: 1 };
}

function createActivity(name: string): Activity {
  return { id: crypto.randomUUID(), name, predecessors: [], pointType: "SP", resources: [] };
}

function createCrewOption(name: string): CrewOption {
  return { id: crypto.randomUUID(), name, activities: [] };
}

function res(name: string, max: number): Resource {
  return { id: crypto.randomUUID(), name, max };
}

function buildDummyOption(): CrewOption {
  const ids = {
    permSP: crypto.randomUUID(),
    permRP: crypto.randomUUID(),
    survSP: crypto.randomUUID(),
    survRP: crypto.randomUUID(),
    dozing: crypto.randomUUID(),
    drilling: crypto.randomUUID(),
    layout: crypto.randomUUID(),
    recording: crypto.randomUUID(),
    pickup: crypto.randomUUID(),
    green: crypto.randomUUID(),
  };

  return {
    id: crypto.randomUUID(),
    name: "Option 1",
    activities: [
      {
        id: ids.permSP, name: "Permitting SP", pointType: "SP", predecessors: [],
        resources: [res("Permit", 5)],
      },
      {
        id: ids.permRP, name: "Permitting RP", pointType: "RP", predecessors: [],
        resources: [res("Permit", 5)],
      },
      {
        id: ids.survSP, name: "Survey SP", pointType: "SP", predecessors: [ids.permSP],
        resources: [res("RTK", 10), res("TC", 5), res("Inertial Station", 1)],
      },
      {
        id: ids.survRP, name: "Survey RP", pointType: "RP", predecessors: [ids.permRP],
        resources: [res("RTK", 10), res("TC", 5), res("Inertial Station", 1)],
      },
      {
        id: ids.dozing, name: "Dozing", pointType: "SP", predecessors: [ids.survSP],
        resources: [res("D8", 4), res("D9", 2)],
      },
      {
        id: ids.drilling, name: "Drilling", pointType: "SP", predecessors: [ids.survSP],
        resources: [res("B200P", 8), res("TD40", 6), res("B500T", 4)],
      },
      {
        id: ids.layout, name: "Layout", pointType: "RP",
        predecessors: [ids.dozing, ids.drilling, ids.survRP],
        resources: [res("Land Nodes", 10), res("SW Nodes", 10)],
      },
      {
        id: ids.recording, name: "Recording", pointType: "SP", predecessors: [ids.layout],
        resources: [res("Vibrator M26", 10), res("Mini-vibe", 2), res("Shooters", 6), res("Gun boat", 2), res("Mini-gun", 1)],
      },
      {
        id: ids.pickup, name: "Pickup", pointType: "RP", predecessors: [ids.recording],
        resources: [res("Land Nodes", 10), res("SW Nodes", 10)],
      },
      {
        id: ids.green, name: "Green Team", pointType: "SP", predecessors: [ids.pickup],
        resources: [res("Cleaner", 10)],
      },
    ],
  };
}

interface CrewData {
  options: CrewOption[];
  activeId: string;
}

function buildDefaultCrew(): CrewData {
  const opt = buildDummyOption();
  return { options: [opt], activeId: opt.id };
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

export interface CrewResourceInfo {
  name: string;
  max: number;
}

export interface CrewActivityInfo {
  id: string;
  name: string;
  pointType: string;
  predecessors: string[];
  resources: CrewResourceInfo[];
}

export function DemoCrew({
  onActivitiesChange,
}: {
  onActivitiesChange?: (activities: CrewActivityInfo[]) => void;
} = {}) {
  const [data, setData] = React.useState<CrewData>(() => buildDefaultCrew());
  const update = React.useCallback((next: CrewData) => setData(next), []);

  const options = data.options;
  const activeId = data.activeId || options[0]?.id || "";

  const active = options.find((o) => o.id === activeId) ?? options[0];
  const [expandedActivityId, setExpandedActivityId] = React.useState<string | null>(null);
  const pendingExpandRef = React.useRef<string | null>(null);

  const toggleActivity = React.useCallback((id: string, isOpen: boolean) => {
    if (!isOpen) {
      setExpandedActivityId(null);
      return;
    }
    if (expandedActivityId === null) {
      setExpandedActivityId(id);
    } else {
      pendingExpandRef.current = id;
      setExpandedActivityId(null);
      setTimeout(() => {
        setExpandedActivityId(pendingExpandRef.current);
        pendingExpandRef.current = null;
      }, 220);
    }
  }, [expandedActivityId]);

  React.useEffect(() => {
    onActivitiesChange?.(
      active.activities.map((a) => ({
        id: a.id,
        name: a.name,
        pointType: a.pointType,
        predecessors: a.predecessors,
        resources: a.resources.map((r) => ({ name: r.name, max: r.max })),
      }))
    );
  }, [active.activities, onActivitiesChange]);

  /* ── Option CRUD ───────────────────────────────────────────────── */

  const handleAdd = React.useCallback(() => {
    const opt = createCrewOption(`Option ${data.options.length + 1}`);
    update({ ...data, options: [...data.options, opt], activeId: opt.id });
  }, [data, update]);

  const handleDelete = React.useCallback(
    (id: string) => {
      const next = data.options.filter((o) => o.id !== id);
      const newActiveId = data.activeId === id && next.length > 0 ? next[0].id : data.activeId;
      update({ ...data, options: next, activeId: newActiveId });
    },
    [data, update]
  );

  const handleRename = React.useCallback(
    (id: string, name: string) => {
      update({ ...data, options: data.options.map((o) => (o.id === id ? { ...o, name } : o)) });
    },
    [data, update]
  );

  /* ── Activity CRUD ─────────────────────────────────────────────── */

  const addActivity = (optionId: string) => {
    const act = createActivity(`Activity ${(data.options.find((o) => o.id === optionId)?.activities.length ?? 0) + 1}`);
    setExpandedActivityId(act.id);
    update({
      ...data,
      options: data.options.map((o) =>
        o.id === optionId ? { ...o, activities: [...o.activities, act] } : o
      ),
    });
  };

  const updateActivity = (optionId: string, actId: string, patch: Partial<Activity>) => {
    update({
      ...data,
      options: data.options.map((o) =>
        o.id === optionId
          ? { ...o, activities: o.activities.map((a) => (a.id === actId ? { ...a, ...patch } : a)) }
          : o
      ),
    });
  };

  const removeActivity = (optionId: string, actId: string) => {
    update({
      ...data,
      options: data.options.map((o) =>
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
      ),
    });
  };

  /* ── Resource CRUD ─────────────────────────────────────────────── */

  const addResource = (optionId: string, actId: string) => {
    update({
      ...data,
      options: data.options.map((o) =>
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
      ),
    });
  };

  const updateResource = (optionId: string, actId: string, resId: string, patch: Partial<Omit<Resource, "id">>) => {
    update({
      ...data,
      options: data.options.map((o) =>
        o.id === optionId
          ? {
              ...o,
              activities: o.activities.map((a) =>
                a.id === actId
                  ? { ...a, resources: a.resources.map((r) => (r.id === resId ? { ...r, ...patch } : r)) }
                  : a
              ),
            }
          : o
      ),
    });
  };

  const removeResource = (optionId: string, actId: string, resId: string) => {
    update({
      ...data,
      options: data.options.map((o) =>
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
      ),
    });
  };

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Crew</h2>
      </div>

      {/* Option selector */}
      <OptionSelector
        options={options}
        activeId={activeId}
        onSelect={(id) => update({ ...data, activeId: id })}
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
            title={act.name}
            open={expandedActivityId === act.id}
            onToggle={(isOpen) => toggleActivity(act.id, isOpen)}
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
                label="Add"
              />
            </Field>

            <Field label="Resources" layout="horizontal">
              <div className="flex flex-col gap-[var(--space-2)]">
                {act.resources.map((res) => (
                  <div key={res.id} className="flex items-center gap-[var(--space-2)]">
                    <Input
                      value={res.name}
                      onChange={(e) => updateResource(active.id, act.id, res.id, { name: e.target.value })}
                      className="basis-2/3 text-xs"
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={res.max}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        const n = Math.max(1, parseInt(v, 10) || 1);
                        updateResource(active.id, act.id, res.id, { max: n });
                      }}
                      className="basis-1/3 text-right text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      title="Max resources"
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
                  Add
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
