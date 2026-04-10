"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;
import { CoordinateInput } from "@/components/ui/coordinate-input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData, AutosaveStatus } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface OptionRow {
  id: string;
  design: string;
  region: string;
  spShiftX: string;
  spShiftY: string;
  rpShiftX: string;
  rpShiftY: string;
}

interface DesignOption {
  id: string;
  name: string;
  partitioning: string;
  rows: OptionRow[];
}

function createRow(): OptionRow {
  return {
    id: crypto.randomUUID(),
    design: "",
    region: "",
    spShiftX: "0",
    spShiftY: "0",
    rpShiftX: "0",
    rpShiftY: "0",
  };
}

function createOption(name: string): DesignOption {
  return {
    id: crypto.randomUUID(),
    name,
    partitioning: "",
    rows: [createRow()],
  };
}

interface DesignOptionsData {
  options: DesignOption[];
  activeId: string;
}

const DEFAULT_DESIGN_OPTIONS: DesignOptionsData = {
  options: [createOption("Option 1")],
  activeId: "",
};

/* ------------------------------------------------------------------
   Dummy data — will come from actual Design / Partitioning state
   ------------------------------------------------------------------ */

const DUMMY_DESIGNS = ["Design 1"];
const DUMMY_PARTITIONINGS = ["Design", "Zipper"];
const DUMMY_REGIONS: Record<string, string[]> = {
  Design: ["design_reg"],
  Zipper: ["zipper_reg_a", "zipper_reg_b"],
};

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */

export function ProjectDesignOptions() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update, status } = useSectionData<DesignOptionsData>(projectId, "design_options", DEFAULT_DESIGN_OPTIONS);
  const options = data.options;
  const activeId = data.activeId || options[0]?.id || "";

  const activeOption = options.find((o) => o.id === activeId) ?? options[0];

  const updateOption = React.useCallback(
    (id: string, patch: Partial<DesignOption>) => {
      update({
        ...data,
        options: data.options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      });
    },
    [data, update]
  );

  const addOption = React.useCallback(() => {
    const o = createOption(`Option ${data.options.length + 1}`);
    update({
      ...data,
      options: [...data.options, o],
      activeId: o.id,
    });
  }, [data, update]);

  const deleteOption = React.useCallback(
    (id: string) => {
      const next = data.options.filter((o) => o.id !== id);
      update({
        ...data,
        options: next,
        activeId: activeId === id && next.length > 0 ? next[0].id : data.activeId,
      });
    },
    [data, activeId, update]
  );

  const updateRow = React.useCallback(
    (rowId: string, patch: Partial<OptionRow>) => {
      update({
        ...data,
        options: data.options.map((o) => {
          if (o.id !== activeId) return o;
          return {
            ...o,
            rows: o.rows.map((r) =>
              r.id === rowId ? { ...r, ...patch } : r
            ),
          };
        }),
      });
    },
    [data, activeId, update]
  );

  const addRow = React.useCallback(() => {
    updateOption(activeId, {
      rows: [...activeOption.rows, createRow()],
    });
  }, [activeId, activeOption.rows, updateOption]);

  const removeRow = React.useCallback(
    (rowId: string) => {
      updateOption(activeId, {
        rows: activeOption.rows.filter((r) => r.id !== rowId),
      });
    },
    [activeId, activeOption.rows, updateOption]
  );

  const regions = activeOption.partitioning
    ? DUMMY_REGIONS[activeOption.partitioning] ?? []
    : [];

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const editRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      updateOption(editingId, { name: editValue.trim() });
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <div className="flex items-center justify-end">
        <AutosaveStatus status={status} />
      </div>

      {/* Option tabs */}
      <div className="flex flex-col gap-[var(--space-2)]">
        <div className="flex flex-wrap items-center gap-[var(--space-1)]">
          {options.map((o) => {
            if (o.id === editingId) {
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
                >
                  <input
                    ref={editRef}
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
                key={o.id}
                type="button"
                onClick={() => update({ ...data, activeId: o.id })}
                className={cn(
                  "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                  o.id === activeId
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                    : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {o.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={addOption}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            aria-label="Add option"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="flex items-center gap-[var(--space-1)]">
          <button
            type="button"
            onClick={() => {
              const active = options.find((o) => o.id === activeId);
              if (active) {
                setEditingId(active.id);
                setEditValue(active.name);
              }
            }}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <Pencil size={10} /> Rename
          </button>
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => deleteOption(activeId)}
              className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
            >
              <Trash2 size={10} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Partitioning selector */}
      <Field label="Partitioning" layout="horizontal">
        <Select
          value={activeOption.partitioning}
          onChange={(e) =>
            updateOption(activeId, { partitioning: e.target.value })
          }
        >
          <option value="">Select…</option>
          {DUMMY_PARTITIONINGS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>

      {/* Rows: Design + Region + SP Shift + RP Shift */}
      {activeOption.partitioning && (
        <div className="flex flex-col gap-[var(--space-2)]">
          {/* Header */}
          <div className="flex items-center gap-[var(--space-2)]">
            <span className="w-[110px] shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Design
            </span>
            <span className="w-[110px] shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Region
            </span>
            <span className="flex-1 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              SP Shift
            </span>
            <span className="flex-1 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              RP Shift
            </span>
            <div className="w-7" />
          </div>

          {/* Rows */}
          {activeOption.rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-[var(--space-2)]"
            >
              <div className="w-[110px] shrink-0">
                <Select
                  value={row.design}
                  onChange={(e) => updateRow(row.id, { design: e.target.value })}
                >
                  <option value="">—</option>
                  {DUMMY_DESIGNS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
              </div>
              <div className="w-[110px] shrink-0">
                <Select
                  value={row.region}
                  onChange={(e) => updateRow(row.id, { region: e.target.value })}
                >
                  <option value="">—</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <CoordinateInput
                  x={row.spShiftX}
                  y={row.spShiftY}
                  onXChange={(v) => updateRow(row.id, { spShiftX: v })}
                  onYChange={(v) => updateRow(row.id, { spShiftY: v })}
                />
              </div>
              <div className="flex-1">
                <CoordinateInput
                  x={row.rpShiftX}
                  y={row.rpShiftY}
                  onXChange={(v) => updateRow(row.id, { rpShiftX: v })}
                  onYChange={(v) => updateRow(row.id, { rpShiftY: v })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={activeOption.rows.length <= 1}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-status-danger)] disabled:opacity-30 disabled:hover:text-[var(--color-text-muted)]"
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Add row */}
          <Button variant="ghost" size="sm" onClick={addRow} className="self-start">
            <Plus size={12} className="mr-[var(--space-1)]" />
            Add row
          </Button>
        </div>
      )}
    </div>
  );
}
