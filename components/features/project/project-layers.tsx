"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData, AutosaveStatus } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

const { plus: Plus, trash: Trash2, x: X } = appIcons;

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface LayerConfig {
  id: string;
  name: string;
  code: string;
  buffer: string;
  color: string;
  from: string;
  sourceFiles: string[];
  sourceField: string;
  sourceValues: string[];
}

function createLayer(index: number): LayerConfig {
  const n = index + 1;
  const code = `layer_${String(n).padStart(2, "0")}`;
  return {
    id: crypto.randomUUID(),
    name: `Layer ${n}`,
    code,
    buffer: "0",
    color: PALETTE[n % PALETTE.length],
    from: "gis",
    sourceFiles: [],
    sourceField: "fclass",
    sourceValues: [],
  };
}

const PALETTE = [
  "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD",
  "#8C564B", "#E377C2", "#7F7F7F", "#BCBD22", "#17BECF",
];

interface LayersData {
  layers: LayerConfig[];
  activeId: string;
}
const DEFAULT_LAYERS: LayersData = {
  layers: [createLayer(0)],
  activeId: "",
};

/* ------------------------------------------------------------------
   Dummy data
   ------------------------------------------------------------------ */

const DUMMY_SOURCE_FILES = [
  "roads.shp",
  "railways.shp",
  "waterways.shp",
  "buildings.shp",
  "landuse.shp",
  "transport_a.shp",
];

const DUMMY_SOURCE_VALUES: Record<string, string[]> = {
  fclass: [
    "primary", "secondary", "tertiary", "residential",
    "motorway", "trunk", "track", "path", "river", "stream",
  ],
};

/* ------------------------------------------------------------------
   Tag select (add/remove from list)
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
            <div className="absolute left-0 top-full z-20 mt-1 max-h-48 min-w-[10rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
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
   Color picker
   ------------------------------------------------------------------ */

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-[var(--space-2)]">
      <label className="relative flex h-[var(--control-height-md)] w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
        <div
          className="absolute inset-[2px] rounded-[2px]"
          // eslint-disable-next-line template/no-jsx-style-prop -- runtime color value
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 font-mono text-xs uppercase"
      />
    </div>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function ProjectLayers() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update, status } = useSectionData<LayersData>(projectId, "layers", DEFAULT_LAYERS);

  const layers = data.layers;
  const activeId = data.activeId || layers[0]?.id || "";

  const activeLayer = layers.find((l) => l.id === activeId) ?? layers[0];

  const updateLayer = React.useCallback(
    (id: string, patch: Partial<LayerConfig>) => {
      update({ ...data, layers: data.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    },
    [data, update]
  );

  const addLayer = React.useCallback(() => {
    const l = createLayer(data.layers.length);
    update({ ...data, layers: [...data.layers, l], activeId: l.id });
  }, [data, update]);

  const deleteLayer = React.useCallback(
    (id: string) => {
      const next = data.layers.filter((l) => l.id !== id);
      const newActiveId = activeId === id && next.length > 0 ? next[0].id : data.activeId;
      update({ ...data, layers: next, activeId: newActiveId });
    },
    [data, update, activeId]
  );

  const sourceValues = DUMMY_SOURCE_VALUES[activeLayer.sourceField] ?? [];

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Autosave status */}
      <div className="flex justify-end">
        <AutosaveStatus status={status} />
      </div>

      {/* Layer selector */}
      <div className="flex flex-col gap-[var(--space-2)]">
        <div className="flex flex-wrap items-center gap-[var(--space-1)]">
          {layers.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => update({ ...data, activeId: l.id })}
              className={cn(
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                l.id === activeId
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {l.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addLayer}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            aria-label="Add layer"
          >
            <Plus size={12} />
          </button>
        </div>
        {layers.length > 1 && (
          <div className="flex items-center gap-[var(--space-1)]">
            <button
              type="button"
              onClick={() => deleteLayer(activeId)}
              className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
            >
              <Trash2 size={10} /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      <Field label="Code" htmlFor="lay-code" layout="horizontal">
        <Input
          id="lay-code"
          value={activeLayer.code}
          readOnly
          className="bg-[var(--color-bg-elevated)]"
        />
      </Field>

      <Field label="Buffer (px)" htmlFor="lay-buffer" layout="horizontal">
        <Input
          id="lay-buffer"
          type="number"
          min={0}
          value={activeLayer.buffer}
          onChange={(e) => updateLayer(activeLayer.id, { buffer: e.target.value })}
        />
      </Field>

      <Field label="Color" layout="horizontal">
        <ColorPicker
          value={activeLayer.color}
          onChange={(v) => updateLayer(activeLayer.id, { color: v })}
        />
      </Field>

      <Field label="Source" htmlFor="lay-source" layout="horizontal">
        <Input
          id="lay-source"
          value={activeLayer.from}
          readOnly
          className="bg-[var(--color-bg-elevated)]"
        />
      </Field>

      <Field label="Source Files" layout="horizontal">
        <TagSelect
          selected={activeLayer.sourceFiles}
          available={DUMMY_SOURCE_FILES}
          onAdd={(v) =>
            updateLayer(activeLayer.id, {
              sourceFiles: [...activeLayer.sourceFiles, v],
            })
          }
          onRemove={(i) =>
            updateLayer(activeLayer.id, {
              sourceFiles: activeLayer.sourceFiles.filter((_, idx) => idx !== i),
            })
          }
          label="Source File"
        />
      </Field>

      <Field label="Source Field" layout="horizontal">
        <Select
          value={activeLayer.sourceField}
          disabled
          onChange={(e) => updateLayer(activeLayer.id, { sourceField: e.target.value })}
        >
          <option value="fclass">fclass</option>
        </Select>
      </Field>

      <Field label="Source Value" layout="horizontal">
        <TagSelect
          selected={activeLayer.sourceValues}
          available={sourceValues}
          onAdd={(v) =>
            updateLayer(activeLayer.id, {
              sourceValues: [...activeLayer.sourceValues, v],
            })
          }
          onRemove={(i) =>
            updateLayer(activeLayer.id, {
              sourceValues: activeLayer.sourceValues.filter((_, idx) => idx !== i),
            })
          }
          label="Source Value"
        />
      </Field>
    </div>
  );
}
