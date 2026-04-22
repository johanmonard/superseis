"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { usePipelineReport } from "@/lib/use-pipeline-report";
import { useProjectSection } from "@/services/query/project-sections";
import { buildStandardPreset, type DesignAttrs, type Side } from "@/lib/offset-presets";

const {
  check: Check,
  gripVertical: GripVertical,
  pencil: Pencil,
  play: Play,
  plus: Plus,
  trash: Trash2,
  x: X,
} = appIcons;

/* ------------------------------------------------------------------
   Types

   Shape decisions (see planning table, rows 1-14):
   - Partitioning + layer-rule switches live at the side level.
   - Each param set carries: region, offset rules, target priority.
   - Target priority is a flat list of entries. "sep" entries mark the
     boundary between priority groups. Walking the list splits it into
     groups; emitting for the backend collapses each group into one
     `offset_to` tuple.
   ------------------------------------------------------------------ */

interface OffsetRule {
  id: string;
  ruleType: string; // "Max crossline" | "Shifted inline" | "Max radius"
  value: string;
  valueAt?: string; // used only by tuple-valued rules ("Shifted inline" → j_range_at)
}

interface LayerRule {
  layer: string;
  offset: boolean;
  skip: boolean;
}

interface TargetEntry {
  kind: "layer" | "sep";
  id: string;
  layer?: string; // only when kind === "layer"
}

interface ParamSet {
  id: string;
  region: string;
  offsetRules: OffsetRule[];
  targetPriority: TargetEntry[];
}

interface PointTypeConfig {
  map: string;
  snapperMaxDist: string;
  partitioning: string;
  layerRules: LayerRule[];
  params: ParamSet[]; // one per eligible region, keyed by `ParamSet.region`
  activeParamRegion: string; // region name of the active param tab
}

interface OffsetConfig {
  id: string;
  name: string;
  designOption: string;
  sources: PointTypeConfig;
  receivers: PointTypeConfig;
}

/* ------------------------------------------------------------------
   Constants / presets
   ------------------------------------------------------------------ */

const RULE_TYPE_OPTIONS = ["Max crossline", "Shifted inline", "Max radius"];

/* ------------------------------------------------------------------
   Factories
   ------------------------------------------------------------------ */

function createParamSet(): ParamSet {
  return {
    id: crypto.randomUUID(),
    region: "",
    offsetRules: [],
    targetPriority: [],
  };
}

function createPointTypeConfig(): PointTypeConfig {
  return {
    map: "",
    snapperMaxDist: "10",
    partitioning: "",
    layerRules: [],
    params: [], // auto-populated at render time from the eligible regions
    activeParamRegion: "",
  };
}

function createParamSetForRegion(region: string): ParamSet {
  return { ...createParamSet(), region };
}

let configCounter = 0;

function createConfig(): OffsetConfig {
  configCounter++;
  return {
    id: crypto.randomUUID(),
    name: `Option ${configCounter}`,
    designOption: "",
    sources: createPointTypeConfig(),
    receivers: createPointTypeConfig(),
  };
}

/* ------------------------------------------------------------------
   Normalisation

   The offsetters section previously stored partitioning + layer rules
   inside each param set. We now store them at the side level with a
   per-param target-priority list. Normalize older shapes on read so
   existing configs don't crash the component.
   ------------------------------------------------------------------ */

type AnyRecord = Record<string, unknown>;

function normalizeParam(raw: AnyRecord): ParamSet {
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    region: typeof raw.region === "string" ? raw.region : "",
    offsetRules: Array.isArray(raw.offsetRules) ? (raw.offsetRules as OffsetRule[]) : [],
    targetPriority: Array.isArray(raw.targetPriority) ? (raw.targetPriority as TargetEntry[]) : [],
  };
}

function normalizeSide(
  raw: AnyRecord | undefined,
  fallbackMap = "",
  fallbackSnapperMaxDist = "10",
): PointTypeConfig {
  if (!raw) {
    return { ...createPointTypeConfig(), map: fallbackMap, snapperMaxDist: fallbackSnapperMaxDist };
  }
  const rawParams = Array.isArray(raw.params) ? (raw.params as AnyRecord[]) : [];
  const hasSideShape = typeof raw.partitioning === "string" || Array.isArray(raw.layerRules);

  let partitioning = "";
  let layerRules: LayerRule[] = [];
  if (hasSideShape) {
    partitioning = typeof raw.partitioning === "string" ? raw.partitioning : "";
    layerRules = Array.isArray(raw.layerRules) ? (raw.layerRules as LayerRule[]) : [];
  } else {
    // Legacy: partitioning + layerRules lived on the first param set
    const first = rawParams[0] ?? {};
    partitioning = typeof first.partitioning === "string" ? (first.partitioning as string) : "";
    layerRules = Array.isArray(first.layerRules) ? (first.layerRules as LayerRule[]) : [];
  }

  const map = typeof raw.map === "string" ? raw.map : fallbackMap;
  const snapperMaxDist =
    typeof raw.snapperMaxDist === "string" ? raw.snapperMaxDist : fallbackSnapperMaxDist;

  const params = rawParams.map(normalizeParam);
  // Active param is now keyed by region name; migrate from legacy
  // `activeParamIdx` if present.
  let activeParamRegion = "";
  if (typeof raw.activeParamRegion === "string") {
    activeParamRegion = raw.activeParamRegion;
  } else if (typeof raw.activeParamIdx === "number") {
    activeParamRegion = params[raw.activeParamIdx]?.region ?? "";
  }
  return { map, snapperMaxDist, partitioning, layerRules, params, activeParamRegion };
}

function normalizeConfig(raw: AnyRecord): OffsetConfig {
  // Older shape stored map + snapperMaxDist at the config level; keep them as
  // per-side fallbacks so pre-existing configs still show a sensible value.
  const legacyMap = typeof raw.map === "string" ? raw.map : "";
  const legacySnap =
    typeof raw.snapperMaxDist === "string" ? raw.snapperMaxDist : "10";
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" ? raw.name : "Option",
    designOption: typeof raw.designOption === "string" ? raw.designOption : "",
    sources: normalizeSide(raw.sources as AnyRecord | undefined, legacyMap, legacySnap),
    receivers: normalizeSide(raw.receivers as AnyRecord | undefined, legacyMap, legacySnap),
  };
}

/* ------------------------------------------------------------------
   Group selector
   ------------------------------------------------------------------ */

function GroupSelector({
  items,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  items: { id: string; name: string }[];
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

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {items.map((g) => {
          if (g.id === editingId) {
            return (
              <div key={g.id} className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]">
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
                <button type="button" onClick={commitEdit} className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]"><Check size={10} /></button>
                <button type="button" onClick={() => setEditingId(null)} className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"><X size={10} /></button>
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
                g.id === activeId
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
          aria-label="Add"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const a = items.find((i) => i.id === activeId);
            if (a) {
              setEditingId(a.id);
              setEditValue(a.name);
            }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {items.length > 1 && (
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
   Side-level layer rules (switches only)

   Order at this level doesn't matter to the backend (it produces
   `zones_ok_filter` and `zones_keep_filter` as sets), so we render the
   list as the map's layer order and skip drag-reorder entirely. The
   `skip` switch is disabled when `offset` is off, enforcing the "only
   three valid combinations" rule.
   ------------------------------------------------------------------ */

function SideLayerRules({
  rules,
  availableLayers,
  onChange,
}: {
  rules: LayerRule[];
  availableLayers: string[];
  onChange: (next: LayerRule[]) => void;
}) {
  // Reconcile stored rules against the currently available layers.
  const effective = React.useMemo<LayerRule[]>(() => {
    const byLayer = new Map(rules.map((r) => [r.layer, r]));
    return availableLayers.map(
      (layer) => byLayer.get(layer) ?? { layer, offset: false, skip: false }
    );
  }, [rules, availableLayers]);

  const updateAt = (idx: number, patch: Partial<LayerRule>) => {
    const next = effective.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    // Enforce: skip can only be on when offset is on.
    const clean = next.map((r) => (r.offset ? r : { ...r, skip: false }));
    onChange(clean);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex items-center gap-[var(--space-3)]">
        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Layer Rules
        </span>
        <span className="w-9 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Offset
        </span>
        <span className="w-9 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Skip
        </span>
      </div>
      {effective.length === 0 ? (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-3)] text-center text-xs text-[var(--color-text-muted)]">
          Select a map to populate layers
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--space-1)]">
          {effective.map((rule, i) => (
            <div
              key={rule.layer}
              className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-1)]"
            >
              <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                {rule.layer}
              </span>
              <div className="flex w-9 justify-center">
                <Switch
                  checked={rule.offset}
                  onCheckedChange={(v) => updateAt(i, { offset: v === true })}
                  className="!h-4 !w-7 [&>span]:!h-3 [&>span]:!w-3 [&>span]:data-[state=checked]:!translate-x-3"
                />
              </div>
              <div className="flex w-9 justify-center">
                <Switch
                  checked={rule.skip}
                  disabled={!rule.offset}
                  onCheckedChange={(v) => updateAt(i, { skip: v === true })}
                  className="!h-4 !w-7 [&>span]:!h-3 [&>span]:!w-3 [&>span]:data-[state=checked]:!translate-x-3"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Target Priority (per-param)

   Flat list of entries = {layer rows} interleaved with {separator rows}.
   The backend receives `offset_to` as a list of tuples; walking the list
   and splitting at separators produces that list.

   Drag-and-drop reorders the flat list uniformly — layers and separators
   are both draggable, so the user can move items into a different group
   by dropping across a separator. The hook `reconcile` cleans up leading
   / consecutive separators on every write so the persisted state stays
   well-formed.
   ------------------------------------------------------------------ */

function reconcileTargetEntries(
  entries: TargetEntry[],
  eligibleLayers: string[],
): TargetEntry[] {
  const eligible = new Set(eligibleLayers);
  const seen = new Set<string>();
  const kept: TargetEntry[] = [];
  for (const e of entries) {
    if (e.kind === "sep") {
      kept.push(e);
    } else if (e.layer && eligible.has(e.layer) && !seen.has(e.layer)) {
      kept.push(e);
      seen.add(e.layer);
    }
  }
  // Append any newly-eligible layers at the end (into the last group).
  for (const layer of eligibleLayers) {
    if (!seen.has(layer)) {
      kept.push({ kind: "layer", id: crypto.randomUUID(), layer });
    }
  }
  // Drop leading and consecutive separators.
  const cleaned: TargetEntry[] = [];
  let prevWasSep = true;
  for (const e of kept) {
    if (e.kind === "sep" && prevWasSep) continue;
    cleaned.push(e);
    prevWasSep = e.kind === "sep";
  }
  return cleaned;
}

function TargetPriority({
  entries,
  eligibleLayers,
  onChange,
}: {
  entries: TargetEntry[];
  eligibleLayers: string[];
  onChange: (next: TargetEntry[]) => void;
}) {
  // Always render the reconciled view; writes go through the same
  // reconciliation so persisted state stays well-formed.
  const effective = React.useMemo(
    () => reconcileTargetEntries(entries, eligibleLayers),
    [entries, eligibleLayers],
  );

  const commit = (next: TargetEntry[]) => {
    onChange(reconcileTargetEntries(next, eligibleLayers));
  };

  // ---------- drag state ----------
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [preview, setPreview] = React.useState<TargetEntry[] | null>(null);

  const previewMove = (from: number, to: number): TargetEntry[] => {
    let target = to;
    if (target > from) target--;
    if (target === from) return effective;
    const next = [...effective];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    return next;
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIdx(index);
    setPreview(null);
    e.dataTransfer.effectAllowed = "move";
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
    const mid = rect.top + rect.height / 2;
    const insertAt = e.clientY < mid ? index : index + 1;
    setPreview(previewMove(dragIdx, insertAt));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (preview) commit(preview);
    setDragIdx(null);
    setPreview(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setPreview(null);
  };

  const display = preview ?? effective;
  const draggedId = dragIdx !== null ? effective[dragIdx]?.id : null;

  // ---------- group header counter ----------
  let groupNumber = 1;

  const addSeparator = () => {
    commit([...effective, { kind: "sep", id: crypto.randomUUID() }]);
  };

  const removeSeparator = (id: string) => {
    commit(effective.filter((e) => e.id !== id));
  };

  // When no map or no eligible layers, collapse the section to a hint.
  if (effective.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-3)] text-center text-xs text-[var(--color-text-muted)]">
        No target layers — enable &ldquo;Offset=off + Skip=off&rdquo; for at
        least one layer above.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div
        className="flex flex-col gap-[var(--space-1)]"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* First group's header is implicit; render a static label. */}
        <div className="flex items-center gap-[var(--space-2)] px-[var(--space-1)] pt-[var(--space-1)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Priority {groupNumber}
          </span>
          <div className="h-px flex-1 bg-[var(--color-border-subtle)]" />
        </div>
        {display.map((entry, i) => {
          const realIdx = effective.findIndex((e) => e.id === entry.id);
          const isDragged = entry.id === draggedId;
          if (entry.kind === "sep") {
            groupNumber++;
            // Separators are NOT draggable (the group label's position is
            // fixed by the layers around it), but they still act as a drop
            // target so layers can be dragged across priority boundaries.
            return (
              <div
                key={entry.id}
                onDragOver={(e) => handleDragOver(e, i)}
                className="flex items-center gap-[var(--space-2)] px-[var(--space-1)] py-[var(--space-1)]"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                  Priority {groupNumber}
                </span>
                <div className="h-px flex-1 bg-[var(--color-border-subtle)]" />
                <button
                  type="button"
                  onClick={() => removeSeparator(entry.id)}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                  aria-label="Merge with previous priority group"
                >
                  <X size={10} />
                </button>
              </div>
            );
          }
          return (
            <div
              key={entry.id}
              draggable
              onDragStart={(e) => handleDragStart(e, realIdx)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={cn(
                "flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-1)] transition-all duration-200 ease-out",
                isDragged
                  ? "border-[var(--color-accent)] opacity-40 scale-[0.97]"
                  : "border-[var(--color-border-subtle)] cursor-grab active:cursor-grabbing"
              )}
            >
              <GripVertical size={10} className="shrink-0 text-[var(--color-text-muted)]" />
              <span className="flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                {entry.layer}
              </span>
            </div>
          );
        })}
      </div>
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={addSeparator}
          className="!h-6 !text-[11px]"
        >
          <Plus size={10} className="mr-1" /> New priority
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Point-type panel (one per side: Sources / Receivers)
   ------------------------------------------------------------------ */

function PointTypePanel({
  side,
  config,
  onChange,
  partitioningGroups,
  designOptionData,
  designOptionRows,
  designsByName,
  mapsList,
}: {
  side: Side;
  config: PointTypeConfig;
  onChange: (config: PointTypeConfig) => void;
  partitioningGroups: { name: string; polygons: string[] }[];
  designOptionData: { partitioning: string; regions: string[] } | null;
  designOptionRows: { design: string; region: string }[];
  designsByName: Map<string, { sli: string; rli: string; rpi: string; spi: string }>;
  mapsList: { name: string; layers?: string[] }[];
}) {
  const partitioningNames = partitioningGroups.map((g) => g.name);
  const mapNames = mapsList.map((m) => m.name).filter((n) => n && n.length > 0);

  // Layers of the side's currently selected map — drives the Layer Rules list
  // and, transitively, the target-priority pool.
  const availableLayers = React.useMemo(() => {
    const m = mapsList.find((x) => x.name === config.map);
    return m?.layers ?? [];
  }, [mapsList, config.map]);

  // Region dropdown options: only polygons that the active DesignOption
  // has a row for, so design_idx is always derivable.
  const eligibleRegions = React.useMemo(() => {
    const sidePolygons =
      partitioningGroups.find((g) => g.name === config.partitioning)?.polygons ?? [];
    if (!designOptionData) return [];
    const mapped = new Set(designOptionData.regions);
    return sidePolygons.filter((p) => mapped.has(p));
  }, [designOptionData, partitioningGroups, config.partitioning]);

  // Effective params: exactly one per eligible region, keyed by region name.
  // Existing stored params are matched in; missing regions get a fresh
  // ParamSet; stored params for now-ineligible regions are dropped.
  const effectiveParams = React.useMemo<ParamSet[]>(() => {
    const byRegion = new Map(
      config.params
        .filter((p) => p.region && p.region.length > 0)
        .map((p) => [p.region, p]),
    );
    return eligibleRegions.map(
      (r) => byRegion.get(r) ?? createParamSetForRegion(r),
    );
  }, [config.params, eligibleRegions]);

  // Active tab — falls back to the first eligible region when the stored one
  // is no longer eligible (or was never set).
  const activeRegion =
    eligibleRegions.find((r) => r === config.activeParamRegion) ??
    eligibleRegions[0] ??
    "";
  const param = effectiveParams.find((p) => p.region === activeRegion);

  // Eligible pool for target priority: side-level offset=off + skip=off.
  const eligibleTargetLayers = React.useMemo(
    () =>
      config.layerRules
        .filter((r) => availableLayers.includes(r.layer) && !r.offset && !r.skip)
        .map((r) => r.layer),
    [config.layerRules, availableLayers],
  );

  const setActiveRegion = (region: string) => {
    onChange({ ...config, activeParamRegion: region });
  };

  const setLayerRules = (layerRules: LayerRule[]) => {
    onChange({ ...config, layerRules });
  };

  const updateParam = (patch: Partial<ParamSet>) => {
    if (!param) return;
    const nextParams = effectiveParams.map((p) =>
      p.region === param.region ? { ...p, ...patch } : p,
    );
    onChange({ ...config, params: nextParams, activeParamRegion: param.region });
  };

  const addOffsetRule = () => {
    if (!param) return;
    updateParam({
      offsetRules: [
        ...param.offsetRules,
        { id: crypto.randomUUID(), ruleType: "", value: "" },
      ],
    });
  };

  const removeOffsetRule = (id: string) => {
    if (!param) return;
    updateParam({ offsetRules: param.offsetRules.filter((r) => r.id !== id) });
  };

  const updateOffsetRule = (id: string, patch: Partial<OffsetRule>) => {
    if (!param) return;
    updateParam({
      offsetRules: param.offsetRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  // Inline notice shown below the preset buttons after applying a preset —
  // used for "Standard" validation errors and generator warnings.
  const [presetNotice, setPresetNotice] = React.useState<
    { kind: "error" | "warning"; text: string } | null
  >(null);

  const applyStandardPreset = () => {
    if (!param) return;
    setPresetNotice(null);

    // Resolve the design for this region via the active DesignOption's rows.
    const row = designOptionRows.find((r) => r.region === param.region);
    if (!row || !row.design) {
      setPresetNotice({
        kind: "error",
        text: `The active Grid Option has no row for region "${param.region}".`,
      });
      return;
    }
    const d = designsByName.get(row.design);
    if (!d) {
      setPresetNotice({
        kind: "error",
        text: `Design "${row.design}" is not defined in the Design section.`,
      });
      return;
    }

    const attrs: DesignAttrs = {
      sli: Number(d.sli),
      rli: Number(d.rli),
      rpi: Number(d.rpi),
      spi: Number(d.spi),
    };
    const result = buildStandardPreset(side, attrs);
    if (!result.ok) {
      setPresetNotice({ kind: "error", text: result.errors.join(" ") });
      return;
    }
    updateParam({
      offsetRules: result.rules.map((r) => ({ id: crypto.randomUUID(), ...r })),
    });
    if (result.warnings.length > 0) {
      setPresetNotice({ kind: "warning", text: result.warnings.join(" ") });
    }
  };


  const globalsColumn = (
    <div className="flex flex-col gap-[var(--space-3)]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Globals
      </span>
      <Field label="Map" layout="horizontal" labelWidth="5.5rem">
        <Select
          value={config.map}
          onChange={(e) => onChange({ ...config, map: e.target.value })}
        >
          <option value="">Select…</option>
          {mapNames.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Snapper Max Dist." layout="horizontal" labelWidth="5.5rem">
        <Input
          type="number"
          value={config.snapperMaxDist}
          onChange={(e) => onChange({ ...config, snapperMaxDist: e.target.value })}
        />
      </Field>

      {/* Partitioning is dictated by the active Design Option and shown read-only. */}
      <Field label="Partitions" layout="horizontal" labelWidth="5.5rem">
        <Select value={config.partitioning} disabled onChange={() => undefined}>
          <option value="">—</option>
          {partitioningNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>

      <SideLayerRules
        rules={config.layerRules}
        availableLayers={availableLayers}
        onChange={setLayerRules}
      />
    </div>
  );

  const paramsColumn = (
    <div className="flex flex-col gap-[var(--space-3)]">
      {/* Region tabs — one per eligible region, auto-populated */}
      {eligibleRegions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-[var(--space-1)]">
          {eligibleRegions.map((region) => {
            const isActive = region === activeRegion;
            return (
              <button
                key={region}
                type="button"
                onClick={() => setActiveRegion(region)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                  isActive
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                    : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                )}
                title={`${region} region parameters`}
              >
                {region}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-3)] text-center text-xs text-[var(--color-text-muted)]">
          Pick a Grid Option and Partitioning to configure region parameters.
        </div>
      )}

      {param && (
        <>
          <div className="flex flex-col gap-[var(--space-2)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Offset Rules
            </span>
            {param.offsetRules.length > 0 && (
              <div className="flex flex-col gap-[var(--space-1)]">
                {param.offsetRules.map((rule) => {
                  const isShiftedInline = rule.ruleType === "Shifted inline";
                  return (
                    <div key={rule.id} className="flex items-center gap-[var(--space-1)]">
                      <div className="w-2/5 shrink-0">
                        <Select
                          value={rule.ruleType}
                          onChange={(e) =>
                            updateOffsetRule(rule.id, { ruleType: e.target.value })
                          }
                          className="!h-6 !text-[11px]"
                        >
                          <option value="">Rule…</option>
                          {RULE_TYPE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Input
                          type="number"
                          value={rule.value}
                          onChange={(e) =>
                            updateOffsetRule(rule.id, { value: e.target.value })
                          }
                          className="!h-6 !text-[11px] text-right"
                          placeholder={isShiftedInline ? "Range" : "Val"}
                          title={isShiftedInline ? "Inline range (v)" : undefined}
                        />
                      </div>
                      {isShiftedInline && (
                        <div className="flex-1">
                          <Input
                            type="number"
                            value={rule.valueAt ?? ""}
                            onChange={(e) =>
                              updateOffsetRule(rule.id, { valueAt: e.target.value })
                            }
                            className="!h-6 !text-[11px] text-right"
                            placeholder="Shift"
                            title="Crossline shift (at)"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeOffsetRule(rule.id)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-[var(--space-1)]">
              <Button variant="ghost" size="sm" onClick={addOffsetRule} className="!h-6 !text-[11px]">
                <Plus size={10} className="mr-1" /> Rule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={applyStandardPreset}
                className="!h-6 !text-[11px] !text-[var(--color-accent)]"
                title="Replace rules with values derived from the active Design"
              >
                <Plus size={10} className="mr-1" /> Standard
              </Button>
            </div>
            {presetNotice && (
              <div
                className={cn(
                  "flex items-start gap-[var(--space-2)] rounded-[var(--radius-sm)] border px-[var(--space-2)] py-[var(--space-1)] text-[11px]",
                  presetNotice.kind === "error"
                    ? "border-[var(--color-status-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-status-danger)]"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]",
                )}
              >
                <span className="flex-1">{presetNotice.text}</span>
                <button
                  type="button"
                  onClick={() => setPresetNotice(null)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center text-current opacity-60 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          <TargetPriority
            entries={param.targetPriority}
            eligibleLayers={eligibleTargetLayers}
            onChange={(targetPriority) => updateParam({ targetPriority })}
          />
        </>
      )}
    </div>
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)]">
      <div className="grid grid-cols-1 gap-[var(--space-4)] lg:grid-cols-2">
        {globalsColumn}
        {paramsColumn}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Section data
   ------------------------------------------------------------------ */

interface OffsetsData {
  configs: OffsetConfig[];
  activeId: string;
}
const DEFAULT_OFFSETS: OffsetsData = {
  configs: [createConfig()],
  activeId: "",
};

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function ProjectOffsets() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const [activeSide, setActiveSide] = React.useState<"sources" | "receivers">("sources");

  const { data, update, flush } = useSectionData<OffsetsData>(
    projectId,
    "offsetters",
    DEFAULT_OFFSETS,
  );

  // Normalize on read — handles the older per-param partitioning/layerRules
  // shape without crashing. Memoized so we don't rebuild every render.
  const normalized = React.useMemo<OffsetsData>(() => {
    const rawConfigs = Array.isArray(data.configs) ? (data.configs as unknown as AnyRecord[]) : [];
    const configs =
      rawConfigs.length > 0 ? rawConfigs.map(normalizeConfig) : [createConfig()];
    return { configs, activeId: typeof data.activeId === "string" ? data.activeId : "" };
  }, [data]);

  // -------- design options (for the config-level Design Option dropdown) --------
  const { data: designOptionsSection } = useProjectSection(projectId, "design_options");
  const designOptions = React.useMemo(() => {
    const opts = (designOptionsSection?.data as {
      options?: {
        name: string;
        partitioning?: string;
        rows?: { design?: string; region?: string }[];
      }[];
    } | undefined)?.options;
    return (opts ?? []).filter((o) => o.name && o.name.length > 0);
  }, [designOptionsSection]);
  const designOptionNames = React.useMemo(
    () => designOptions.map((o) => o.name),
    [designOptions],
  );

  // -------- design groups (for the "Standard" preset lookup by design name) --------
  const { data: designSection } = useProjectSection(projectId, "design");
  const designsByName = React.useMemo(() => {
    const groups = (designSection?.data as {
      groups?: { name: string; sli?: string; rli?: string; rpi?: string; spi?: string }[];
    } | undefined)?.groups;
    const m = new Map<string, { sli: string; rli: string; rpi: string; spi: string }>();
    for (const g of groups ?? []) {
      if (!g.name) continue;
      m.set(g.name, {
        sli: g.sli ?? "",
        rli: g.rli ?? "",
        rpi: g.rpi ?? "",
        spi: g.spi ?? "",
      });
    }
    return m;
  }, [designSection]);

  // -------- maps (for the config-level Map dropdown + per-side layer pool) --------
  const { data: mapsSection } = useProjectSection(projectId, "maps");
  const mapsList = React.useMemo(() => {
    const maps = (mapsSection?.data as { maps?: { name: string; layers?: string[] }[] } | undefined)?.maps;
    return maps ?? [];
  }, [mapsSection]);
  // -------- partitioning groups (for the side-level Partitioning dropdown) --------
  const { data: partitioningSection } = useProjectSection(projectId, "partitioning");
  const partitioningGroups = React.useMemo(() => {
    const groups = (partitioningSection?.data as {
      groups?: { name: string; polygons?: string[] }[];
    } | undefined)?.groups;
    return (groups ?? []).map((g) => ({
      name: g.name,
      polygons: g.polygons ?? [],
    }));
  }, [partitioningSection]);

  // -------- active config / selection wiring --------
  const configs = normalized.configs;
  const activeId = normalized.activeId || configs[0]?.id || "";
  const active = configs.find((c) => c.id === activeId) ?? configs[0];

  const updateConfig = React.useCallback(
    (id: string, patch: Partial<OffsetConfig>) => {
      const newConfigs = normalized.configs.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      );
      update({ ...normalized, configs: newConfigs });
    },
    [normalized, update],
  );

  // Active design option's partitioning + region list — drives each side's
  // Region dropdown (unmapped regions are hidden so design_idx stays derivable).
  const designOptionData = React.useMemo(() => {
    const opt = designOptions.find((o) => o.name === active.designOption);
    if (!opt) return null;
    const regions = (opt.rows ?? [])
      .map((r) => r.region ?? "")
      .filter((r) => r.length > 0);
    return { partitioning: opt.partitioning ?? "", regions };
  }, [designOptions, active.designOption]);

  // Full rows (design + region) from the active DesignOption — used by the
  // "Standard" preset to resolve which design a given region maps to.
  const designOptionRows = React.useMemo(() => {
    const opt = designOptions.find((o) => o.name === active.designOption);
    if (!opt) return [];
    return (opt.rows ?? [])
      .map((r) => ({ design: r.design ?? "", region: r.region ?? "" }))
      .filter((r) => r.region.length > 0);
  }, [designOptions, active.designOption]);

  // "Show grid" equivalent — runs the offsets step (+ all dirty upstream).
  const { state: pipelineState, startClosure } = usePipelineReport();
  const offsetsRunning =
    pipelineState.kind === "running" && pipelineState.target === "offsets";
  const handleShowGrid = React.useCallback(async () => {
    if (!projectId || offsetsRunning) return;
    // Autosave is debounced 2 s — flush any pending edit so the pipeline
    // sees the current config rather than stale server state.
    await flush();
    startClosure(projectId, "offsets");
  }, [projectId, offsetsRunning, flush, startClosure]);

  // Offsets step needs: DesignOption picked, Map + Partitioning on both
  // sides, at least one region param per side. Without these the healer
  // drops the side and the step no-ops — surface the reason in the tooltip
  // instead of silently producing an empty artifact.
  const disabledReason: string | null = !projectId
    ? null
    : offsetsRunning
      ? null
      : !active?.designOption
        ? "Pick a Grid Option first"
        : !active.sources.map || !active.receivers.map
          ? "Configure Map on both sides"
          : !active.sources.partitioning || !active.receivers.partitioning
            ? "Set Partitioning on both sides"
            : !active.sources.params.length || !active.receivers.params.length
              ? "Configure at least one region parameter on both sides"
              : null;
  const canShowGrid =
    Boolean(projectId) && !offsetsRunning && disabledReason === null;

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Offsets</h2>
      </div>

      {/* Pipeline trigger — runs the offsets step (+ all dirty upstream) so
          the viewport can show the offset stations for the active config.
          Progress surfaces in the bottom drawer. Mirrors "Show grid" on the
          Design Options page. */}
      <div className="flex items-center justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleShowGrid}
          disabled={!canShowGrid}
          title={disabledReason ?? undefined}
        >
          {offsetsRunning ? (
            <Icon icon={appIcons.loader} size={12} className="mr-[var(--space-1)] animate-spin" />
          ) : (
            <Play size={12} className="mr-[var(--space-1)]" />
          )}
          Show grid
        </Button>
      </div>

      {/* Config selector */}
      <GroupSelector
        items={configs}
        activeId={activeId}
        onSelect={(id) => update({ ...normalized, activeId: id })}
        onAdd={() => {
          const c = createConfig();
          update({ ...normalized, configs: [...normalized.configs, c], activeId: c.id });
        }}
        onRename={(id, name) => updateConfig(id, { name })}
        onDelete={(id) => {
          const n = normalized.configs.filter((c) => c.id !== id);
          const newActiveId =
            activeId === id && n.length > 0 ? n[0].id : normalized.activeId;
          update({ ...normalized, configs: n, activeId: newActiveId });
        }}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Fixed config */}
      <Field label="Grid Option" layout="horizontal">
        <Select
          value={active.designOption}
          onChange={(e) => {
            const nextName = e.target.value;
            const nextOpt = designOptions.find((o) => o.name === nextName);
            const nextPartitioning = nextOpt?.partitioning ?? "";
            // Partitioning is dictated by the Design Option; cascade it to
            // both sides. When the partitioning itself changes, wipe stored
            // params so tabs re-populate from the new eligible regions.
            const syncSide = (s: PointTypeConfig): PointTypeConfig => {
              if (s.partitioning === nextPartitioning) {
                return { ...s, partitioning: nextPartitioning };
              }
              return { ...s, partitioning: nextPartitioning, params: [], activeParamRegion: "" };
            };
            updateConfig(activeId, {
              designOption: nextName,
              sources: syncSide(active.sources),
              receivers: syncSide(active.receivers),
            });
          }}
        >
          <option value="">Select…</option>
          {designOptionNames.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>

      {/* Sources / Receivers tabs */}
      <div className="flex items-center gap-[var(--space-1)] border-b border-[var(--color-border-subtle)]">
        {(["sources", "receivers"] as const).map((side) => {
          const isActive = activeSide === side;
          return (
            <button
              key={side}
              type="button"
              onClick={() => setActiveSide(side)}
              className={cn(
                "-mb-px px-[var(--space-4)] py-[var(--space-2)] text-xs font-semibold uppercase tracking-wide transition-colors",
                isActive
                  ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {side === "sources" ? "Sources" : "Receivers"}
            </button>
          );
        })}
      </div>

      {activeSide === "sources" ? (
        <PointTypePanel
          side="sources"
          config={active.sources}
          onChange={(sources) => updateConfig(activeId, { sources })}
          partitioningGroups={partitioningGroups}
          designOptionData={designOptionData}
          designOptionRows={designOptionRows}
          designsByName={designsByName}
          mapsList={mapsList}
        />
      ) : (
        <PointTypePanel
          side="receivers"
          config={active.receivers}
          onChange={(receivers) => updateConfig(activeId, { receivers })}
          partitioningGroups={partitioningGroups}
          designOptionData={designOptionData}
          designOptionRows={designOptionRows}
          designsByName={designsByName}
          mapsList={mapsList}
        />
      )}
    </div>
  );
}
