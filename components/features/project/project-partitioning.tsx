"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface RegionGroup {
  id: string;
  name: string;
  pointTypes: string[];
  grid: string;
  regionTag: string;
  defaultValue: string;
  polygons: string[];
}

const POINT_TYPE_OPTIONS = ["Receivers", "Sources"];
const GRID_OPTIONS = ["Theoretical", "Offseted"];

// Dummy available polygons (from project files)
const AVAILABLE_POLYGONS = [
  "exclusion_zone_north",
  "survey_boundary_v2",
  "river_buffer_500m",
  "protected_area_east",
  "camp_exclusion",
];

function createGroup(name: string): RegionGroup {
  const tag = name.toLowerCase().replace(/\s+/g, "_") + "_reg";
  return {
    id: crypto.randomUUID(),
    name,
    pointTypes: ["Receivers", "Sources"],
    grid: "Theoretical",
    regionTag: tag,
    defaultValue: "0",
    polygons: [],
  };
}

/* ------------------------------------------------------------------
   Group selector bar
   ------------------------------------------------------------------ */

function GroupSelector({
  groups,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  groups: RegionGroup[];
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

  const startEdit = (group: RegionGroup) => {
    setEditingId(group.id);
    setEditValue(group.name);
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
        {groups.map((g) => {
          const isActive = g.id === activeId;
          const isEditing = g.id === editingId;

          if (isEditing) {
            return (
              <div
                key={g.id}
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
              key={g.id}
              type="button"
              onClick={() => onSelect(g.id)}
              className={cn(
                "flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {g.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add group"
        >
          <Plus size={12} />
        </button>
      </div>
      {/* Edit / Delete actions for active group */}
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = groups.find((g) => g.id === activeId);
            if (active) startEdit(active);
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {groups.length > 1 && (
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
   Polygon list with add from available
   ------------------------------------------------------------------ */

function PolygonAddButton({
  polygons,
  onAdd,
}: {
  polygons: string[];
  onAdd: (name: string) => void;
}) {
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
    <div ref={ref} className="relative self-start">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plus size={12} className="mr-[var(--space-1)]" /> Polygon
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 min-w-[12rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          {polygons.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { onAdd(p); setOpen(false); }}
              className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PolygonList({
  selected,
  available,
  onAdd,
  onRemove,
}: {
  selected: string[];
  available: string[];
  onAdd: (name: string) => void;
  onRemove: (index: number) => void;
}) {
  const unselected = available.filter((p) => !selected.includes(p));

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      {selected.length > 0 && (
        <div className="flex flex-col gap-[var(--space-1)]">
          {selected.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="flex shrink-0 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
            >
              <span className="truncate text-xs text-[var(--color-text-secondary)]">
                {name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 ml-[var(--space-2)] text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {unselected.length > 0 ? (
        <PolygonAddButton polygons={unselected} onAdd={onAdd} />
      ) : selected.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          No polygons available. Upload polygon files first.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------
   Main form
   ------------------------------------------------------------------ */

export function ProjectPartitioning() {
  const [groups, setGroups] = React.useState<RegionGroup[]>([
    createGroup("Design"),
  ]);
  const [activeId, setActiveId] = React.useState(groups[0].id);

  const activeGroup = groups.find((g) => g.id === activeId) ?? groups[0];

  const updateGroup = React.useCallback(
    (id: string, patch: Partial<RegionGroup>) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g;
          const updated = { ...g, ...patch };
          // Auto-update region tag when name changes
          if (patch.name !== undefined) {
            updated.regionTag =
              patch.name.toLowerCase().replace(/\s+/g, "_") + "_reg";
          }
          return updated;
        })
      );
    },
    []
  );

  const handleAdd = React.useCallback(() => {
    const newGroup = createGroup(`Group ${groups.length + 1}`);
    setGroups((prev) => [...prev, newGroup]);
    setActiveId(newGroup.id);
  }, [groups.length]);

  const handleDelete = React.useCallback(
    (id: string) => {
      setGroups((prev) => {
        const next = prev.filter((g) => g.id !== id);
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
      updateGroup(id, { name });
    },
    [updateGroup]
  );

  const togglePointType = React.useCallback(
    (type: string) => {
      const current = activeGroup.pointTypes;
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      updateGroup(activeGroup.id, { pointTypes: next });
    },
    [activeGroup, updateGroup]
  );

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Group selector */}
      <GroupSelector
        groups={groups}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={handleAdd}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Group fields */}
      <div className="flex flex-col gap-[var(--space-4)]">
        <Field label="Point Type" layout="horizontal">
          <div className="flex items-center gap-[var(--space-4)]">
            {POINT_TYPE_OPTIONS.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)]"
              >
                <Checkbox
                  checked={activeGroup.pointTypes.includes(opt)}
                  onCheckedChange={() => togglePointType(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Grid" htmlFor="reg-grid" layout="horizontal">
          <Select
            id="reg-grid"
            value={activeGroup.grid}
            onChange={(e) =>
              updateGroup(activeGroup.id, { grid: e.target.value })
            }
          >
            {GRID_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Region Tag" htmlFor="reg-tag" layout="horizontal">
          <Input
            id="reg-tag"
            value={activeGroup.regionTag}
            readOnly
            className="bg-[var(--color-bg-elevated)]"
          />
        </Field>

        <Field label="Default Value" htmlFor="reg-default" layout="horizontal">
          <Input
            id="reg-default"
            value={activeGroup.defaultValue}
            readOnly
            className="bg-[var(--color-bg-elevated)]"
          />
        </Field>

        <Field label="Area Allocation" layout="horizontal">
          <PolygonList
            selected={activeGroup.polygons}
            available={AVAILABLE_POLYGONS}
            onAdd={(name) =>
              updateGroup(activeGroup.id, {
                polygons: [...activeGroup.polygons, name],
              })
            }
            onRemove={(index) =>
              updateGroup(activeGroup.id, {
                polygons: activeGroup.polygons.filter((_, i) => i !== index),
              })
            }
          />
        </Field>
      </div>
    </div>
  );
}
