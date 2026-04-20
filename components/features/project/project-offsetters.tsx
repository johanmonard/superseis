"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { useProjectSection } from "@/services/query/project-sections";

const { check: Check, chevronLeft: ChevronLeft, chevronRight: ChevronRight, gripVertical: GripVertical, minus: Minus, pencil: Pencil, plus: Plus, trash: Trash2, x: X } = appIcons;

/* ------------------------------------------------------------------
   Types
   ------------------------------------------------------------------ */

interface OffsetRule {
  id: string;
  ruleType: string;
  value: string;
}

interface LayerRule {
  layer: string;
  offset: boolean;
  skip: boolean;
}

interface ParamSet {
  id: string;
  partitioning: string;
  region: string;
  layerRules: LayerRule[];
  offsetRules: OffsetRule[];
}

interface PointTypeConfig {
  params: ParamSet[];
  activeParamIdx: number;
}

interface OffsetterConfig {
  id: string;
  name: string;
  designOption: string;
  map: string;
  snapperMaxDist: string;
  sources: PointTypeConfig;
  receivers: PointTypeConfig;
}

/* ------------------------------------------------------------------
   Dummy data
   ------------------------------------------------------------------ */

const RULE_TYPE_OPTIONS = ["Max crossline", "Shifted inline", "Max radius"];
const OFFSET_TEMPLATES: Record<string, OffsetRule[]> = {
  "Template 1": [
    { id: "", ruleType: "Max crossline", value: "500" },
    { id: "", ruleType: "Max radius", value: "1000" },
  ],
  "Template 2": [
    { id: "", ruleType: "Shifted inline", value: "200" },
    { id: "", ruleType: "Max crossline", value: "800" },
    { id: "", ruleType: "Max radius", value: "1500" },
  ],
  "Template 3": [
    { id: "", ruleType: "Max crossline", value: "300" },
    { id: "", ruleType: "Shifted inline", value: "150" },
  ],
};

function createParamSet(): ParamSet {
  return {
    id: crypto.randomUUID(),
    partitioning: "",
    region: "",
    layerRules: [],
    offsetRules: [],
  };
}

function createPointTypeConfig(): PointTypeConfig {
  return { params: [createParamSet()], activeParamIdx: 0 };
}

let configCounter = 0;

function createConfig(): OffsetterConfig {
  configCounter++;
  return {
    id: crypto.randomUUID(),
    name: `Option ${configCounter}`,
    designOption: "",
    map: "",
    snapperMaxDist: "10",
    sources: createPointTypeConfig(),
    receivers: createPointTypeConfig(),
  };
}

/* ------------------------------------------------------------------
   Group selector
   ------------------------------------------------------------------ */

function GroupSelector({
  items, activeId, onSelect, onAdd, onRename, onDelete,
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
  React.useEffect(() => { if (editingId) setTimeout(() => inputRef.current?.focus(), 0); }, [editingId]);
  const commitEdit = () => { if (editingId && editValue.trim()) onRename(editingId, editValue.trim()); setEditingId(null); };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {items.map((g) => {
          if (g.id === editingId) {
            return (
              <div key={g.id} className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]">
                <input ref={inputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                  className="h-6 w-24 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none" />
                <button type="button" onClick={commitEdit} className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]"><Check size={10} /></button>
                <button type="button" onClick={() => setEditingId(null)} className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"><X size={10} /></button>
              </div>
            );
          }
          return (
            <button key={g.id} type="button" onClick={() => onSelect(g.id)}
              className={cn("rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                g.id === activeId ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]" : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]")}>
              {g.name}
            </button>
          );
        })}
        <button type="button" onClick={onAdd} className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]" aria-label="Add"><Plus size={12} /></button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button type="button" onClick={() => { const a = items.find((i) => i.id === activeId); if (a) { setEditingId(a.id); setEditValue(a.name); } }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]">
          <Pencil size={10} /> Rename
        </button>
        {items.length > 1 && (
          <button type="button" onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]">
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Preset button (dropdown styled as ghost button)
   ------------------------------------------------------------------ */

function PresetButton({ onSelect }: { onSelect: (name: string) => void }) {
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
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} className="!h-6 !text-[11px]">
        <Plus size={10} className="mr-1" /> Preset
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[8rem] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-1)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          {Object.keys(OFFSET_TEMPLATES).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onSelect(t); setOpen(false); }}
              className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Sortable layer rules
   ------------------------------------------------------------------ */

function SortableLayerRules({
  rules,
  onUpdate,
  onReorder,
}: {
  rules: LayerRule[];
  onUpdate: (index: number, patch: Partial<LayerRule>) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [previewRules, setPreviewRules] = React.useState<LayerRule[] | null>(null);

  const getPreview = React.useCallback(
    (from: number, to: number): LayerRule[] => {
      let target = to;
      if (target > from) target--;
      if (target === from) return rules;
      const next = [...rules];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    },
    [rules]
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIdx(index);
    setPreviewRules(null);
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
    const midY = rect.top + rect.height / 2;
    const insertAt = e.clientY < midY ? index : index + 1;
    setPreviewRules(getPreview(dragIdx, insertAt));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && previewRules) {
      // Find where the dragged item ended up
      const draggedLayer = rules[dragIdx].layer;
      const newIdx = previewRules.findIndex((r) => r.layer === draggedLayer);
      if (newIdx !== -1 && newIdx !== dragIdx) {
        onReorder(dragIdx, newIdx > dragIdx ? newIdx + 1 : newIdx);
      }
    }
    setDragIdx(null);
    setPreviewRules(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setPreviewRules(null);
  };

  const display = previewRules ?? rules;
  const draggedLayer = dragIdx !== null ? rules[dragIdx].layer : null;

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
      <div
        className="flex flex-col gap-[var(--space-1)]"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {display.map((rule, i) => {
          const isDragged = rule.layer === draggedLayer;
          const realIdx = rules.findIndex((r) => r.layer === rule.layer);
          return (
            <div
              key={rule.layer}
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
                {rule.layer}
              </span>
              <div className="flex w-9 justify-center">
                <Switch
                  checked={rule.offset}
                  onCheckedChange={(v) => onUpdate(realIdx, { offset: v === true })}
                  className="!h-4 !w-7 [&>span]:!h-3 [&>span]:!w-3 [&>span]:data-[state=checked]:!translate-x-3"
                />
              </div>
              <div className="flex w-9 justify-center">
                <Switch
                  checked={rule.skip}
                  onCheckedChange={(v) => onUpdate(realIdx, { skip: v === true })}
                  className="!h-4 !w-7 [&>span]:!h-3 [&>span]:!w-3 [&>span]:data-[state=checked]:!translate-x-3"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Point-type parameter panel
   ------------------------------------------------------------------ */

function PointTypePanel({
  label,
  config,
  onChange,
  partitioningNames,
  regionsByPartitioning,
  availableLayers,
}: {
  label: string;
  config: PointTypeConfig;
  onChange: (config: PointTypeConfig) => void;
  partitioningNames: string[];
  regionsByPartitioning: Record<string, string[]>;
  availableLayers: string[];
}) {
  const param = config.params[config.activeParamIdx] ?? config.params[0];
  const regions = regionsByPartitioning[param.partitioning] ?? [];

  // Reconcile the stored layer rules against the currently available layers
  // (from the selected map): preserve the user's order and toggles for layers
  // still in the map, append any newly available layers, and drop rules whose
  // layer no longer exists.
  const effectiveLayerRules = React.useMemo(() => {
    const inMap = new Set(availableLayers);
    const seen = new Set<string>();
    const kept: LayerRule[] = [];
    for (const r of param.layerRules) {
      if (inMap.has(r.layer) && !seen.has(r.layer)) {
        kept.push(r);
        seen.add(r.layer);
      }
    }
    for (const layer of availableLayers) {
      if (!seen.has(layer)) kept.push({ layer, offset: true, skip: false });
    }
    return kept;
  }, [param.layerRules, availableLayers]);

  const setIdx = (idx: number) => onChange({ ...config, activeParamIdx: idx });

  const addParam = () => {
    onChange({
      params: [...config.params, createParamSet()],
      activeParamIdx: config.params.length,
    });
  };

  const removeParam = () => {
    if (config.params.length <= 1) return;
    const next = config.params.filter((_, i) => i !== config.activeParamIdx);
    onChange({ params: next, activeParamIdx: Math.min(config.activeParamIdx, next.length - 1) });
  };

  const updateParam = (patch: Partial<ParamSet>) => {
    onChange({
      ...config,
      params: config.params.map((p, i) => i === config.activeParamIdx ? { ...p, ...patch } : p),
    });
  };

  const updateLayerRule = (layerIdx: number, patch: Partial<LayerRule>) => {
    updateParam({
      layerRules: effectiveLayerRules.map((r, i) => (i === layerIdx ? { ...r, ...patch } : r)),
    });
  };

  const reorderLayerRules = (from: number, to: number) => {
    const next = [...effectiveLayerRules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateParam({ layerRules: next });
  };

  const addOffsetRule = () => {
    updateParam({ offsetRules: [...param.offsetRules, { id: crypto.randomUUID(), ruleType: "", value: "" }] });
  };

  const removeOffsetRule = (id: string) => {
    updateParam({ offsetRules: param.offsetRules.filter((r) => r.id !== id) });
  };

  const updateOffsetRule = (id: string, patch: Partial<OffsetRule>) => {
    updateParam({ offsetRules: param.offsetRules.map((r) => r.id === id ? { ...r, ...patch } : r) });
  };

  const applyTemplate = (name: string) => {
    const tpl = OFFSET_TEMPLATES[name];
    if (!tpl) return;
    updateParam({ offsetRules: [...param.offsetRules, ...tpl.map((r) => ({ ...r, id: crypto.randomUUID() }))] });
  };

  return (
    <div className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)]">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          {label}
        </span>
      </div>

      {/* Param stepper */}
      <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          Parameter set
        </span>
        <div className="flex items-center gap-[var(--space-1)]">
          <button type="button" onClick={() => setIdx(Math.max(0, config.activeParamIdx - 1))} disabled={config.activeParamIdx <= 0}
            className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] disabled:opacity-30">
            <ChevronLeft size={12} />
          </button>
          <span className="min-w-[2.5rem] text-center text-xs tabular-nums font-medium text-[var(--color-text-primary)]">
            {config.activeParamIdx + 1} / {config.params.length}
          </span>
          <button type="button" onClick={() => setIdx(Math.min(config.params.length - 1, config.activeParamIdx + 1))} disabled={config.activeParamIdx >= config.params.length - 1}
            className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] disabled:opacity-30">
            <ChevronRight size={12} />
          </button>
          <div className="ml-1 h-3 w-px bg-[var(--color-border-subtle)]" />
          <button type="button" onClick={addParam}
            className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]">
            <Plus size={10} />
          </button>
          {config.params.length > 1 && (
            <button type="button" onClick={removeParam}
              className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-status-danger)]">
              <Minus size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Partitioning + Region */}
      <div className="flex flex-col gap-[var(--space-3)]">
        <Field label="Partitioning" layout="horizontal" labelWidth="5.5rem">
          <Select value={param.partitioning} onChange={(e) => updateParam({ partitioning: e.target.value, region: "" })}>
            <option value="">Select…</option>
            {partitioningNames.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Region" layout="horizontal" labelWidth="5.5rem">
          <Select value={param.region} onChange={(e) => updateParam({ region: e.target.value })}>
            <option value="">Select…</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>

      {/* Layer Rules */}
      <div className="mt-[var(--space-3)]" />
      <SortableLayerRules
        rules={effectiveLayerRules}
        onUpdate={updateLayerRule}
        onReorder={reorderLayerRules}
      />

      {/* Offset Rules */}
      <div className="mt-[var(--space-3)]" />
      <div className="flex flex-col gap-[var(--space-2)]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Offset Rules
        </span>
        {param.offsetRules.length > 0 && (
          <div className="flex flex-col gap-[var(--space-1)]">
            {param.offsetRules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-[var(--space-1)]">
                <div className="w-2/3 shrink-0">
                  <Select value={rule.ruleType} onChange={(e) => updateOffsetRule(rule.id, { ruleType: e.target.value })} className="!h-6 !text-[11px]">
                    <option value="">Rule…</option>
                    {RULE_TYPE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="flex-1">
                  <Input type="number" value={rule.value} onChange={(e) => updateOffsetRule(rule.id, { value: e.target.value })} className="!h-6 !text-[11px] text-right" placeholder="Val" />
                </div>
                <button type="button" onClick={() => removeOffsetRule(rule.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-[var(--space-1)]">
          <Button variant="ghost" size="sm" onClick={addOffsetRule} className="!h-6 !text-[11px]">
            <Plus size={10} className="mr-1" /> Rule
          </Button>
          <PresetButton onSelect={applyTemplate} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Section data
   ------------------------------------------------------------------ */

interface OffsettersData {
  configs: OffsetterConfig[];
  activeId: string;
}
const DEFAULT_OFFSETTERS: OffsettersData = {
  configs: [createConfig()],
  activeId: "",
};

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function ProjectOffsetters() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update } = useSectionData<OffsettersData>(projectId, "offsetters", DEFAULT_OFFSETTERS);

  // Design option names come from the design_options section
  const { data: designOptionsSection } = useProjectSection(projectId, "design_options");
  const designOptionNames = React.useMemo(() => {
    const opts = (designOptionsSection?.data as { options?: { name: string }[] } | undefined)?.options;
    return (opts ?? []).map((o) => o.name).filter((n) => n && n.length > 0);
  }, [designOptionsSection]);

  // Maps: both the names (for the Map dropdown) and each map's ordered layer list
  const { data: mapsSection } = useProjectSection(projectId, "maps");
  const mapsList = React.useMemo(() => {
    const maps = (mapsSection?.data as { maps?: { name: string; layers?: string[] }[] } | undefined)?.maps;
    return maps ?? [];
  }, [mapsSection]);
  const mapNames = React.useMemo(
    () => mapsList.map((m) => m.name).filter((n) => n && n.length > 0),
    [mapsList],
  );

  // Partitioning: names for the dropdown, polygons as the region list per partitioning
  const { data: partitioningSection } = useProjectSection(projectId, "partitioning");
  const partitioningGroups = React.useMemo(() => {
    const groups = (partitioningSection?.data as { groups?: { name: string; polygons?: string[] }[] } | undefined)?.groups;
    return groups ?? [];
  }, [partitioningSection]);
  const partitioningNames = React.useMemo(
    () => partitioningGroups.map((g) => g.name).filter((n) => n && n.length > 0),
    [partitioningGroups],
  );
  const regionsByPartitioning = React.useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const g of partitioningGroups) m[g.name] = g.polygons ?? [];
    return m;
  }, [partitioningGroups]);

  const configs = data.configs;
  const activeId = data.activeId || configs[0]?.id || "";
  const active = configs.find((c) => c.id === activeId) ?? configs[0];

  const updateConfig = React.useCallback(
    (id: string, patch: Partial<OffsetterConfig>) => {
      const newConfigs = data.configs.map((c) => (c.id === id ? { ...c, ...patch } : c));
      update({ ...data, configs: newConfigs });
    }, [data, update]
  );

  // Layers available for the currently selected map — drives Layer Rules lists
  const availableLayers = React.useMemo(() => {
    const m = mapsList.find((x) => x.name === active.map);
    return m?.layers ?? [];
  }, [mapsList, active.map]);

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Offsetters</h2>
      </div>

      {/* Config selector */}
      <GroupSelector
        items={configs}
        activeId={activeId}
        onSelect={(id) => update({ ...data, activeId: id })}
        onAdd={() => { const c = createConfig(); update({ ...data, configs: [...data.configs, c], activeId: c.id }); }}
        onRename={(id, name) => updateConfig(id, { name })}
        onDelete={(id) => { const n = data.configs.filter((c) => c.id !== id); const newActiveId = activeId === id && n.length > 0 ? n[0].id : data.activeId; update({ ...data, configs: n, activeId: newActiveId }); }}
      />

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Fixed config */}
      <Field label="Design Option" layout="horizontal">
        <Select value={active.designOption} onChange={(e) => updateConfig(activeId, { designOption: e.target.value })}>
          <option value="">Select…</option>
          {designOptionNames.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      </Field>

      <Field label="Map" layout="horizontal">
        <Select value={active.map} onChange={(e) => updateConfig(activeId, { map: e.target.value })}>
          <option value="">Select…</option>
          {mapNames.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </Field>

      <Field label="Snapper Max Dist." layout="horizontal">
        <Input type="number" value={active.snapperMaxDist} onChange={(e) => updateConfig(activeId, { snapperMaxDist: e.target.value })} />
      </Field>

      {/* SP and RP panels side by side */}
      <div className="grid grid-cols-1 gap-[var(--space-3)] xl:grid-cols-2">
        <PointTypePanel
          label="Sources"
          config={active.sources}
          onChange={(sources) => updateConfig(activeId, { sources })}
          partitioningNames={partitioningNames}
          regionsByPartitioning={regionsByPartitioning}
          availableLayers={availableLayers}
        />
        <PointTypePanel
          label="Receivers"
          config={active.receivers}
          onChange={(receivers) => updateConfig(activeId, { receivers })}
          partitioningNames={partitioningNames}
          regionsByPartitioning={regionsByPartitioning}
          availableLayers={availableLayers}
        />
      </div>
    </div>
  );
}
