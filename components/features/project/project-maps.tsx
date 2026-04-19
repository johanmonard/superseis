"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import { useProjectSection } from "@/services/query/project-sections";

const { check: Check, gripVertical: GripVertical, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface MapConfig {
  id: string;
  name: string;
  layers: string[];
}

function createMap(index: number): MapConfig {
  return {
    id: crypto.randomUUID(),
    name: `Map ${index + 1}`,
    layers: [],
  };
}

interface MapsData {
  maps: MapConfig[];
  activeId: string;
}
const DEFAULT_MAPS: MapsData = {
  maps: [createMap(0)],
  activeId: "",
};

/* ------------------------------------------------------------------
   Drag-sortable layer list
   ------------------------------------------------------------------ */

function LayerAddButton({
  layers,
  onAdd,
}: {
  layers: string[];
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
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plus size={12} className="mr-[var(--space-1)]" /> Layer
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          {layers.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => { onAdd(l); setOpen(false); }}
              className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LayerImportButton({
  maps,
  onCopy,
}: {
  maps: MapConfig[];
  onCopy: (sourceId: string) => void;
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

  if (maps.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plus size={12} className="mr-[var(--space-1)]" /> Import
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          {maps.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onCopy(m.id); setOpen(false); }}
              className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableLayerList({
  layers,
  available,
  copyableMaps,
  onReorder,
  onAdd,
  onRemove,
  onImportAll,
  onCopyFromMap,
}: {
  layers: string[];
  available: string[];
  copyableMaps: MapConfig[];
  onReorder: (layers: string[]) => void;
  onAdd: (name: string) => void;
  onRemove: (index: number) => void;
  onImportAll: () => void;
  onCopyFromMap: (sourceId: string) => void;
}) {
  const unselected = available.filter((l) => !layers.includes(l));
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [previewLayers, setPreviewLayers] = React.useState<string[] | null>(null);

  const getPreview = React.useCallback(
    (fromIdx: number, toIdx: number): string[] => {
      let target = toIdx;
      if (target > fromIdx) target--;
      if (target === fromIdx) return layers;
      const next = [...layers];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(target, 0, moved);
      return next;
    },
    [layers]
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIdx(index);
    setPreviewLayers(null);
    e.dataTransfer.effectAllowed = "move";
    // Use a transparent drag image so the browser ghost doesn't interfere
    const ghost = document.createElement("div");
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertAt = e.clientY < midY ? index : index + 1;
    setPreviewLayers(getPreview(dragIdx, insertAt));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (previewLayers) {
      onReorder(previewLayers);
    }
    setDragIdx(null);
    setPreviewLayers(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setPreviewLayers(null);
  };

  const displayLayers = previewLayers ?? layers;
  const draggedName = dragIdx !== null ? layers[dragIdx] : null;

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      {layers.length > 0 && (
        <div
          className="relative flex flex-col gap-[var(--space-1)]"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {displayLayers.map((name, i) => {
            const isDragged = name === draggedName && dragIdx !== null;
            return (
              <div
                key={`${name}-${i}`}
                draggable
                onDragStart={(e) => handleDragStart(e, layers.indexOf(name))}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                // eslint-disable-next-line template/no-jsx-style-prop -- runtime ordering
                style={{ order: i }}
                className={cn(
                  "flex shrink-0 cursor-grab items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-2)] transition-all duration-200 ease-out active:cursor-grabbing",
                  isDragged
                    ? "border-[var(--color-accent)] opacity-40 scale-[0.97]"
                    : "border-[var(--color-border-subtle)]"
                )}
              >
                <GripVertical
                  size={12}
                  className="shrink-0 text-[var(--color-text-muted)]"
                />
                <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(layers.indexOf(name))}
                  className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-[var(--space-1)]">
        {unselected.length > 0 && (
          <LayerAddButton layers={unselected} onAdd={onAdd} />
        )}
        {unselected.length > 1 && (
          <Button variant="ghost" size="sm" onClick={onImportAll}>
            <Plus size={12} className="mr-[var(--space-1)]" /> All Layers
          </Button>
        )}
        {copyableMaps.length > 0 && (
          <LayerImportButton maps={copyableMaps} onCopy={onCopyFromMap} />
        )}
      </div>

      {layers.length === 0 && unselected.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          No layers available. Define layers in the Layers page first.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export interface ActiveMapLayer {
  name: string;
  color: string;
  sourceFiles: string[];
  sourceValues: string[];
}

export interface ActiveMapInfo {
  layers: ActiveMapLayer[];
}

interface StoredLayer {
  name?: string;
  color?: string;
  sourceFiles?: string[];
  sourceValues?: string[];
}

export function ProjectMaps({
  onActiveMapChange,
}: {
  onActiveMapChange?: (
    projectId: number | null,
    info: ActiveMapInfo | null,
  ) => void;
} = {}) {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update, status } = useSectionData<MapsData>(projectId, "maps", DEFAULT_MAPS);
  const { data: layersSection } = useProjectSection(projectId, "layers");

  const storedLayers = React.useMemo<StoredLayer[]>(() => {
    const raw = (layersSection?.data as { layers?: StoredLayer[] } | undefined)?.layers;
    return Array.isArray(raw) ? raw : [];
  }, [layersSection]);

  const layerByName = React.useMemo(() => {
    const m = new Map<string, StoredLayer>();
    for (const l of storedLayers) {
      if (typeof l?.name === "string" && l.name.trim()) m.set(l.name.trim(), l);
    }
    return m;
  }, [storedLayers]);

  const availableLayers = React.useMemo<string[]>(
    () => Array.from(layerByName.keys()),
    [layerByName],
  );

  const maps = data.maps;
  const activeId = data.activeId || maps[0]?.id || "";

  const activeMap = maps.find((m) => m.id === activeId) ?? maps[0];

  // Publish the resolved, ordered layer list to the parent for viewport
  // rendering. Layer names that no longer resolve (e.g. renamed/deleted in
  // the Layers page) are dropped silently.
  const resolvedLayers = React.useMemo<ActiveMapLayer[]>(() => {
    const out: ActiveMapLayer[] = [];
    for (const name of activeMap?.layers ?? []) {
      const stored = layerByName.get(name);
      if (!stored) continue;
      out.push({
        name,
        color: typeof stored.color === "string" ? stored.color : "#888888",
        sourceFiles: Array.isArray(stored.sourceFiles) ? stored.sourceFiles : [],
        sourceValues: Array.isArray(stored.sourceValues) ? stored.sourceValues : [],
      });
    }
    return out;
  }, [activeMap, layerByName]);

  const resolvedKey = React.useMemo(
    () =>
      resolvedLayers
        .map(
          (l) =>
            `${l.name}|${l.color}|${l.sourceFiles.join(",")}|${l.sourceValues.join(",")}`,
        )
        .join("||"),
    [resolvedLayers],
  );

  React.useEffect(() => {
    onActiveMapChange?.(
      projectId,
      resolvedLayers.length > 0 ? { layers: resolvedLayers } : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, resolvedKey, onActiveMapChange]);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const editRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      update({ ...data, maps: data.maps.map((m) => (m.id === editingId ? { ...m, name: editValue.trim() } : m)) });
    }
    setEditingId(null);
  };

  const updateMap = React.useCallback(
    (id: string, patch: Partial<MapConfig>) => {
      update({ ...data, maps: data.maps.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
    },
    [data, update]
  );

  const addMap = React.useCallback(() => {
    const m = createMap(data.maps.length);
    update({ ...data, maps: [...data.maps, m], activeId: m.id });
  }, [data, update]);

  const deleteMap = React.useCallback(
    (id: string) => {
      const next = data.maps.filter((m) => m.id !== id);
      const newActiveId = activeId === id && next.length > 0 ? next[0].id : data.activeId;
      update({ ...data, maps: next, activeId: newActiveId });
    },
    [data, update, activeId]
  );

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Map selector */}
      <div className="flex flex-col gap-[var(--space-2)]">
        <div className="flex flex-wrap items-center gap-[var(--space-1)]">
          {maps.map((m) => {
            if (m.id === editingId) {
              return (
                <div
                  key={m.id}
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
                  <button type="button" onClick={commitEdit} className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]">
                    <Check size={10} />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]">
                    <X size={10} />
                  </button>
                </div>
              );
            }
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => update({ ...data, activeId: m.id })}
                className={cn(
                  "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                  m.id === activeId
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                    : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {m.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={addMap}
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            aria-label="Add map"
          >
            <Plus size={12} />
          </button>
        </div>
        <div className="flex items-center gap-[var(--space-1)]">
          <button
            type="button"
            onClick={() => {
              const active = maps.find((m) => m.id === activeId);
              if (active) { setEditingId(active.id); setEditValue(active.name); }
            }}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          >
            <Pencil size={10} /> Rename
          </button>
          {maps.length > 1 && (
            <button
              type="button"
              onClick={() => deleteMap(activeId)}
              className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
            >
              <Trash2 size={10} /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Layers */}
      <SortableLayerList
        layers={activeMap.layers}
        available={availableLayers}
        copyableMaps={maps.filter((m) => m.id !== activeId && m.layers.length > 0)}
        onReorder={(layers) => updateMap(activeId, { layers })}
        onAdd={(name) => updateMap(activeId, { layers: [...activeMap.layers, name] })}
        onRemove={(i) =>
          updateMap(activeId, { layers: activeMap.layers.filter((_, idx) => idx !== i) })
        }
        onImportAll={() => {
          const unselected = availableLayers.filter((l) => !activeMap.layers.includes(l));
          updateMap(activeId, { layers: [...activeMap.layers, ...unselected] });
        }}
        onCopyFromMap={(sourceId) => {
          const source = maps.find((m) => m.id === sourceId);
          if (!source) return;
          const toAdd = source.layers.filter((l) => !activeMap.layers.includes(l));
          updateMap(activeId, { layers: [...activeMap.layers, ...toAdd] });
        }}
      />
    </div>
  );
}
