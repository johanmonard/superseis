"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";

const { alertTriangle: AlertTriangle, check: Check, pencil: Pencil, play: Play, plus: Plus, trash: Trash2, x: X } = appIcons;
import { CoordinateInput } from "@/components/ui/coordinate-input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { usePipelineReport } from "@/lib/use-pipeline-report";
import { cn } from "@/lib/utils";
import { useProjectSection } from "@/services/query/project-sections";

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

/* ------------------------------------------------------------------
   Resolution candidates
   ------------------------------------------------------------------

   Each design contributes candidates = min(rpi, spi, rli, sli) / (2 + 2·n)
   for n ∈ [0, 6]. The dropdown shows only values common to every design
   selected in the option's rows. Display is rounded to 2 decimals in "m",
   but the payload stores the full 6-decimal string so the pipeline gets
   the unrounded number.
*/

const N_RANGE = [0, 1, 2, 3, 4, 5, 6] as const;
const STORE_DECIMALS = 6;
const DISPLAY_DECIMALS = 2;
const RECOMMENDED_MIN = 2;
const RECOMMENDED_MAX = 5;

type DesignAttrs = {
  rpi: string;
  spi: string;
  rli: string;
  sli: string;
};

function minStep(d: DesignAttrs): number | null {
  const vals = [d.rpi, d.spi, d.rli, d.sli].map((s) => Number(s));
  if (vals.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return Math.min(...vals);
}

type ResolutionCandidate = {
  /** Stored in the payload (6-decimal string). */
  value: string;
  /** Shown in the UI (2-decimal string + unit). */
  display: string;
  recommended: boolean;
};

function computeResolutionOptions(
  designs: DesignAttrs[],
): ResolutionCandidate[] {
  if (designs.length === 0) return [];
  // Build each design's candidate set (bucketed by 6-decimal string key so
  // we can take a strict intersection without float drift).
  const perDesign: Map<string, number>[] = [];
  for (const d of designs) {
    const m = minStep(d);
    if (m == null) return []; // any bad design → no common options
    const map = new Map<string, number>();
    for (const n of N_RANGE) {
      const v = m / (2 + 2 * n);
      map.set(v.toFixed(STORE_DECIMALS), v);
    }
    perDesign.push(map);
  }
  const [first, ...rest] = perDesign;
  const common: ResolutionCandidate[] = [];
  for (const [key, value] of first) {
    if (rest.every((m) => m.has(key))) {
      common.push({
        value: key,
        display: `${value.toFixed(DISPLAY_DECIMALS)} m`,
        recommended:
          value >= RECOMMENDED_MIN && value <= RECOMMENDED_MAX,
      });
    }
  }
  common.sort((a, b) => Number(a.value) - Number(b.value));
  return common;
}

interface DesignOption {
  id: string;
  name: string;
  partitioning: string;
  rows: OptionRow[];
  resolution: string;
  gridOriginX: string;
  gridOriginY: string;
}

function createRow(region = ""): OptionRow {
  return {
    id: crypto.randomUUID(),
    design: "",
    region,
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
    resolution: "",
    gridOriginX: "0",
    gridOriginY: "0",
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
   Component
   ------------------------------------------------------------------ */

export function ProjectDesignOptions() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  // Read design groups for the Design dropdown
  const { data: designSection } = useProjectSection(projectId, "design");
  const designGroups = React.useMemo(() => {
    const groups = (designSection?.data as {
      groups?: {
        name: string;
        rlAzimuth?: string;
        rpi?: string;
        spi?: string;
        rli?: string;
        sli?: string;
      }[];
    } | undefined)?.groups;
    return groups ?? [];
  }, [designSection]);
  const designNames = React.useMemo(
    () => designGroups.map((g) => g.name),
    [designGroups],
  );
  const designAzimuths = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of designGroups) {
      map[g.name] = g.rlAzimuth ?? "0";
    }
    return map;
  }, [designGroups]);

  // Read partitioning groups for the Partitioning dropdown and region (polygon) lists
  const { data: partitioningSection } = useProjectSection(projectId, "partitioning");
  const partitioningGroups: { name: string; polygons: string[] }[] = React.useMemo(() => {
    const groups = (partitioningSection?.data as { groups?: { name: string; polygons: string[] }[] } | undefined)?.groups;
    return groups ?? [];
  }, [partitioningSection]);

  const partitioningNames = React.useMemo(
    () => partitioningGroups.map((g) => g.name),
    [partitioningGroups],
  );
  const partitioningRegions = React.useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of partitioningGroups) {
      map[g.name] = g.polygons ?? [];
    }
    return map;
  }, [partitioningGroups]);

  const { data, update, flush } = useSectionData<DesignOptionsData>(projectId, "design_options", DEFAULT_DESIGN_OPTIONS);
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
    ? partitioningRegions[activeOption.partitioning] ?? []
    : [];

  // Distinct designs referenced by this option's rows, with their numeric
  // attrs attached so the Resolution dropdown can compute common candidates.
  const selectedDesignsForOption = React.useMemo<DesignAttrs[]>(() => {
    const names = new Set<string>();
    for (const row of activeOption.rows) {
      if (row.design) names.add(row.design);
    }
    const byName = new Map(designGroups.map((g) => [g.name, g]));
    const result: DesignAttrs[] = [];
    for (const name of names) {
      const g = byName.get(name);
      if (!g) continue;
      result.push({
        rpi: g.rpi ?? "",
        spi: g.spi ?? "",
        rli: g.rli ?? "",
        sli: g.sli ?? "",
      });
    }
    return result;
  }, [activeOption.rows, designGroups]);

  const mismatchedAzimuths = React.useMemo(() => {
    const unique = new Set<string>();
    for (const row of activeOption.rows) {
      if (!row.design) continue;
      const az = designAzimuths[row.design];
      if (az !== undefined) unique.add(Number(az).toString());
    }
    return unique.size > 1 ? Array.from(unique) : null;
  }, [activeOption.rows, designAzimuths]);

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

  const { state: pipelineState, startClosure } = usePipelineReport();
  const gridRunning =
    pipelineState.kind === "running" && pipelineState.target === "grid";

  const handleShowGrid = React.useCallback(async () => {
    if (!projectId || gridRunning) return;
    // Autosave is debounced 2 s — if the user edits the option and clicks
    // Show grid within that window, the closure would fire against stale
    // server state and produce a grid for the previous selection. Flush
    // the pending write before kicking off the pipeline.
    await flush();
    startClosure(projectId, "grid");
  }, [projectId, gridRunning, flush, startClosure]);

  // Auto-re-run the grid when the user picks a different option — the
  // parquets on disk belong to whichever option was previously active, so
  // leaving them stale would mislead the viewport. Skip the very first
  // render (initial activeId load) to avoid running on page mount.
  const lastRunOptionRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!projectId) return;
    if (!activeId) return;
    if (lastRunOptionRef.current === null) {
      // First observed activeId; seed the ref and skip auto-run so we
      // only trigger on subsequent user-driven switches.
      lastRunOptionRef.current = activeId;
      return;
    }
    if (lastRunOptionRef.current === activeId) return;
    lastRunOptionRef.current = activeId;
    if (gridRunning) return;
    void handleShowGrid();
  }, [projectId, activeId, gridRunning, handleShowGrid]);

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Grid trigger — runs the grid step (+ all dirty upstream) so the
          viewport can show the theoretical stations produced by the active
          option. Progress surfaces in the bottom drawer. */}
      <div className="flex items-center justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleShowGrid}
          disabled={!projectId || gridRunning}
        >
          {gridRunning ? (
            <Icon icon={appIcons.loader} size={12} className="mr-[var(--space-1)] animate-spin" />
          ) : (
            <Play size={12} className="mr-[var(--space-1)]" />
          )}
          Show grid
        </Button>
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
          onChange={(e) => {
            const name = e.target.value;
            const polygons = partitioningRegions[name] ?? [];
            // Auto-create one row per region polygon
            const rows = polygons.length > 0
              ? polygons.map((p) => createRow(p))
              : [createRow()];
            updateOption(activeId, { partitioning: name, rows });
          }}
        >
          <option value="">Select…</option>
          {partitioningNames.map((p) => (
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
              Region
            </span>
            <span className="w-[110px] shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Design
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
                  value={row.region}
                  onChange={(e) => updateRow(row.id, { region: e.target.value })}
                >
                  <option value="">—</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
              <div className="w-[110px] shrink-0">
                <Select
                  value={row.design}
                  onChange={(e) => updateRow(row.id, { design: e.target.value })}
                >
                  <option value="">—</option>
                  {designNames.map((d) => (
                    <option key={d} value={d}>{d}</option>
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

      <div className="h-px bg-[var(--color-border-subtle)]" />

      <Field label="Resolution" htmlFor="opt-resolution" layout="horizontal">
        <ResolutionSelect
          value={activeOption.resolution}
          designs={selectedDesignsForOption}
          onChange={(v) => updateOption(activeId, { resolution: v })}
        />
      </Field>

      <Field label="Grid Origin" layout="horizontal">
        <CoordinateInput
          x={activeOption.gridOriginX}
          y={activeOption.gridOriginY}
          onXChange={(v) => updateOption(activeId, { gridOriginX: v })}
          onYChange={(v) => updateOption(activeId, { gridOriginY: v })}
          align="left"
        />
      </Field>

      {mismatchedAzimuths && (
        <div
          role="alert"
          className="flex items-start gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-status-warning-text)]"
        >
          <AlertTriangle size={14} className="mt-[1px] shrink-0" />
          <span>
            Selected designs have different RL Azimuths (
            {mismatchedAzimuths.map((a) => `${a}°`).join(", ")}). Consider aligning
            them before computing the grid.
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Resolution dropdown
   ------------------------------------------------------------------

   Native <Select> whose option list is computed lazily on first open —
   it stays empty until the user clicks / focuses the control, then
   ``computeResolutionOptions`` runs against the designs bound to the
   option's rows. Recommended values (2 – 5 m) land in the first
   optgroup; the rest follow. The payload keeps the 6-decimal string so
   the pipeline sees the unrounded number.
*/

function ResolutionSelect({
  value,
  designs,
  onChange,
}: {
  value: string;
  designs: DesignAttrs[];
  onChange: (v: string) => void;
}) {
  const [populated, setPopulated] = React.useState(false);
  const options = React.useMemo(
    () => (populated ? computeResolutionOptions(designs) : []),
    [populated, designs],
  );

  // Current value might not be in the computed list (e.g. designs changed
  // since it was picked). Surface it so the select still shows it.
  const hasCurrent =
    !!value && options.some((o) => o.value === value);

  const placeholder = !populated
    ? "Select…"
    : designs.length === 0
      ? "No designs in this option"
      : options.length === 0
        ? "No common resolution"
        : "Select…";

  return (
    <Select
      id="opt-resolution"
      value={value}
      onMouseDown={() => {
        if (!populated) setPopulated(true);
      }}
      onFocus={() => {
        if (!populated) setPopulated(true);
      }}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {value && !hasCurrent && (
        <option value={value}>{formatCurrentResolution(value)}</option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.recommended ? `★ ${o.display}` : o.display}
        </option>
      ))}
    </Select>
  );
}

function formatCurrentResolution(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(DISPLAY_DECIMALS)} m` : value;
}
