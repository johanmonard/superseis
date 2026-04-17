"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useQueries } from "@tanstack/react-query";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import { fetchFileDistinctValues } from "@/services/api/project-files";
import type { FileCategory } from "@/services/api/project-files";
import { useProjectFiles } from "@/services/query/project-files";

const {
  plus: Plus,
  trash: Trash2,
  x: X,
  pencil: Pencil,
  check: Check,
} = appIcons;

/* ------------------------------------------------------------------
   Geofabrik OSM filename → osm_edits target

   Convention (standard Geofabrik shapefile package):
   - any name containing "_a_"  → polygon
   - railways, roads, waterways → line
   - natural, places, pofw, pois, traffic, transport (without _a_) → point
   ------------------------------------------------------------------ */

const OSM_LINE_THEMES = new Set(["railways", "roads", "waterways"]);
const OSM_POINT_THEMES = new Set([
  "natural", "places", "pofw", "pois", "traffic", "transport",
]);

function osmEditsForOsmFile(osmName: string): string | null {
  if (!osmName.startsWith("gis_osm")) return null;
  if (osmName.includes("_a_")) return "osm_edits_polygons";
  // Theme is the segment between "gis_osm_" and "_free"
  const m = osmName.match(/^gis_osm_([a-z0-9]+)_free/);
  const theme = m?.[1] ?? "";
  if (OSM_LINE_THEMES.has(theme)) return "osm_edits_lines";
  if (OSM_POINT_THEMES.has(theme)) return "osm_edits_points";
  return null;
}

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface LayerConfig {
  id: string;
  name: string;
  /** Unique integer, assigned once at creation and never changed. */
  code: number;
  buffer: string;
  color: string;
  from: string;
  sourceFiles: string[];
  sourceField: string;
  sourceValues: string[];
}

const PALETTE = [
  "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD",
  "#8C564B", "#E377C2", "#7F7F7F", "#BCBD22", "#17BECF",
];

function createLayer(code: number): LayerConfig {
  return {
    id: crypto.randomUUID(),
    name: `Layer ${code}`,
    code,
    buffer: "0",
    color: PALETTE[code % PALETTE.length],
    from: "gis",
    sourceFiles: [],
    sourceField: "fclass",
    sourceValues: [],
  };
}

interface LayersData {
  layers: LayerConfig[];
  activeId: string;
  /** Monotonic counter; consumed every time a new layer is created. */
  nextCode: number;
}
const DEFAULT_LAYERS: LayersData = {
  layers: [createLayer(1)],
  activeId: "",
  nextCode: 2,
};

/**
 * Migrate persisted layer state to the current schema.  Legacy data may have
 * ``code: "layer_NN"`` strings and/or a missing ``nextCode``; promote both.
 * Codes are kept stable where possible; duplicates or non-numeric values are
 * reassigned fresh, ever-increasing integers.
 */
function migrateLayersData(data: LayersData): LayersData {
  const used = new Set<number>();
  const out: LayerConfig[] = [];
  let maxCode = 0;

  for (const l of data.layers) {
    const raw = l.code as unknown;
    let n: number | null = null;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      n = Math.floor(raw);
    } else if (typeof raw === "string") {
      const m = raw.match(/(\d+)/);
      if (m) n = parseInt(m[1], 10);
    }
    if (n == null || used.has(n)) n = null;
    if (n != null) {
      used.add(n);
      maxCode = Math.max(maxCode, n);
    }
    out.push({ ...l, code: n ?? -1 }); // temp -1, filled below
  }

  // Fill in any unresolved codes with fresh sequential integers.
  let cursor = maxCode + 1;
  for (const l of out) {
    if (l.code === -1) {
      while (used.has(cursor)) cursor++;
      l.code = cursor;
      used.add(cursor);
      maxCode = Math.max(maxCode, cursor);
      cursor++;
    }
  }

  const nextCode =
    typeof data.nextCode === "number" && data.nextCode > maxCode
      ? data.nextCode
      : maxCode + 1;

  return { ...data, layers: out, nextCode };
}

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
   Layer header — compact selector with inline rename and reorder
   ------------------------------------------------------------------ */

function LayerHeader({
  layers,
  activeId,
  activeIndex,
  onSelect,
  onRename,
  onMove,
  onAdd,
  onDelete,
}: {
  layers: LayerConfig[];
  activeId: string;
  activeIndex: number;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onMove: (delta: -1 | 1) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const active = layers.find((l) => l.id === activeId);

  const beginRename = React.useCallback(() => {
    if (!active) return;
    setDraft(active.name);
    setRenaming(true);
  }, [active]);

  React.useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  // Leaving the active layer (via select or delete) cancels any pending rename.
  React.useEffect(() => {
    setRenaming(false);
  }, [activeId]);

  const commitRename = React.useCallback(() => {
    if (!active) return;
    if (draft.trim() && draft.trim() !== active.name) onRename(draft);
    setRenaming(false);
  }, [active, draft, onRename]);

  const cancelRename = React.useCallback(() => {
    setRenaming(false);
  }, []);

  const canMoveUp = activeIndex > 0;
  const canMoveDown = activeIndex >= 0 && activeIndex < layers.length - 1;
  const canDelete = layers.length > 1;

  return (
    <div className="flex items-center gap-[var(--space-1)]">
      {/* Selector / inline rename */}
      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            aria-label="Rename layer"
            className="text-xs"
          />
        ) : (
          <Select
            aria-label="Active layer"
            value={activeId}
            onChange={(e) => onSelect(e.target.value)}
            className="text-xs"
          >
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Actions */}
      <IconButton
        title={renaming ? "Save name" : "Rename layer"}
        onClick={renaming ? commitRename : beginRename}
      >
        {renaming ? <Check size={12} /> : <Pencil size={12} />}
      </IconButton>
      <IconButton
        title="Move up"
        onClick={() => onMove(-1)}
        disabled={!canMoveUp || renaming}
      >
        <span aria-hidden className="text-[11px] leading-none">▲</span>
      </IconButton>
      <IconButton
        title="Move down"
        onClick={() => onMove(1)}
        disabled={!canMoveDown || renaming}
      >
        <span aria-hidden className="text-[11px] leading-none">▼</span>
      </IconButton>
      <IconButton title="Add layer" onClick={onAdd} disabled={renaming}>
        <Plus size={12} />
      </IconButton>
      <IconButton
        title="Delete layer"
        onClick={onDelete}
        disabled={!canDelete || renaming}
        variant="danger"
      >
        <Trash2 size={12} />
      </IconButton>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
        "text-[var(--color-text-muted)] transition-colors",
        "hover:bg-[var(--color-bg-elevated)]",
        variant === "danger"
          ? "hover:text-[var(--color-status-danger)]"
          : "hover:text-[var(--color-text-primary)]",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export interface ActiveLayerInfo {
  color: string;
  sourceFiles: string[];
  sourceValues: string[];
}

export function ProjectLayers({
  onActiveLayerChange,
}: {
  onActiveLayerChange?: (
    projectId: number | null,
    info: ActiveLayerInfo | null,
  ) => void;
} = {}) {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: rawData, update: rawUpdate, status } = useSectionData<LayersData>(
    projectId, "layers", DEFAULT_LAYERS,
  );

  // Migrate persisted data once per load so downstream code can rely on the
  // current schema (integer ``code``, present ``nextCode``).
  const data = React.useMemo(() => migrateLayersData(rawData), [rawData]);
  const update = rawUpdate;

  // If the loaded state needed migration, persist the fixed-up copy so we
  // don't re-migrate on every render.
  React.useEffect(() => {
    if (data !== rawData) update(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: projectFiles } = useProjectFiles(projectId);
  const availableOsmLayers = React.useMemo(
    () => (projectFiles?.gis_layers ?? []).map((f) => f.replace(/\.gpkg$/, "")),
    [projectFiles?.gis_layers],
  );

  const layers = data.layers;
  const activeId = data.activeId || layers[0]?.id || "";

  const activeLayer = layers.find((l) => l.id === activeId) ?? layers[0];
  const activeIndex = layers.findIndex((l) => l.id === activeId);

  // Publish active-layer info to parent (for viewport rendering).
  const sourceFilesKey = activeLayer?.sourceFiles.join("|") ?? "";
  const sourceValuesKey = activeLayer?.sourceValues.join("|") ?? "";
  React.useEffect(() => {
    if (!activeLayer) {
      onActiveLayerChange?.(projectId, null);
      return;
    }
    onActiveLayerChange?.(projectId, {
      color: activeLayer.color,
      sourceFiles: activeLayer.sourceFiles,
      sourceValues: activeLayer.sourceValues,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeLayer?.color, sourceFilesKey, sourceValuesKey, onActiveLayerChange]);

  const updateLayer = React.useCallback(
    (id: string, patch: Partial<LayerConfig>) => {
      update({ ...data, layers: data.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    },
    [data, update]
  );

  const addLayer = React.useCallback(() => {
    const l = createLayer(data.nextCode);
    update({
      ...data,
      layers: [...data.layers, l],
      activeId: l.id,
      nextCode: data.nextCode + 1,
    });
  }, [data, update]);

  const deleteLayer = React.useCallback(
    (id: string) => {
      const next = data.layers.filter((l) => l.id !== id);
      const newActiveId = activeId === id && next.length > 0 ? next[0].id : data.activeId;
      update({ ...data, layers: next, activeId: newActiveId });
    },
    [data, update, activeId]
  );

  const moveLayer = React.useCallback(
    (id: string, delta: -1 | 1) => {
      const idx = data.layers.findIndex((l) => l.id === id);
      if (idx < 0) return;
      const target = idx + delta;
      if (target < 0 || target >= data.layers.length) return;
      const next = data.layers.slice();
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      update({ ...data, layers: next });
    },
    [data, update],
  );

  const renameLayer = React.useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      update({
        ...data,
        layers: data.layers.map((l) => (l.id === id ? { ...l, name: trimmed } : l)),
      });
    },
    [data, update],
  );

  // User-facing source files: hide the osm_edits companions (they travel in
  // the persisted payload but are implementation detail).
  const visibleSourceFiles = React.useMemo(
    () => activeLayer.sourceFiles.filter((f) => !f.startsWith("osm_edits_")),
    [activeLayer.sourceFiles]
  );

  // Resolve each visible source file (bare stem) to a (category, filename)
  // pair so we can fetch distinct values per file. osm_edits companions are
  // excluded — they don't contribute to the Source Value list.
  const sourceFileRefs = React.useMemo(() => {
    return visibleSourceFiles.map((stem) => {
      const category: FileCategory = stem.startsWith("osm_edits_")
        ? "osm_edits"
        : "gis_layers";
      return { category, filename: `${stem}.gpkg` };
    });
  }, [visibleSourceFiles]);

  const distinctQueries = useQueries({
    queries: sourceFileRefs.map((ref) => ({
      queryKey: ["distinctValues", projectId, ref.category, ref.filename, activeLayer.sourceField],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchFileDistinctValues(projectId!, ref.category, ref.filename, activeLayer.sourceField, signal),
      enabled: projectId !== null && projectId > 0 && Boolean(activeLayer.sourceField),
      staleTime: 5 * 60_000,
    })),
  });

  const sourceValues = React.useMemo(() => {
    const set = new Set<string>();
    for (const q of distinctQueries) {
      for (const v of q.data ?? []) set.add(v);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [distinctQueries]);

  const sourceValuesLoading = distinctQueries.some((q) => q.isLoading);

  // Prune selected sourceValues to those still present in the available pool.
  // Runs after a source file is removed (or added and queries settle).
  const selectedValuesKey = activeLayer?.sourceValues.join("|") ?? "";
  const availableValuesKey = sourceValues.join("|");
  React.useEffect(() => {
    if (!activeLayer) return;
    if (sourceValuesLoading) return;
    if (activeLayer.sourceValues.length === 0) return;
    const avail = new Set(sourceValues);
    const filtered = activeLayer.sourceValues.filter((v) => avail.has(v));
    if (filtered.length !== activeLayer.sourceValues.length) {
      updateLayer(activeLayer.id, { sourceValues: filtered });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValuesLoading, availableValuesKey, selectedValuesKey, activeLayer?.id]);

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Layer header: select + rename + reorder + add + delete */}
      <LayerHeader
        layers={layers}
        activeId={activeId}
        activeIndex={activeIndex}
        onSelect={(id) => update({ ...data, activeId: id })}
        onRename={(name) => renameLayer(activeLayer.id, name)}
        onMove={(delta) => moveLayer(activeLayer.id, delta)}
        onAdd={addLayer}
        onDelete={() => deleteLayer(activeLayer.id)}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      <Field label="Code" htmlFor="lay-code" layout="horizontal">
        <Input
          id="lay-code"
          value={String(activeLayer.code)}
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
          selected={visibleSourceFiles}
          available={availableOsmLayers.filter((f) => !visibleSourceFiles.includes(f))}
          onAdd={(v) => {
            const next = [...activeLayer.sourceFiles, v];
            const osmEdits = osmEditsForOsmFile(v);
            if (osmEdits && !next.includes(osmEdits)) next.push(osmEdits);
            updateLayer(activeLayer.id, { sourceFiles: next });
          }}
          onRemove={(i) => {
            const removed = visibleSourceFiles[i];
            const next = activeLayer.sourceFiles.filter((f) => f !== removed);
            // Drop any osm_edits companion no longer referenced by a remaining gis_osm file
            const stillNeeded = new Set(
              next
                .filter((f) => !f.startsWith("osm_edits_"))
                .map((f) => osmEditsForOsmFile(f))
                .filter((e): e is string => Boolean(e))
            );
            const pruned = next.filter(
              (f) => !f.startsWith("osm_edits_") || stillNeeded.has(f)
            );
            updateLayer(activeLayer.id, { sourceFiles: pruned });
          }}
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
          available={sourceValues.filter((v) => !activeLayer.sourceValues.includes(v))}
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
          label={sourceValuesLoading ? "Loading..." : "Source Value"}
        />
      </Field>
    </div>
  );
}
