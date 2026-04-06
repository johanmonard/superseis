"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Field } from "@/components/ui/field";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;
import { SliderInput } from "@/components/ui/slider-input";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface DesignGroup {
  id: string;
  name: string;
  rpi: string;
  rli: string;
  spi: string;
  sli: string;
  activeRl: string;
  activeRp: string;
  spSalvo: string;
  roll: string;
}

function createGroup(name: string, overrides?: Partial<DesignGroup>): DesignGroup {
  return {
    id: crypto.randomUUID(),
    name,
    rpi: "0",
    rli: "0",
    spi: "0",
    sli: "0",
    activeRl: "0",
    activeRp: "0",
    spSalvo: "0",
    roll: "0",
    ...overrides,
  };
}

/* ------------------------------------------------------------------
   Group selector
   ------------------------------------------------------------------ */

function GroupSelector({
  groups,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  groups: DesignGroup[];
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
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  const startEdit = (group: DesignGroup) => {
    setEditingId(group.id);
    setEditValue(group.name);
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
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
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
   Main component
   ------------------------------------------------------------------ */

export type { DesignGroup };

export function ProjectDesign({
  onActiveChange,
}: {
  onActiveChange?: (group: DesignGroup) => void;
} = {}) {
  const [groups, setGroups] = React.useState<DesignGroup[]>([
    createGroup("Design 1", {
      rpi: "40",
      rli: "360",
      spi: "40",
      sli: "360",
      activeRl: "12",
      activeRp: "110",
      spSalvo: "9",
      roll: "1",
    }),
  ]);
  const [activeId, setActiveId] = React.useState(groups[0].id);

  const activeGroup = groups.find((g) => g.id === activeId) ?? groups[0];

  // Notify parent when active group values change
  React.useEffect(() => {
    onActiveChange?.(activeGroup);
  }, [activeGroup, onActiveChange]);

  const updateGroup = React.useCallback(
    (id: string, patch: Partial<DesignGroup>) => {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    },
    []
  );

  const handleAdd = React.useCallback(() => {
    const g = createGroup(`Design ${groups.length + 1}`);
    setGroups((prev) => [...prev, g]);
    setActiveId(g.id);
  }, [groups.length]);

  const handleDelete = React.useCallback(
    (id: string) => {
      setGroups((prev) => {
        const next = prev.filter((g) => g.id !== id);
        if (activeId === id && next.length > 0) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId]
  );

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <GroupSelector
        groups={groups}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={handleAdd}
        onRename={(id, name) => updateGroup(id, { name })}
        onDelete={handleDelete}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      <div className="flex flex-col gap-[var(--space-4)]">
        <Field label="RPI" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.rpi) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { rpi: String(v) })}
            min={0}
            max={100}
            step={5}
          />
        </Field>

        <Field label="RLI" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.rli) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { rli: String(v) })}
            min={0}
            max={500}
            step={10}
          />
        </Field>

        <Field label="SPI" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.spi) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { spi: String(v) })}
            min={0}
            max={100}
            step={5}
          />
        </Field>

        <Field label="SLI" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.sli) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { sli: String(v) })}
            min={0}
            max={500}
            step={10}
          />
        </Field>

        <Field label="Active RL" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.activeRl) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { activeRl: String(v) })}
            min={1}
            max={20}
            step={1}
          />
        </Field>

        <Field label="Active RP" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.activeRp) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { activeRp: String(v) })}
            min={1}
            max={500}
            step={10}
          />
        </Field>

        <Field label="SP/salvo" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.spSalvo) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { spSalvo: String(v) })}
            min={1}
            max={500}
            step={1}
          />
        </Field>

        <Field label="Roll" layout="horizontal">
          <SliderInput
            value={Number(activeGroup.roll) || 0}
            onChange={(v) => updateGroup(activeGroup.id, { roll: String(v) })}
            min={1}
            max={10}
            step={1}
          />
        </Field>
      </div>
    </div>
  );
}
