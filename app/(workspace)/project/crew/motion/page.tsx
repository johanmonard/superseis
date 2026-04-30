"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import type {
  GisLayerStyle,
  VisibleFile,
} from "@/components/features/project/project-gis-viewer";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  SPEED_UNITS,
  UnitValueControl,
  WORK_TIME_UNITS,
} from "@/components/features/resources/resource-parameters";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import type { FileCategory } from "@/services/api/project-files";

// Heavy maplibre + deck.gl bundle — keep it client-only and lazy-loaded.
const GisViewerViewport = dynamic(
  () =>
    import("@/components/features/project/gis-viewer-viewport").then(
      (m) => m.GisViewerViewport,
    ),
  { ssr: false },
);

/* -------------------------------------------------------------------------- */
/*  Section shapes — minimal subset of what we read                           */
/* -------------------------------------------------------------------------- */

interface OffsetterLayerRule {
  layer: string;
  offset: boolean;
  skip: boolean;
}
interface OffsetterSide {
  map?: string;
  layerRules?: OffsetterLayerRule[];
}
interface OffsettersSectionData {
  configs?: Array<{
    id: string;
    name: string;
    sources?: OffsetterSide;
    receivers?: OffsetterSide;
  }>;
}
const DEFAULT_OFFSETTERS_SECTION: OffsettersSectionData = { configs: [] };

interface SpeedSectionData {
  /** Cell key `${layer}|${activityId}|${resourceId}` → speed value, e.g. "5 kmph". */
  cells: Record<string, string>;
  /** Per-activity map selection: activityId → mapId from the Maps page. */
  maps: Record<string, string>;
}

interface CrewMotionSectionData {
  /** Per-cell work time, e.g. "5 mn". Empty / missing means unallocated. */
  cells: Record<string, string>;
  /** Move-speed values — sibling to `cells` (work time). */
  moveSpeed?: SpeedSectionData;
}
const DEFAULT_CREW_MOTION_SECTION: CrewMotionSectionData = { cells: {} };

/** Mirror of Project → Maps, read here to drive the per-activity map
 *  selectors in the Move/Travel speed tables. */
interface MapsSectionData {
  maps: Array<{ id: string; name: string; layers: string[] }>;
  activeId: string;
}
const DEFAULT_MAPS_SECTION: MapsSectionData = { maps: [], activeId: "" };

interface LayerDefinition {
  id: string;
  name: string;
  code?: number;
  color?: string;
  from?: string;
  sourceFiles?: string[];
  sourceField?: string;
  sourceValues?: string[];
}
interface LayersSectionData {
  layers: LayerDefinition[];
}
const DEFAULT_LAYERS_SECTION: LayersSectionData = { layers: [] };

interface CrewSectionData {
  options: Array<{
    id: string;
    name: string;
    activities: Array<{
      id: string;
      name: string;
      pointType: "SP" | "RP";
      resources: Array<{ id: string; name: string; max: number }>;
    }>;
  }>;
  activeId: string;
}
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

/* -------------------------------------------------------------------------- */
/*  Right-panel table: layers (rows) × resources grouped by activity (cols)   */
/* -------------------------------------------------------------------------- */

interface MotionActivity {
  id: string;
  name: string;
  resources: Array<{ id: string; name: string }>;
}

/** Cell key — IDs are stable across activity / resource renames so renaming
 *  in the crew page no longer desyncs the motion table. */
const cellKey = (layer: string, activityId: string, resourceId: string) =>
  `${layer}|${activityId}|${resourceId}`;

function WorkTimeMotionTable({
  layers,
  /** Index in `layers` where the `offset === true` group starts. -1 means
   *  no boundary (everything in one group, or no layers at all). */
  offsetGroupStart,
  activities,
  cells,
  onChange,
  emptyMessage,
}: {
  layers: string[];
  offsetGroupStart: number;
  activities: MotionActivity[];
  cells: Record<string, string>;
  onChange: (key: string, value: string) => void;
  emptyMessage?: string;
}) {
  const setCell = onChange;

  if (layers.length === 0 || activities.every((a) => a.resources.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-[var(--space-4)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          {emptyMessage ??
            (layers.length === 0
              ? "No layers to show for the selected Offsets option."
              : "No resources mapped to any activity in the active crew option.")}
        </p>
      </div>
    );
  }

  // Flatten resources for the second header row, tagging each with its
  // activity index and whether it's the last column in its activity group.
  // The group flag drives a subtle right divider — much lighter than the
  // previous heavy 2 px border.
  const flatResources: Array<{
    activityId: string;
    activityName: string;
    resourceId: string;
    resourceName: string;
    activityIdx: number;
    isLastInGroup: boolean;
  }> = [];
  activities.forEach((act, activityIdx) => {
    act.resources.forEach((res, resIdx) => {
      flatResources.push({
        activityId: act.id,
        activityName: act.name,
        resourceId: res.id,
        resourceName: res.name,
        activityIdx,
        isLastInGroup: resIdx === act.resources.length - 1,
      });
    });
  });

  const visibleActivityCount = activities.filter(
    (a) => a.resources.length > 0,
  ).length;

  // Width the layer column to fit the longest layer name. `ch` is the width
  // of the "0" glyph at the current font; we add a small slack for cell
  // padding and the fact that capital letters are wider than the reference.
  const layerColMaxLen = layers.reduce(
    (m, l) => Math.max(m, l.length),
    "Layer".length,
  );
  const layerColStyle = { width: `${layerColMaxLen}ch` } as const;

  // 1 px column divider after the last cell in each activity group
  // (`--color-border-table` matches the row separators below).
  const groupDivider = (idx: number, isLastInGroup: boolean) =>
    isLastInGroup && idx !== flatResources.length - 1
      ? "border-r border-r-[var(--color-border-table)]"
      : "";

  // The table sits inside the left settings panel — let every cell inherit
  // that bg so headers, zebra rows and hover all blend into the panel.
  const PANEL_BG =
    "bg-[color-mix(in_srgb,var(--color-bg-canvas)_50%,var(--color-bg-surface))]";

  return (
    <div className="app-scrollbar overflow-x-auto">
      <table
        className={cn(
          "app-table",
          // Fixed layout so resource columns can shrink past their header
          // text — without it the table forces enough width to print every
          // header in full. The `!` prefix is required: `app-table` is
          // declared outside any @layer in globals.css and would otherwise
          // override Tailwind's layered `.table-fixed` rule.
          "!table-fixed w-full",
          // Strip the default app-table background highlights so the table
          // reads as transparent over the panel surface.
          "[&_thead_th]:!bg-transparent",
          "[&_tbody_tr]:!bg-transparent",
          "[&_tbody_tr:hover]:!bg-transparent",
          // Headers and cells need to allow content overflow to be clipped
          // by their (fixed) column width, otherwise the browser keeps the
          // text whole and pushes the column wider.
          "[&_thead_th]:overflow-hidden",
          "[&_tbody_td]:overflow-hidden",
          // `app-table` strips the bottom border on the last row's cells.
          // Re-enable it here so the table's bottom edge runs the full
          // width across every column.
          "[&_tbody_tr:last-child_td]:!border-b",
          "[&_tbody_tr:last-child_td]:!border-b-[var(--color-border-table)]",
          "[&_tbody_tr:last-child_th]:!border-b",
          "[&_tbody_tr:last-child_th]:!border-b-[var(--color-border-table)]",
        )}
      >
        {/* Layer column gets a fixed width; every resource column shares
            the remainder equally (the empty <col>s default to auto under
            `table-fixed`, which means equal-share-of-remaining). */}
        <colgroup>
          {/* eslint-disable-next-line template/no-jsx-style-prop -- width derives from longest layer name */}
          <col style={layerColStyle} />
          {flatResources.map((c) => (
            <col key={`${c.activityId}|${c.resourceId}`} />
          ))}
        </colgroup>
        <thead>
          {/* Activity row — small-caps headers, subtle right divider after
              each group. Corner cell stays empty (no top/left edge). */}
          <tr>
            <th className={cn("sticky left-0 z-10 !border-b-0", PANEL_BG)} />
            {activities.map((act, idx) =>
              act.resources.length === 0 ? null : (
                <th
                  key={act.id}
                  colSpan={act.resources.length}
                  className={cn(
                    "truncate text-center",
                    idx !== visibleActivityCount - 1 &&
                      "border-r border-r-[var(--color-border-table)]",
                  )}
                  title={act.name}
                >
                  {act.name}
                </th>
              ),
            )}
          </tr>
          {/* Resource sub-headers — same small-caps treatment. */}
          <tr>
            <th className={cn("sticky left-0 z-10", PANEL_BG)}>Layer</th>
            {flatResources.map((c, i) => (
              <th
                key={`${c.activityId}|${c.resourceId}`}
                className={cn(
                  "truncate text-center",
                  groupDivider(i, c.isLastInGroup),
                )}
                title={c.resourceName}
              >
                {c.resourceName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Subtle "Offset OFF" section label — only shown when both groups
              have rows, otherwise it's noise. */}
          {offsetGroupStart > 0 && offsetGroupStart < layers.length ? (
            <tr>
              <td
                colSpan={1 + flatResources.length}
                className="!pt-[var(--space-5)] !pb-[2px] text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                No offsets
              </td>
            </tr>
          ) : null}
          {layers.map((layer, rowIdx) => {
            const isFirstOnRow =
              offsetGroupStart > 0 &&
              offsetGroupStart < layers.length &&
              rowIdx === offsetGroupStart;
            return (
              <React.Fragment key={layer}>
                {isFirstOnRow ? (
                  <tr>
                    <td
                      colSpan={1 + flatResources.length}
                      className="!pt-[var(--space-5)] !pb-[2px] text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] !border-t !border-t-[var(--color-border-table)]"
                    >
                      Offset if possible or keep
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 font-normal text-[var(--color-text-primary)]",
                      PANEL_BG,
                    )}
                  >
                    {layer}
                  </th>
                  {flatResources.map((c, i) => {
                    const key = cellKey(layer, c.activityId, c.resourceId);
                    // Legacy boolean values may still be on disk before the
                    // one-shot migration effect fires — guard the input.
                    const raw = cells[key];
                    const value = typeof raw === "string" ? raw : "";
                    const filled = value.trim().length > 0;
                    return (
                      <td
                        key={key}
                        className={cn(
                          "text-center",
                          groupDivider(i, c.isLastInGroup),
                          // Tint the inner number input when the cell holds
                          // a value — visual cue that the cell is allocated.
                          filled &&
                            "[&_input]:!bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
                        )}
                      >
                        <UnitValueControl
                          value={value}
                          units={WORK_TIME_UNITS}
                          defaultUnit="s"
                          ariaLabel={`Work time for ${layer} / ${c.activityName} / ${c.resourceName}`}
                          onChange={(v) => setCell(key, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Speed table — like the work-time table but layers come from the per-      */
/*  activity map (chosen from the Maps page) and cells store a speed value.   */
/* -------------------------------------------------------------------------- */

interface MapDef {
  id: string;
  name: string;
  layers: string[];
}

/** Compound key for the per-resource map selector: `${activityId}|${resourceId}`. */
const resourceMapKey = (activityId: string, resourceId: string) =>
  `${activityId}|${resourceId}`;

function SpeedMotionTable({
  activities,
  cells,
  onCellChange,
  resourceMaps,
  onMapChange,
  availableMaps,
  units,
  defaultUnit,
  emptyMessage,
}: {
  activities: MotionActivity[];
  cells: Record<string, string>;
  onCellChange: (key: string, value: string) => void;
  /** `${activityId}|${resourceId}` → mapId */
  resourceMaps: Record<string, string>;
  onMapChange: (activityId: string, resourceId: string, mapId: string) => void;
  availableMaps: MapDef[];
  units: readonly string[];
  defaultUnit: string;
  emptyMessage?: string;
}) {
  const mapById = React.useMemo(
    () => new Map(availableMaps.map((m) => [m.id, m])),
    [availableMaps],
  );

  const noResources = activities.every((a) => a.resources.length === 0);

  // Flat resource list (resource sub-headers / cell columns). Each entry now
  // also carries the layer set from its own selected map — drives both cell
  // editability and the union-layer computation below.
  const flatResources: Array<{
    activityId: string;
    activityName: string;
    activityIdx: number;
    resourceId: string;
    resourceName: string;
    isLastInGroup: boolean;
    mapId: string;
    mapLayers: Set<string>;
  }> = [];
  activities.forEach((act, activityIdx) => {
    act.resources.forEach((res, resIdx) => {
      const mapId = resourceMaps[resourceMapKey(act.id, res.id)] ?? "";
      const m = mapId ? mapById.get(mapId) : undefined;
      flatResources.push({
        activityId: act.id,
        activityName: act.name,
        activityIdx,
        resourceId: res.id,
        resourceName: res.name,
        isLastInGroup: resIdx === act.resources.length - 1,
        mapId,
        mapLayers: new Set(m?.layers ?? []),
      });
    });
  });

  // Union of layers across every resource's selected map. Insertion order
  // follows the resource column order so the leftmost columns' layers sit
  // at the top.
  const unionLayers: string[] = [];
  {
    const seen = new Set<string>();
    for (const c of flatResources) {
      const m = c.mapId ? mapById.get(c.mapId) : undefined;
      if (!m) continue;
      for (const layer of m.layers) {
        if (!seen.has(layer)) {
          seen.add(layer);
          unionLayers.push(layer);
        }
      }
    }
  }

  const visibleActivityCount = activities.filter(
    (a) => a.resources.length > 0,
  ).length;

  // Width the layer column to fit the longest layer (or "Layer" if shorter).
  const layerColMaxLen = unionLayers.reduce(
    (m, l) => Math.max(m, l.length),
    "Layer".length,
  );
  const layerColStyle = { width: `${layerColMaxLen}ch` } as const;

  const groupDivider = (idx: number, isLastInGroup: boolean) =>
    isLastInGroup && idx !== flatResources.length - 1
      ? "border-r border-r-[var(--color-border-table)]"
      : "";

  const PANEL_BG =
    "bg-[color-mix(in_srgb,var(--color-bg-canvas)_50%,var(--color-bg-surface))]";

  if (noResources) {
    return (
      <div className="flex h-full items-center justify-center p-[var(--space-4)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          {emptyMessage ??
            "No resources mapped to any activity in the active crew option."}
        </p>
      </div>
    );
  }

  return (
    <div className="app-scrollbar overflow-x-auto">
      <table
        className={cn(
          "app-table",
          "!table-fixed w-full",
          "[&_thead_th]:!bg-transparent",
          "[&_tbody_tr]:!bg-transparent",
          "[&_tbody_tr:hover]:!bg-transparent",
          "[&_thead_th]:overflow-hidden",
          "[&_tbody_td]:overflow-hidden",
          "[&_tbody_tr:last-child_td]:!border-b",
          "[&_tbody_tr:last-child_td]:!border-b-[var(--color-border-table)]",
          "[&_tbody_tr:last-child_th]:!border-b",
          "[&_tbody_tr:last-child_th]:!border-b-[var(--color-border-table)]",
        )}
      >
        <colgroup>
          {/* eslint-disable-next-line template/no-jsx-style-prop -- width derives from longest layer name */}
          <col style={layerColStyle} />
          {flatResources.map((c) => (
            <col key={`${c.activityId}|${c.resourceId}`} />
          ))}
        </colgroup>
        <thead>
          {/* Activity row */}
          <tr>
            <th className={cn("sticky left-0 z-10 !border-b-0", PANEL_BG)} />
            {activities.map((act, idx) =>
              act.resources.length === 0 ? null : (
                <th
                  key={act.id}
                  colSpan={act.resources.length}
                  className={cn(
                    "truncate text-center",
                    idx !== visibleActivityCount - 1 &&
                      "border-r border-r-[var(--color-border-table)]",
                  )}
                  title={act.name}
                >
                  {act.name}
                </th>
              ),
            )}
          </tr>
          {/* Resource sub-headers */}
          <tr>
            <th className={cn("sticky left-0 z-10 !border-b-0", PANEL_BG)} />
            {flatResources.map((c, i) => (
              <th
                key={`${c.activityId}|${c.resourceId}`}
                className={cn(
                  "!border-b-0 truncate text-center",
                  groupDivider(i, c.isLastInGroup),
                )}
                title={c.resourceName}
              >
                {c.resourceName}
              </th>
            ))}
          </tr>
          {/* Map-selector row — one dropdown per resource, sits below the
              resource header and drives that resource column's layers.
              Corner cell carries both column labels: "Layer" (for the row
              headers below) on the left, "Map" (for this row) on the right. */}
          <tr>
            <th
              className={cn(
                "sticky left-0 z-10 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]",
                PANEL_BG,
              )}
            >
              <div className="flex items-center justify-between gap-[var(--space-2)]">
                <span>Layer</span>
                <span>Map</span>
              </div>
            </th>
            {flatResources.map((c, i) => (
              <th
                key={`${c.activityId}|${c.resourceId}`}
                className={cn(
                  "text-center",
                  groupDivider(i, c.isLastInGroup),
                )}
              >
                <select
                  value={c.mapId}
                  onChange={(e) =>
                    onMapChange(c.activityId, c.resourceId, e.target.value)
                  }
                  aria-label={`Map for ${c.activityName} / ${c.resourceName}`}
                  className="h-[var(--control-height-sm)] w-full max-w-full cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                >
                  <option value="">— none —</option>
                  {availableMaps.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {unionLayers.length === 0 ? (
            <tr>
              <td
                colSpan={1 + flatResources.length}
                className="py-6 text-center text-xs text-[var(--color-text-muted)]"
              >
                Pick a map for each resource to populate layers.
              </td>
            </tr>
          ) : (
            unionLayers.map((layer) => (
              <tr key={layer}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 font-normal text-[var(--color-text-primary)]",
                    PANEL_BG,
                  )}
                >
                  {layer}
                </th>
                {flatResources.map((c, i) => {
                  const key = cellKey(layer, c.activityId, c.resourceId);
                  // Only allow editing when the resource's selected map
                  // contains this layer — otherwise the cell isn't applicable.
                  const inMap = c.mapLayers.has(layer);
                  const raw = cells[key];
                  const value = typeof raw === "string" ? raw : "";
                  const filled = value.trim().length > 0;
                  return (
                    <td
                      key={key}
                      className={cn(
                        "text-center",
                        groupDivider(i, c.isLastInGroup),
                        filled &&
                          inMap &&
                          "[&_input]:!bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
                      )}
                    >
                      {inMap ? (
                        <UnitValueControl
                          value={value}
                          units={units}
                          defaultUnit={defaultUnit}
                          ariaLabel={`Speed for ${layer} / ${c.activityName} / ${c.resourceName}`}
                          onChange={(v) => onCellChange(key, v)}
                        />
                      ) : (
                        <span className="text-[var(--color-text-muted)]">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Resource colour palette + per-activity legend overlay                     */
/* -------------------------------------------------------------------------- */

// Distinct palette per resource. Stable: same resource name → same colour
// across re-renders, since we look up by index in a deduped name list.
const RESOURCE_COLORS = [
  "#3B82F6", "#EF4444", "#22C55E", "#F59E0B",
  "#A855F7", "#06B6D4", "#EC4899", "#84CC16",
  "#F97316", "#14B8A6", "#8B5CF6", "#10B981",
  "#D946EF", "#0EA5E9", "#FBBF24", "#65A30D",
] as const;

interface ActivityMapEntry {
  layer: string;
  resource: string;
  color: string;
}
interface ActivityMap {
  id: string;
  name: string;
  pointType: "SP" | "RP";
  entries: ActivityMapEntry[];
}

function ActivityLegendOverlay({
  activityMaps,
  selected,
  onSelect,
}: {
  activityMaps: ActivityMap[];
  /** Currently-selected activity by ID (stable across renames). */
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (activityMaps.length === 0) return null;
  return (
    <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-64 flex-col overflow-hidden rounded-md border border-[var(--color-border-subtle)] bg-[color-mix(in_srgb,var(--color-bg-surface)_92%,transparent)] shadow-md backdrop-blur">
      <div className="border-b border-[var(--color-border-subtle)] px-[var(--space-3)] py-[var(--space-2)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        Activities
      </div>
      <ul className="overflow-y-auto p-[var(--space-2)]">
        {activityMaps.map((am) => {
          const isSelected = am.id === selected;
          const hasEntries = am.entries.length > 0;
          return (
            <li key={am.id}>
              <button
                type="button"
                onClick={() => onSelect(isSelected ? null : am.id)}
                disabled={!hasEntries}
                className={cn(
                  "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs transition-colors",
                  isSelected
                    ? "bg-[var(--color-bg-elevated)] font-semibold text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
                  !hasEntries && "opacity-40",
                )}
              >
                <span className="flex items-center gap-[var(--space-1)]">
                  <Icon
                    icon={isSelected ? appIcons.chevronDown : appIcons.chevronRight}
                    size={10}
                    className="text-[var(--color-text-muted)]"
                  />
                  <span className="truncate">{am.name}</span>
                  <span className="ml-[var(--space-1)] text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                    {am.pointType}
                  </span>
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {am.entries.length}
                </span>
              </button>
              {isSelected && am.entries.length > 0 ? (
                <ul className="mt-[var(--space-1)] mb-[var(--space-2)] space-y-[var(--space-1)] pl-[var(--space-5)]">
                  {am.entries.map((e, i) => (
                    <li
                      key={`${e.layer}|${i}`}
                      className="flex items-center gap-[var(--space-2)] text-[11px] text-[var(--color-text-secondary)]"
                    >
                      <span
                        // eslint-disable-next-line template/no-jsx-style-prop -- runtime resource color
                        style={{ backgroundColor: e.color }}
                        className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-border-subtle)]"
                      />
                      <span className="truncate" title={`${e.resource} · ${e.layer}`}>
                        <span className="text-[var(--color-text-primary)]">{e.resource}</span>
                        <span className="ml-[var(--space-1)] text-[var(--color-text-muted)]">
                          · {e.layer}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function CrewMotionPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );
  const { data: offsettersSection } = useSectionData<OffsettersSectionData>(
    projectId,
    "offsetters",
    DEFAULT_OFFSETTERS_SECTION,
  );
  const { data: layersSection } = useSectionData<LayersSectionData>(
    projectId,
    "layers",
    DEFAULT_LAYERS_SECTION,
  );
  const { data: mapsSection } = useSectionData<MapsSectionData>(
    projectId,
    "maps",
    DEFAULT_MAPS_SECTION,
  );
  const { data: motion, update: updateMotion } =
    useSectionData<CrewMotionSectionData>(
      projectId,
      "crew_motion",
      DEFAULT_CREW_MOTION_SECTION,
    );
  const moveSpeed = React.useMemo(
    () => motion.moveSpeed ?? { cells: {}, maps: {} },
    [motion.moveSpeed],
  );

  const offsetters = offsettersSection.configs ?? [];

  // Selected offsetter — defaults to the first available, then sticks until
  // the user changes it (or the chosen one disappears from the list).
  const [selectedOffsetterId, setSelectedOffsetterId] = React.useState<
    string | null
  >(null);
  React.useEffect(() => {
    if (offsetters.length === 0) {
      if (selectedOffsetterId !== null) setSelectedOffsetterId(null);
      return;
    }
    if (!offsetters.some((o) => o.id === selectedOffsetterId)) {
      setSelectedOffsetterId(offsetters[0].id);
    }
  }, [offsetters, selectedOffsetterId]);
  const selectedOffsetter = offsetters.find((o) => o.id === selectedOffsetterId);

  // Set one cell's work time. Empty / whitespace clears it. We always write
  // a flat dict back — no need for a mutation-style hook since
  // useSectionData already debounces saves.
  const handleCellChange = React.useCallback(
    (key: string, value: string) => {
      const next = { ...motion.cells };
      if (value && value.trim()) next[key] = value;
      else delete next[key];
      updateMotion({ ...motion, cells: next });
    },
    [motion, updateMotion],
  );

  // Move-speed handlers. Same shape as handleCellChange but writing into
  // `moveSpeed.cells` and `moveSpeed.maps` respectively.
  const handleMoveSpeedCellChange = React.useCallback(
    (key: string, value: string) => {
      const nextCells = { ...moveSpeed.cells };
      if (value && value.trim()) nextCells[key] = value;
      else delete nextCells[key];
      updateMotion({
        ...motion,
        moveSpeed: { cells: nextCells, maps: moveSpeed.maps },
      });
    },
    [motion, moveSpeed, updateMotion],
  );
  const handleMoveSpeedMapChange = React.useCallback(
    (activityId: string, resourceId: string, mapId: string) => {
      const k = `${activityId}|${resourceId}`;
      const nextMaps = { ...moveSpeed.maps };
      if (mapId) nextMaps[k] = mapId;
      else delete nextMaps[k];
      updateMotion({
        ...motion,
        moveSpeed: { cells: moveSpeed.cells, maps: nextMaps },
      });
    },
    [motion, moveSpeed, updateMotion],
  );

  // ────────────────────────────────────────────────────────────────────
  // One-shot migration: legacy cell keys were `{layer}|{actName}|{resName}`
  // which broke whenever the user renamed an activity / resource. We now
  // store `{layer}|{actId}|{resId}` (UUIDs from the crew option). When we
  // detect any name-based keys still on disk, look up the corresponding
  // IDs in the live crew option and rewrite the section in place.
  // ────────────────────────────────────────────────────────────────────
  const migratedRef = React.useRef(false);
  React.useEffect(() => {
    if (migratedRef.current) return;
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return;
    const keys = Object.keys(motion.cells);
    // Wait for data to actually load before deciding — don't lock in
    // `migrated` against the loading-state default `{}`, otherwise the
    // real data arriving on the next render would never get migrated.
    if (keys.length === 0) return;
    // UUID-shaped strings: 8-4-4-4-12 hex with dashes. Anything else is
    // treated as a name → needs migration.
    const idShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const needsMigration =
      keys.some((k) => {
        const parts = k.split("|");
        return parts.length === 3 && (!idShape.test(parts[1]) || !idShape.test(parts[2]));
      }) ||
      // Legacy boolean values predate the work-time inputs — coerce to
      // strings even when keys are already ID-based.
      Object.values(motion.cells).some((v) => typeof v !== "string");
    if (!needsMigration) {
      migratedRef.current = true;
      return;
    }
    const actByName = new Map(opt.activities.map((a) => [a.name, a]));
    const next: Record<string, string> = {};
    let migrated = 0;
    let dropped = 0;
    for (const [key, raw] of Object.entries(motion.cells)) {
      if (!raw) continue;
      // Legacy `true` boolean values predate work-time inputs — preserve
      // them as empty strings so the cell stays "allocated" but the user
      // re-enters the time. Newer entries are already strings.
      const value = typeof raw === "string" ? raw : "";
      const parts = key.split("|");
      if (parts.length !== 3) continue;
      const [layer, second, third] = parts;
      // Already ID-based — copy through.
      if (idShape.test(second) && idShape.test(third)) {
        next[key] = value;
        continue;
      }
      const act = actByName.get(second);
      if (!act) {
        dropped++;
        continue;
      }
      const res = act.resources.find((r) => r.name === third);
      if (!res) {
        dropped++;
        continue;
      }
      next[cellKey(layer, act.id, res.id)] = value;
      migrated++;
    }
    migratedRef.current = true;
    if (migrated > 0 || dropped > 0) {
      updateMotion({ ...motion, cells: next });
      // Surfacing for posterity — the migration is idempotent so a
      // duplicated run from React strict mode is harmless.
      // eslint-disable-next-line no-console -- one-shot migration trace
      console.info(
        `[crew_motion] migrated ${migrated} name-based cells to IDs` +
          (dropped > 0 ? ` (dropped ${dropped} unmappable)` : ""),
      );
    }
    // `motion` is referenced for the merge-write — gated by
    // `migratedRef`, so subsequent changes don't re-trigger the migration.
  }, [crewSection, motion, updateMotion]);

  // Activities (and their resources) from the active crew option, split by
  // point type so each button feeds the right slice into the table. IDs
  // travel with the entries so the cell keys can be ID-based instead of
  // name-based — a rename of an activity or resource leaves the cells
  // intact.
  const { spActivities, rpActivities } = React.useMemo(() => {
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return { spActivities: [], rpActivities: [] };
    const sp: MotionActivity[] = [];
    const rp: MotionActivity[] = [];
    for (const a of opt.activities) {
      const entry: MotionActivity = {
        id: a.id,
        name: a.name,
        resources: a.resources.map((r) => ({ id: r.id, name: r.name })),
      };
      (a.pointType === "RP" ? rp : sp).push(entry);
    }
    return { spActivities: sp, rpActivities: rp };
  }, [crewSection]);

  // Build the layer rows for one side of the chosen offsetter — keep only
  // rules where `skip === false`, then sort `offset === false` first and
  // `offset === true` second. `offsetGroupStart` marks where the ON group
  // begins for the OFF/ON divider row inside the table.
  const buildLayerData = React.useCallback(
    (side: OffsetterSide | undefined) => {
      const rules = side?.layerRules ?? [];
      const noOffset: string[] = [];
      const withOffset: string[] = [];
      for (const r of rules) {
        if (r.skip) continue;
        (r.offset ? withOffset : noOffset).push(r.layer);
      }
      return {
        layers: [...noOffset, ...withOffset],
        offsetGroupStart: noOffset.length,
      };
    },
    [],
  );

  const sourcesData = React.useMemo(
    () => buildLayerData(selectedOffsetter?.sources),
    [selectedOffsetter, buildLayerData],
  );
  const receiversData = React.useMemo(
    () => buildLayerData(selectedOffsetter?.receivers),
    [selectedOffsetter, buildLayerData],
  );

  const noOffsetterMsg = !selectedOffsetter
    ? "No Offsets options configured. Add one in the Offsets settings page."
    : undefined;

  // ──────────────────────────────────────────────────────────────────────
  // Per-activity maps for the viewport.
  //   • One map per activity in the active crew option.
  //   • Each map's layers = those for which the activity has at least one
  //     ticked resource in the motion cells.
  //   • Each layer is rendered in its assigned resource's colour.
  //   • Resource colours come from a stable palette indexed by the
  //     resource's position in the crew option's deduped resource list.
  // ──────────────────────────────────────────────────────────────────────
  const activityMaps = React.useMemo<ActivityMap[]>(() => {
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return [];
    // Stable palette: dedupe resources across activities by ID, assign by
    // index. ID-based dedup means colour stays put even after a rename.
    const allResourceIds: string[] = [];
    for (const a of opt.activities) {
      for (const r of a.resources) {
        if (!allResourceIds.includes(r.id)) allResourceIds.push(r.id);
      }
    }
    const colorOf = (id: string) =>
      RESOURCE_COLORS[allResourceIds.indexOf(id) % RESOURCE_COLORS.length] ??
      RESOURCE_COLORS[0];
    return opt.activities.map((a) => {
      const entries: ActivityMapEntry[] = [];
      const seenLayer = new Set<string>();
      // Cell keys are now `${layer}|${activityId}|${resourceId}`. We pick
      // the first matching resource per layer to avoid double-rendering.
      for (const r of a.resources) {
        const prefix = `|${a.id}|${r.id}`;
        for (const [key, ticked] of Object.entries(motion.cells)) {
          if (!ticked) continue;
          if (!key.endsWith(prefix)) continue;
          const layer = key.slice(0, key.length - prefix.length);
          if (!layer || seenLayer.has(layer)) continue;
          seenLayer.add(layer);
          entries.push({ layer, resource: r.name, color: colorOf(r.id) });
        }
      }
      return { id: a.id, name: a.name, pointType: a.pointType, entries };
    });
  }, [crewSection, motion]);

  /** Currently-selected activity in the legend overlay, by ID. */
  const [selectedActivity, setSelectedActivity] = React.useState<string | null>(
    null,
  );

  // Active left-panel tab — controls which side of the offsetter feeds the
  // tables AND which activities (SP-only / RP-only) appear in the map's
  // legend overlay on the right.
  const [activeTab, setActiveTab] = React.useState<"sources" | "receivers">(
    "sources",
  );

  // Legend visibility follows the tab: SOURCES → SP activities, RECEIVERS
  // → RP activities. If the currently-selected activity gets filtered out
  // by a tab switch, drop the selection so the map clears too.
  const visibleActivityMaps = React.useMemo(
    () =>
      activityMaps.filter((am) =>
        activeTab === "sources" ? am.pointType === "SP" : am.pointType === "RP",
      ),
    [activityMaps, activeTab],
  );
  React.useEffect(() => {
    if (
      selectedActivity &&
      !visibleActivityMaps.some((am) => am.id === selectedActivity)
    ) {
      setSelectedActivity(null);
    }
  }, [selectedActivity, visibleActivityMaps]);

  const selectedActivityMap = visibleActivityMaps.find(
    (am) => am.id === selectedActivity,
  );

  // Map layer-name → its full definition for source-file lookup.
  const layerByName = React.useMemo(() => {
    const m = new Map<string, LayerDefinition>();
    for (const l of layersSection.layers) m.set(l.name, l);
    return m;
  }, [layersSection]);

  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    if (!selectedActivityMap) return [];
    const out: VisibleFile[] = [];
    for (const entry of selectedActivityMap.entries) {
      const def = layerByName.get(entry.layer);
      if (!def || !def.sourceFiles || def.sourceFiles.length === 0) continue;
      const style: GisLayerStyle = {
        color: entry.color,
        width: 2,
        opacity: 1,
        fillOpacity: 1,
        filled: true,
        visible: true,
      };
      const fclassFilter =
        def.sourceValues && def.sourceValues.length > 0
          ? def.sourceValues
          : undefined;
      for (const stem of def.sourceFiles) {
        const category: FileCategory =
          def.from === "polygons"
            ? "polygons"
            : stem.startsWith("osm_edits_")
              ? "osm_edits"
              : "gis_layers";
        out.push({
          category,
          filename: `${stem}.gpkg`,
          style,
          fclassFilter,
        });
      }
    }
    return out;
  }, [selectedActivityMap, layerByName]);

  const viewport = (
    <div className="relative h-full w-full">
      <GisViewerViewport
        projectId={projectId}
        visibleFiles={visibleFiles}
        onStyleChange={() => {
          /* legend is custom — no per-layer style edits here */
        }}
        viewStateKey={projectId != null ? `motion:${projectId}` : undefined}
        hideLegend
      />
      <ActivityLegendOverlay
        activityMaps={visibleActivityMaps}
        selected={selectedActivity}
        onSelect={setSelectedActivity}
      />
    </div>
  );

  return (
    <ProjectSettingsPage title="Motion" panelTitle="Motion" viewport={viewport}>
      <Tabs defaultValue="work-time">
        <TabsList>
          <TabsTrigger value="work-time">Work time</TabsTrigger>
          <TabsTrigger value="move-speed">Move speed</TabsTrigger>
          <TabsTrigger value="travel-speed">Travel speed</TabsTrigger>
        </TabsList>
        <TabsContent value="work-time">
          <div className="flex flex-col gap-[var(--space-3)]">
            <Field label="Offsets option">
              {offsetters.length === 0 ? (
                <span className="text-xs text-[var(--color-text-muted)]">
                  — none configured —
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-[var(--space-1)]">
                  {offsetters.map((o) => {
                    const selected = o.id === selectedOffsetterId;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSelectedOffsetterId(o.id)}
                        className={cn(
                          "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                          selected
                            ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                            : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                        )}
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "sources" | "receivers")}
        >
          <TabsList>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="receivers">Receivers</TabsTrigger>
          </TabsList>
          <TabsContent value="sources">
            <WorkTimeMotionTable
              layers={sourcesData.layers}
              offsetGroupStart={sourcesData.offsetGroupStart}
              activities={spActivities}
              cells={motion.cells}
              onChange={handleCellChange}
              emptyMessage={
                noOffsetterMsg ??
                (sourcesData.layers.length === 0
                  ? "No source layers (after filtering out skipped) for the selected Offsets option."
                  : undefined)
              }
            />
          </TabsContent>
          <TabsContent value="receivers">
            <WorkTimeMotionTable
              layers={receiversData.layers}
              offsetGroupStart={receiversData.offsetGroupStart}
              activities={rpActivities}
              cells={motion.cells}
              onChange={handleCellChange}
              emptyMessage={
                noOffsetterMsg ??
                (receiversData.layers.length === 0
                  ? "No receiver layers (after filtering out skipped) for the selected Offsets option."
                  : undefined)
              }
            />
          </TabsContent>
        </Tabs>
          </div>
        </TabsContent>
        <TabsContent value="move-speed">
          <div className="flex flex-col gap-[var(--space-3)]">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "sources" | "receivers")}
            >
              <TabsList>
                <TabsTrigger value="sources">Sources</TabsTrigger>
                <TabsTrigger value="receivers">Receivers</TabsTrigger>
              </TabsList>
              <TabsContent value="sources">
                <SpeedMotionTable
                  activities={spActivities}
                  cells={moveSpeed.cells}
                  onCellChange={handleMoveSpeedCellChange}
                  resourceMaps={moveSpeed.maps}
                  onMapChange={handleMoveSpeedMapChange}
                  availableMaps={mapsSection.maps}
                  units={SPEED_UNITS}
                  defaultUnit="kmph"
                />
              </TabsContent>
              <TabsContent value="receivers">
                <SpeedMotionTable
                  activities={rpActivities}
                  cells={moveSpeed.cells}
                  onCellChange={handleMoveSpeedCellChange}
                  resourceMaps={moveSpeed.maps}
                  onMapChange={handleMoveSpeedMapChange}
                  availableMaps={mapsSection.maps}
                  units={SPEED_UNITS}
                  defaultUnit="kmph"
                />
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
        <TabsContent value="travel-speed" />
      </Tabs>
    </ProjectSettingsPage>
  );
}
