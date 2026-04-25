"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { useProjectSection } from "@/services/query/project-sections";
import { ensureProjectFileRaw, useProjectFiles, projectFileKeys } from "@/services/query/project-files";
import {
  fetchFileGeoJson,
  saveProjectFileRaw,
  projectDemTileUrl,
  projectDemManifestUrl,
} from "@/services/api/project-files";
import { fetchCrsInfo, type CrsInfoResponse } from "@/services/api/crs";
import { computeGridConvergence } from "@/lib/grid-convergence";
import {
  getMapSessionState,
  updateMapSessionState,
} from "@/lib/map-view-state";
import type { FileCategory } from "@/services/api/project-files";
import { getRuntimeConfig } from "@/services/config/runtimeConfig";
import { ProjectSettingsPage } from "./project-settings-page";
import { LayerStatsPanel } from "./layer-stats-panel";
import { Dialog, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { appIcons } from "@/components/ui/icon";

const { pencil: Pencil, play: Play, plus: Plus, download: Download, loader: Loader, circleCheck: CircleCheck, alertTriangle: AlertTriangle, chevronDown: ChevronDown } = appIcons;
import { AngleInput } from "@/components/ui/angle-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  downloadOsmStream,
  clipOsmStream,
  prefetchClippedFclassInfo,
} from "@/services/api/project-osm";
import {
  gpkgToGeoJSON,
  insertGpkgFeatures,
  deleteGpkgFeatures,
  updateGpkgFeatures,
  exportDatabase,
  initializeGpkgSchema,
  ensureGpkgColumns,
} from "@/lib/gpkg";
import type {
  GeoJSONFeatureCollection,
  GpkgMeta,
  GpkgInitGeomType,
} from "@/lib/gpkg";
import type {
  RampName,
  LayerStyle,
  FoldOverlaySpec,
} from "@/components/features/demo/gis-globe-viewport";
import {
  foldRasterChunkUrl,
  type FoldSource,
} from "@/services/api/project-fold";
import { useFoldMeta } from "@/services/query/project-fold";
import { FoldColormapLegend } from "./fold-colormap-legend";

const GisGlobeViewport = dynamic(
  () =>
    import("@/components/features/demo/gis-globe-viewport").then(
      (m) => m.GisGlobeViewport
    ),
  { ssr: false }
);

// --------------------------------------------------------------------------
// Palettes (same as demo)
// --------------------------------------------------------------------------

const LAYER_PALETTE: ReadonlyArray<string> = [
  "#facc15", "#60a5fa", "#f472b6", "#34d399", "#f97316", "#a855f7",
  "#22d3ee", "#fb7185", "#84cc16", "#eab308", "#38bdf8", "#c084fc",
];

const FCLASS_PALETTE: ReadonlyArray<string> = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
  "#78716c", "#a3a3a3",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFor(file: string): string {
  return LAYER_PALETTE[hashString(file) % LAYER_PALETTE.length];
}

function fclassColorFor(value: string): string {
  return FCLASS_PALETTE[hashString(value) % FCLASS_PALETTE.length];
}

// --------------------------------------------------------------------------
// OSM-edit files
// --------------------------------------------------------------------------

type LoadedEntry = { data: GeoJSONFeatureCollection; meta: GpkgMeta };

const EDIT_FILES = {
  point: "osm_edits_points.gpkg",
  line: "osm_edits_lines.gpkg",
  polygon: "osm_edits_polygons.gpkg",
} as const;
type EditKind = keyof typeof EDIT_FILES;
const EDIT_KINDS: ReadonlyArray<EditKind> = ["point", "line", "polygon"];

const EDIT_GEOMETRY_TYPE: Record<EditKind, GpkgInitGeomType> = {
  point: "POINT",
  line: "LINESTRING",
  polygon: "POLYGON",
};

// The 3 osm_edits file keys in the regular selectedFiles/dbsRef system.
const EDIT_FILE_KEYS: Record<EditKind, string> = {
  point: `osm_edits/${EDIT_FILES.point}`,
  line: `osm_edits/${EDIT_FILES.line}`,
  polygon: `osm_edits/${EDIT_FILES.polygon}`,
};
const ALL_EDIT_FILE_KEYS = new Set(Object.values(EDIT_FILE_KEYS));

function editKindForGeometry(
  geom: GeoJSON.Geometry | null | undefined
): EditKind | null {
  if (!geom) return null;
  const t = geom.type;
  if (t === "Point" || t === "MultiPoint") return "point";
  if (t === "LineString" || t === "MultiLineString") return "line";
  if (t === "Polygon" || t === "MultiPolygon") return "polygon";
  return null;
}

/** Polygons, POI, and osm_edits are edited inline (source DB mutated
 *  directly). Only Geofabrik OSM layers (gis_osm_* files in the "gis_layers"
 *  category) route edits into the separate osm_edits files — user-uploaded
 *  layers are edited inline like everything else. */
const INLINE_EDIT_CATEGORIES = new Set<string>(["polygons", "poi", "osm_edits"]);

function isInlineEditKey(fileKey: string): boolean {
  const slash = fileKey.indexOf("/");
  if (slash < 0) return false;
  const cat = fileKey.slice(0, slash);
  if (INLINE_EDIT_CATEGORIES.has(cat)) return true;
  if (cat === "gis_layers") {
    const filename = fileKey.slice(slash + 1);
    return !filename.startsWith("gis_osm");
  }
  return false;
}

// --------------------------------------------------------------------------
// Sidebar section config
// --------------------------------------------------------------------------

type SidebarSection = {
  key: "polygons" | "poi" | "gis_layers";
  label: string;
  category: FileCategory;
};

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { key: "polygons", label: "Polygons", category: "polygons" },
  { key: "poi", label: "Points Of Interest", category: "poi" },
  { key: "gis_layers", label: "Terrain models", category: "gis_layers" },
];

const CATEGORY_GEOM_TYPE: Partial<Record<FileCategory, GpkgInitGeomType>> = {
  polygons: "POLYGON",
  poi: "POINT",
};

// --------------------------------------------------------------------------
// Collapsible section header
// --------------------------------------------------------------------------

/**
 * Title row for the Files left-panel sections — clickable button + chevron
 * that animates -90° when the section is collapsed. ``actions`` slot keeps
 * upload/import controls aligned to the right of the header without
 * conflicting with the toggle hit area.
 */
function CollapsibleSectionHeader({
  title,
  collapsed,
  onToggle,
  actions,
}: {
  title: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-[var(--space-1)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={
            "transition-transform duration-200 ease-out"
            + (collapsed ? " -rotate-90" : "")
          }
        />
      </button>
      {actions}
    </div>
  );
}


// --------------------------------------------------------------------------
// Margin box
// --------------------------------------------------------------------------

function MarginInput({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="h-6 w-14 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-1 text-center text-xs tabular-nums text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-focus-ring)]"
    />
  );
}

function MarginAzimuthBox({
  top, left, right, bottom,
  onTopChange, onLeftChange, onRightChange, onBottomChange,
  azimuth, onAzimuthChange,
}: {
  top: string; left: string; right: string; bottom: string;
  onTopChange: (v: string) => void;
  onLeftChange: (v: string) => void;
  onRightChange: (v: string) => void;
  onBottomChange: (v: string) => void;
  azimuth: number;
  onAzimuthChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-[var(--space-2)]">
      <MarginInput value={top} onChange={onTopChange} aria-label="Margin top" />
      <div className="flex items-center gap-[var(--space-3)]">
        <MarginInput value={left} onChange={onLeftChange} aria-label="Margin left" />
        <div className="relative shrink-0">
          <div className="absolute inset-[-8px] rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)]" />
          <AngleInput value={azimuth} onChange={onAzimuthChange} min={0} max={360} step={0.01} />
        </div>
        <MarginInput value={right} onChange={onRightChange} aria-label="Margin right" />
      </div>
      <MarginInput value={bottom} onChange={onBottomChange} aria-label="Margin bottom" />
    </div>
  );
}

// --------------------------------------------------------------------------
// OSM Download Panel (middle panel content)
// --------------------------------------------------------------------------

type StepStatus = "idle" | "running" | "done" | "error";

// --------------------------------------------------------------------------
// Margin rectangle computation (shared with survey page)
// --------------------------------------------------------------------------

const EARTH_R = 6_371_008.8;

function computeMarginRect(
  features: GeoJSON.Feature[],
  margins: { top: number; left: number; right: number; bottom: number },
  azimuthDeg: number,
): [number, number][] | null {
  const coords: [number, number][] = [];
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      coords.push([c[0] as number, c[1] as number]);
      return;
    }
    for (const sub of c) walk(sub);
  };
  for (const f of features) {
    if (f.geometry) walk((f.geometry as GeoJSON.Geometry & { coordinates: unknown }).coordinates);
  }
  if (coords.length === 0) return null;

  let cLon = 0, cLat = 0;
  for (const [lon, lat] of coords) { cLon += lon; cLat += lat; }
  cLon /= coords.length;
  cLat /= coords.length;

  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const DEG_TO_M_LAT = (Math.PI / 180) * EARTH_R;
  const DEG_TO_M_LON = DEG_TO_M_LAT * cosLat;

  const local = coords.map(([lon, lat]) => ({
    x: (lon - cLon) * DEG_TO_M_LON,
    y: (lat - cLat) * DEG_TO_M_LAT,
  }));

  const azRad = ((azimuthDeg - 90) * Math.PI) / 180;
  const cosA = Math.cos(azRad);
  const sinA = Math.sin(azRad);
  const rotated = local.map(({ x, y }) => ({
    x: x * cosA - y * sinA,
    y: x * sinA + y * cosA,
  }));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of rotated) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  minX -= margins.left;
  maxX += margins.right;
  minY -= margins.bottom;
  maxY += margins.top;

  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  const cosB = Math.cos(-azRad);
  const sinB = Math.sin(-azRad);
  const result: [number, number][] = corners.map(({ x, y }) => {
    const gx = x * cosB - y * sinB;
    const gy = x * sinB + y * cosB;
    return [cLon + gx / DEG_TO_M_LON, cLat + gy / DEG_TO_M_LAT] as [number, number];
  });
  result.push(result[0]);
  return result;
}

export interface OsmViewportData {
  polygonName: string;
  margins: { top: number; left: number; right: number; bottom: number };
  azimuth: number;
}

const CLIPPING_FILE = "osm_clipping_boundaries.gpkg";

interface OsmPanelData {
  refPolygon: string;
  marginTop: string;
  marginLeft: string;
  marginRight: string;
  marginBottom: string;
  rlAzimuth: string;
  skipIfExists: boolean;
  selectedLayers: string[];
  availableLayers: string[];
}

const DEFAULT_OSM_PANEL: OsmPanelData = {
  refPolygon: "",
  marginTop: "1000",
  marginLeft: "1000",
  marginRight: "1000",
  marginBottom: "1000",
  rlAzimuth: "0",
  skipIfExists: true,
  selectedLayers: [],
  availableLayers: [],
};

// Standard subset of OSM layers preselected for clipping
const DEFAULT_CLIP_LAYERS = [
  "gis_osm_buildings_a_free_1",
  "gis_osm_landuse_a_free_1",
  "gis_osm_railways_free_1",
  "gis_osm_roads_free_1",
  "gis_osm_water_a_free_1",
  "gis_osm_waterways_free_1",
];

function OsmDownloadPanel({
  projectId,
  onClose,
  onLayersClipped,
  onViewportChange,
}: {
  projectId: number | null;
  onClose: () => void;
  onLayersClipped?: () => void;
  onViewportChange?: (data: OsmViewportData | null) => void;
}) {
  // Own persisted state (no survey dependency)
  const { data: osmData, update: updateOsm } = useSectionData<OsmPanelData>(
    projectId, "osm", DEFAULT_OSM_PANEL,
  );

  // Read polygon files
  const { data: projectFiles } = useProjectFiles(projectId);
  const availablePolygons = React.useMemo(
    () => (projectFiles?.polygons ?? [])
      .filter((f) => f !== CLIPPING_FILE)
      .map((f) => f.replace(/\.gpkg$/, "")),
    [projectFiles?.polygons],
  );

  // Notify parent about viewport data
  React.useEffect(() => {
    if (!osmData.refPolygon) {
      onViewportChange?.(null);
      return;
    }
    onViewportChange?.({
      polygonName: osmData.refPolygon,
      margins: {
        top: Number(osmData.marginTop) || 0,
        left: Number(osmData.marginLeft) || 0,
        right: Number(osmData.marginRight) || 0,
        bottom: Number(osmData.marginBottom) || 0,
      },
      azimuth: Number(osmData.rlAzimuth) || 0,
    });
  }, [
    onViewportChange, osmData.refPolygon,
    osmData.marginTop, osmData.marginLeft,
    osmData.marginRight, osmData.marginBottom,
    osmData.rlAzimuth,
  ]);

  // Workflow state
  const [downloadStatus, setDownloadStatus] = React.useState<StepStatus>("idle");
  const [clipStatus, setClipStatus] = React.useState<StepStatus>("idle");
  const [downloadProgress, setDownloadProgress] = React.useState({ progress: 0, total: 0 });
  const [clipProgress, setClipProgress] = React.useState({ progress: 0, total: 0 });
  const [downloadMessage, setDownloadMessage] = React.useState("");
  const [clipMessage, setClipMessage] = React.useState("");

  const canDownload = Boolean(osmData.refPolygon);
  const canClip = osmData.availableLayers.length > 0 && osmData.selectedLayers.length > 0;

  /**
   * Fetch the reference polygon GeoJSON, compute the margin rectangle,
   * and save it as osm_clipping_boundaries.gpkg via the backend PUT endpoint.
   */
  const saveClippingBoundaries = React.useCallback(async (): Promise<boolean> => {
    if (!projectId || !osmData.refPolygon) return false;
    // 1. Fetch reference polygon GeoJSON
    const geojson = await fetchFileGeoJson(
      projectId, "polygons", `${osmData.refPolygon}.gpkg`,
    );
    // 2. Compute margin rectangle
    const margins = {
      top: Number(osmData.marginTop) || 0,
      left: Number(osmData.marginLeft) || 0,
      right: Number(osmData.marginRight) || 0,
      bottom: Number(osmData.marginBottom) || 0,
    };
    const rect = computeMarginRect(geojson.features, margins, Number(osmData.rlAzimuth) || 0);
    if (!rect) return false;
    // 3. Build a GPKG with the rectangle polygon
    const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    const db = new SQL.Database();
    initializeGpkgSchema(db, { tableName: "clipping_boundaries", geometryType: "POLYGON" });
    const { meta } = gpkgToGeoJSON(db);
    insertGpkgFeatures(db, meta, [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [rect] },
      properties: {},
    }]);
    const bytes = exportDatabase(db);
    db.close();
    // 4. Save to disk
    await saveProjectFileRaw(projectId, "polygons", CLIPPING_FILE, bytes.buffer as ArrayBuffer);
    return true;
  }, [projectId, osmData.refPolygon, osmData.marginTop, osmData.marginLeft, osmData.marginRight, osmData.marginBottom, osmData.rlAzimuth]);

  const handleDownload = React.useCallback(async () => {
    if (!projectId || !canDownload) return;
    setDownloadStatus("running");
    setDownloadProgress({ progress: 0, total: 0 });
    setDownloadMessage("");
    try {
      const saved = await saveClippingBoundaries();
      if (!saved) { setDownloadStatus("error"); setDownloadMessage("Failed to compute clipping boundaries"); return; }

      const final = await downloadOsmStream(
        projectId,
        { polygonFile: CLIPPING_FILE, skipIfExists: osmData.skipIfExists },
        (evt) => setDownloadProgress({ progress: evt.progress, total: evt.total }),
      );
      setDownloadStatus(final.ok ? "done" : "error");
      setDownloadMessage(final.message);
      if (final.ok && final.layers) {
        // Preselect the standard subset, intersected with what's actually available
        const preselected = DEFAULT_CLIP_LAYERS.filter((l) => final.layers!.includes(l));
        updateOsm({ ...osmData, availableLayers: final.layers, selectedLayers: preselected });
        onLayersClipped?.(); // refresh file list + dataset extent on viewport
      }
    } catch (err) {
      setDownloadStatus("error");
      setDownloadMessage(err instanceof Error ? err.message : "Download failed");
    }
  }, [projectId, canDownload, osmData, updateOsm, saveClippingBoundaries, onLayersClipped]);

  const handleClip = React.useCallback(async () => {
    if (!projectId || !canClip) return;
    setClipStatus("running");
    setClipProgress({ progress: 0, total: 0 });
    setClipMessage("");
    try {
      const saved = await saveClippingBoundaries();
      if (!saved) { setClipStatus("error"); setClipMessage("Failed to compute clipping boundaries"); return; }

      const final = await clipOsmStream(
        projectId,
        { polygonFile: CLIPPING_FILE, layers: osmData.selectedLayers },
        (evt) => {
          setClipProgress({ progress: evt.progress, total: evt.total });
          setClipMessage(evt.message);
        },
      );
      setClipStatus(final.ok ? "done" : "error");
      setClipMessage(final.message);
      if (final.ok) {
        onLayersClipped?.();
        // Populate the backend OSM fclass info cache for the newly clipped
        // files so legend hovers render instantly — fire-and-forget.
        void prefetchClippedFclassInfo(projectId, final.files).catch(() => {
          /* non-critical; hover will still fetch on demand */
        });
      }
    } catch (err) {
      setClipStatus("error");
      setClipMessage(err instanceof Error ? err.message : "Clip failed");
    }
  }, [projectId, canClip, osmData, onLayersClipped, saveClippingBoundaries]);

  const toggleLayer = React.useCallback(
    (layer: string) => {
      const selected = osmData.selectedLayers.includes(layer)
        ? osmData.selectedLayers.filter((l) => l !== layer)
        : [...osmData.selectedLayers, layer];
      updateOsm({ ...osmData, selectedLayers: selected });
    },
    [osmData, updateOsm],
  );

  const toggleAll = React.useCallback(() => {
    const allSelected = osmData.selectedLayers.length === osmData.availableLayers.length;
    updateOsm({
      ...osmData,
      selectedLayers: allSelected ? [] : [...osmData.availableLayers],
    });
  }, [osmData, updateOsm]);

  return (
    <div className="p-[var(--space-4)]">
      <div className="mb-[var(--space-4)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Download OSM Layers
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Close panel"
        >
          &times;
        </button>
      </div>

      <div className="flex flex-col gap-[var(--space-4)]">
        {/* Polygon */}
        <Field label="Ref. Polygon" layout="horizontal">
          <Select
            value={osmData.refPolygon}
            onChange={(e) => updateOsm({ ...osmData, refPolygon: e.target.value })}
          >
            <option value="">None</option>
            {availablePolygons.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>

        {/* Margins & RL Azimuth */}
        <Field label="Margins & RL Azimuth">
          <div className="pt-[var(--space-2)]">
            <MarginAzimuthBox
              top={osmData.marginTop}
              left={osmData.marginLeft}
              right={osmData.marginRight}
              bottom={osmData.marginBottom}
              onTopChange={(v) => updateOsm({ ...osmData, marginTop: v })}
              onLeftChange={(v) => updateOsm({ ...osmData, marginLeft: v })}
              onRightChange={(v) => updateOsm({ ...osmData, marginRight: v })}
              onBottomChange={(v) => updateOsm({ ...osmData, marginBottom: v })}
              azimuth={Number(osmData.rlAzimuth) || 0}
              onAzimuthChange={(v) => updateOsm({ ...osmData, rlAzimuth: String(v) })}
            />
          </div>
        </Field>

        <div className="h-px bg-[var(--color-border-subtle)]" />

        {/* Download button + progress */}
        <div className="space-y-[var(--space-1)]">
          <div className="flex items-center gap-[var(--space-3)]">
            <Button
              variant="primary"
              size="sm"
              disabled={!canDownload || downloadStatus === "running"}
              onClick={handleDownload}
              className="shrink-0 gap-[var(--space-2)]"
            >
              {downloadStatus === "running" ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {downloadStatus === "running" ? "Downloading..." : "Download"}
              {downloadStatus !== "running" && (
                <span
                  role="checkbox"
                  aria-checked={!osmData.skipIfExists}
                  aria-label="Force download"
                  title="Force download"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateOsm({ ...osmData, skipIfExists: osmData.skipIfExists === false });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      updateOsm({ ...osmData, skipIfExists: osmData.skipIfExists === false });
                    }
                  }}
                  className={cn(
                    "ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-[3px] border",
                    !osmData.skipIfExists
                      ? "border-white/90 bg-white/25"
                      : "border-white/50 bg-transparent hover:border-white/80",
                  )}
                >
                  {!osmData.skipIfExists && (
                    <span
                      className="block h-2 w-2 rounded-[1px]"
                      // eslint-disable-next-line template/no-jsx-style-prop -- inverse color on primary button
                      style={{ backgroundColor: "currentColor" }}
                    />
                  )}
                </span>
              )}
            </Button>
            {downloadStatus === "running" && downloadProgress.total > 0 && (
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                  // eslint-disable-next-line template/no-jsx-style-prop
                  style={{ width: `${Math.min(100, (downloadProgress.progress / downloadProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
          {downloadMessage && downloadStatus !== "running" && (
            <span className={cn(
              "text-[11px]",
              downloadStatus === "error"
                ? "text-[var(--color-status-danger)]"
                : "text-[var(--color-text-muted)]",
            )}>
              {downloadMessage}
            </span>
          )}
        </div>

        {/* Layer selection (shown after download) */}
        {osmData.availableLayers.length > 0 && (
          <>
            <div className="h-px bg-[var(--color-border-subtle)]" />
            <div className="space-y-[var(--space-2)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Layers ({osmData.selectedLayers.length}/{osmData.availableLayers.length})
                </span>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  {osmData.selectedLayers.length === osmData.availableLayers.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="space-y-[var(--space-1)]">
                {osmData.availableLayers.map((layer: string) => (
                  <label
                    key={layer}
                    className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)] cursor-pointer"
                  >
                    <Checkbox
                      checked={osmData.selectedLayers.includes(layer)}
                      onCheckedChange={() => toggleLayer(layer)}
                    />
                    {layer}
                  </label>
                ))}
              </div>

              {/* Clip button + progress */}
              <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-3)]">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canClip || clipStatus === "running"}
                  onClick={handleClip}
                  className="shrink-0 gap-[var(--space-2)]"
                >
                  {clipStatus === "running" ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {clipStatus === "running" ? "Clipping..." : "Clip Selected"}
                </Button>
                {clipStatus === "running" && clipProgress.total > 0 && (
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                      // eslint-disable-next-line template/no-jsx-style-prop
                      style={{ width: `${Math.min(100, (clipProgress.progress / clipProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Clip status message */}
        {clipMessage && clipStatus !== "idle" && (
          <div
            className={cn(
              "flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs",
              clipStatus === "done"
                ? "border border-[var(--color-status-success-border,#34d399)] bg-[var(--color-status-success-bg,#d1fae5)] text-[var(--color-status-success-text,#065f46)]"
                : clipStatus === "error"
                  ? "border border-[var(--color-status-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-status-danger)]"
                  : "text-[var(--color-text-muted)]"
            )}
          >
            {clipStatus === "done" && <CircleCheck size={13} />}
            {clipStatus === "error" && <AlertTriangle size={13} />}
            {clipMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function ProjectGisGlobe() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const queryClient = useQueryClient();
  const { data: fileList } = useProjectFiles(projectId);

  // Selected files keyed as "category/filename" for uniqueness. Seeded
  // from the session cache so ticks survive leaving and returning to
  // the Files tab within a session — falls back to empty on a fresh
  // projectId or a hard reload.
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>(() => {
    if (projectId == null) return [];
    return getMapSessionState(`files:${projectId}`)?.selectedFiles ?? [];
  });

  // Restore cached ticks on project switch (the initial useState above
  // only fires on first mount, so a later project change wouldn't see
  // its cached entry without this effect).
  const restoredProjectIdRef = React.useRef<number | null>(projectId);
  React.useEffect(() => {
    if (projectId == null) return;
    if (restoredProjectIdRef.current === projectId) return;
    restoredProjectIdRef.current = projectId;
    const cached = getMapSessionState(`files:${projectId}`)?.selectedFiles;
    setSelectedFiles(cached ?? []);
  }, [projectId]);

  // Persist tick list for cross-navigation restore.
  React.useEffect(() => {
    if (projectId == null) return;
    updateMapSessionState(`files:${projectId}`, { selectedFiles });
  }, [selectedFiles, projectId]);

  // Active fold overlay (single, radio-style). Stores the canonical
  // grid-option name plus the source + offset range that uniquely
  // identifies a rendered fold on disk; ``null`` means no overlay.
  type ActiveFold = {
    option: string;
    source: FoldSource;
    omin: number;
    omax: number;
  };
  const [activeFold, setActiveFold] = React.useState<ActiveFold | null>(() => {
    if (projectId == null) return null;
    return getMapSessionState(`files:${projectId}`)?.activeFold ?? null;
  });
  // Restore on project switch — useState init only fires on first mount.
  const restoredFoldProjectIdRef = React.useRef<number | null>(projectId);
  React.useEffect(() => {
    if (projectId == null) return;
    if (restoredFoldProjectIdRef.current === projectId) return;
    restoredFoldProjectIdRef.current = projectId;
    setActiveFold(
      getMapSessionState(`files:${projectId}`)?.activeFold ?? null,
    );
  }, [projectId]);
  React.useEffect(() => {
    if (projectId == null) return;
    updateMapSessionState(`files:${projectId}`, { activeFold });
  }, [activeFold, projectId]);

  const toggleFoldOverlay = React.useCallback((next: ActiveFold) => {
    setActiveFold((curr) =>
      curr
      && curr.option === next.option
      && curr.source === next.source
      && curr.omin === next.omin
      && curr.omax === next.omax
        ? null
        : next,
    );
  }, []);

  // Per-section collapsed state — every left-panel section registers a
  // stable id. Set membership is the source of truth, persisted as an
  // array so the layout sticks across nav.
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(
    () => {
      if (projectId == null) return new Set();
      return new Set(
        getMapSessionState(`files:${projectId}`)?.collapsedSections ?? [],
      );
    },
  );
  const restoredCollapseProjectIdRef = React.useRef<number | null>(projectId);
  React.useEffect(() => {
    if (projectId == null) return;
    if (restoredCollapseProjectIdRef.current === projectId) return;
    restoredCollapseProjectIdRef.current = projectId;
    setCollapsedSections(
      new Set(getMapSessionState(`files:${projectId}`)?.collapsedSections ?? []),
    );
  }, [projectId]);
  React.useEffect(() => {
    if (projectId == null) return;
    updateMapSessionState(`files:${projectId}`, {
      collapsedSections: [...collapsedSections],
    });
  }, [collapsedSections, projectId]);
  const toggleSectionCollapsed = React.useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [hiddenFiles, setHiddenFiles] = React.useState<Set<string>>(
    () => new Set()
  );
  const [hiddenFclasses, setHiddenFclasses] = React.useState<Set<string>>(
    () => new Set()
  );
  const [layerData, setLayerData] = React.useState<Map<string, LoadedEntry>>(
    () => new Map()
  );
  const [selectedDem, setSelectedDem] = React.useState<string>("");
  const [terrainOn, setTerrainOn] = React.useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = React.useState(1.4);
  const [demOpacity, setDemOpacity] = React.useState(0.85);
  const [demColorRamp, setDemColorRamp] =
    React.useState<RampName>("hypsometric");
  const [osmPanelOpen, setOsmPanelOpen] = React.useState(false);
  const [osmVp, setOsmVp] = React.useState<OsmViewportData | null>(null);
  const [terrainAnalysisOpen, setTerrainAnalysisOpen] = React.useState(false);
  const [terrainAnalysisToken, setTerrainAnalysisToken] = React.useState(0);
  const [terrainSourceField, setTerrainSourceField] = React.useState("fclass");
  const [terrainPolygon, setTerrainPolygon] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [freehand, setFreehand] = React.useState(false);
  const [autoPoly, setAutoPoly] = React.useState(false);
  const [autoVessel, setAutoVessel] = React.useState(false);
  const [autoSegment, setAutoSegment] = React.useState(false);
  const [simplifying, setSimplifying] = React.useState(false);
  const [smoothing, setSmoothing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [reclassifying, setReclassifying] = React.useState(false);
  const [importingDem, setImportingDem] = React.useState(false);
  const [demStatus, setDemStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "fetching" }
    | { kind: "ok"; file: string; tiles: number; zoom: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dirty, setDirty] = React.useState(false);
  const [loadId, setLoadId] = React.useState(0);
  const [discardId, setDiscardId] = React.useState(0);

  const dbsRef = React.useRef<Map<string, Database>>(new Map());
  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);
  // OSM layer files with deferred deletions (applied at save time).
  const deletedPksByFileRef = React.useRef<
    Map<string, Set<number | string>>
  >(new Map());
  // Source files whose in-memory DB has been mutated and needs PUT on save.
  const dirtySourceFilesRef = React.useRef<Set<string>>(new Set());


  // The file designated for editing (independent of visibility selection).
  const [editingFileKey, setEditingFileKey] = React.useState<string | null>(
    null
  );

  // The active file is the one with the edit button toggled on.
  const activeFile =
    editingFileKey && selectedFiles.includes(editingFileKey)
      ? editingFileKey
      : null;
  const canEdit = activeFile != null;

  // Resolve category + filename from a composite key like "polygons/my.gpkg"
  const parseFileKey = React.useCallback(
    (key: string): { category: FileCategory; filename: string } | null => {
      const idx = key.indexOf("/");
      if (idx < 0) return null;
      return {
        category: key.slice(0, idx) as FileCategory,
        filename: key.slice(idx + 1),
      };
    },
    []
  );

  // ------------------------------------------------------------------
  // Bootstrap the 3 osm_edits files into dbsRef/layerData on mount.
  // Fetches from disk; creates empty GPKGs if they don't exist yet.
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      if (cancelled) return;

      const results: { key: string; db: Database; data: GeoJSONFeatureCollection; meta: GpkgMeta }[] = [];

      await Promise.all(
        EDIT_KINDS.map(async (kind) => {
          const key = EDIT_FILE_KEYS[kind];
          const fileName = EDIT_FILES[kind];
          let db: Database;
          try {
            const buf = await ensureProjectFileRaw(queryClient, projectId, "osm_edits", fileName);
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            db = new SQL.Database();
            initializeGpkgSchema(db, {
              tableName: fileName.replace(/\.gpkg$/i, ""),
              geometryType: EDIT_GEOMETRY_TYPE[kind],
            });
          }
          const { geojson, meta } = gpkgToGeoJSON(db);
          results.push({ key, db, data: geojson, meta });
        })
      );

      if (cancelled) {
        for (const { db } of results) db.close();
        return;
      }

      for (const { key, db } of results) {
        dbsRef.current.get(key)?.close();
        dbsRef.current.set(key, db);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const { key, data, meta } of results) {
          next.set(key, { data, meta });
        }
        return next;
      });
      // Auto-select edit files that have features
      const nonEmpty = results
        .filter((r) => r.data.features.length > 0)
        .map((r) => r.key);
      if (nonEmpty.length > 0) {
        setSelectedFiles((prev) => {
          const toAdd = nonEmpty.filter((k) => !prev.includes(k));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
      setLoadId((n) => n + 1);
    })().catch((e) => {
      if (!cancelled) setError(`Failed to initialize edit files: ${String(e)}`);
    });

    return () => { cancelled = true; };
  }, [projectId, queryClient]);

  // ------------------------------------------------------------------
  // Load/unload GPKG files as selection changes
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const currentKeys = new Set(layerData.keys());
    const toRemove = [...currentKeys].filter(
      (f) => !selectedFiles.includes(f) && !ALL_EDIT_FILE_KEYS.has(f)
    );
    const toAdd = selectedFiles.filter((f) => !currentKeys.has(f));

    if (toRemove.length > 0) {
      for (const f of toRemove) {
        dbsRef.current.get(f)?.close();
        dbsRef.current.delete(f);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const f of toRemove) next.delete(f);
        return next;
      });
      setHiddenFiles((prev) => {
        if (toRemove.every((f) => !prev.has(f))) return prev;
        const next = new Set(prev);
        for (const f of toRemove) next.delete(f);
        return next;
      });
      setHiddenFclasses((prev) => {
        const removedPrefixes = toRemove.map((f) => `${f}::`);
        let changed = false;
        const next = new Set(prev);
        for (const key of prev) {
          if (removedPrefixes.some((p) => key.startsWith(p))) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // Skip files already loaded (includes edit files bootstrapped above)
    // and any non-gpkg artifact (e.g. fold .tif inventory) — those are
    // listed for visibility but not loadable as vector layers, and
    // letting them through would feed garbage to sql.js and reject the
    // whole batch.
    const reallyToAdd = toAdd.filter(
      (f) => !currentKeys.has(f) && /\.gpkg$/i.test(f),
    );
    if (reallyToAdd.length === 0) {
      if (toRemove.length > 0) setLoadId((n) => n + 1);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      if (cancelled) return;

      // ``allSettled`` so one bad file (404, corrupt gpkg, server hiccup)
      // can't blank every other layer — fulfilled loads still apply.
      const settled = await Promise.allSettled(
        reallyToAdd.map(async (key) => {
          const parsed = parseFileKey(key);
          if (!parsed) throw new Error(`Bad key: ${key}`);
          // For osm_edits files, create empty GPKG on 404
          const kind = EDIT_KINDS.find((k) => EDIT_FILE_KEYS[k] === key);
          let db: Database;
          try {
            const buf = await ensureProjectFileRaw(
              queryClient,
              projectId,
              parsed.category,
              parsed.filename,
            );
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            if (kind) {
              db = new SQL.Database();
              initializeGpkgSchema(db, {
                tableName: parsed.filename.replace(/\.gpkg$/i, ""),
                geometryType: EDIT_GEOMETRY_TYPE[kind],
              });
            } else {
              throw new Error(`Failed to load ${key}`);
            }
          }
          const { geojson, meta } = gpkgToGeoJSON(db);
          return { key, db, data: geojson, meta };
        })
      );

      if (cancelled) {
        for (const r of settled) {
          if (r.status === "fulfilled") r.value.db.close();
        }
        return;
      }

      const fulfilled = settled.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      const failures = settled
        .map((r, i) => (r.status === "rejected" ? { key: reallyToAdd[i], reason: r.reason } : null))
        .filter((x): x is { key: string; reason: unknown } => x !== null);

      for (const { key, db } of fulfilled) {
        dbsRef.current.set(key, db);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const { key, data, meta } of fulfilled) {
          next.set(key, { data, meta });
        }
        return next;
      });
      setLoading(false);
      if (failures.length > 0) {
        // Surface the first failure as an inline error but don't block
        // the layers that did load.
        setError(`Failed to load ${failures.length} file(s): ${String(failures[0].reason)}`);
      }
      setLoadId((n) => n + 1);
    })().catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles, projectId]);

  // Keep active-file refs in sync
  React.useEffect(() => {
    if (activeFile) {
      dbRef.current = dbsRef.current.get(activeFile) ?? null;
      metaRef.current = layerData.get(activeFile)?.meta ?? null;
    } else {
      dbRef.current = null;
      metaRef.current = null;
      setEditing(false);
      setAdding(false);
      setFreehand(false);
      setAutoPoly(false);
      setAutoVessel(false);
      setAutoSegment(false);
      setSimplifying(false);
      setSmoothing(false);
      setDeleting(false);
    }
  }, [activeFile, layerData]);

  // Clean up on unmount
  React.useEffect(() => {
    const dbs = dbsRef.current;
    return () => {
      for (const db of dbs.values()) db.close();
      dbs.clear();
    };
  }, []);

  // ------------------------------------------------------------------
  // File selection
  // ------------------------------------------------------------------

  const toggleFileSelected = React.useCallback(
    (key: string) => {
      setSelectedFiles((prev) => {
        const removing = prev.includes(key);
        if (removing) {
          // If unchecking the file that is currently designated for editing,
          // clear the edit target.
          setEditingFileKey((cur) => (cur === key ? null : cur));
          return prev.filter((f) => f !== key);
        }
        return [...prev, key];
      });
      setDirty(false);
    },
    []
  );

  const editModesActive =
    editing || adding || freehand || autoPoly || autoVessel || autoSegment ||
    simplifying || smoothing || deleting || reclassifying;

  const toggleEditTarget = React.useCallback(
    (key: string) => {
      // Don't switch edit target while an edit mode is active.
      if (editModesActive) return;
      setEditingFileKey((cur) => (cur === key ? null : key));
    },
    [editModesActive]
  );

  // ------------------------------------------------------------------
  // Create new GPKG file
  // ------------------------------------------------------------------

  const [createDialog, setCreateDialog] = React.useState<{
    open: boolean;
    category: FileCategory;
    name: string;
    geomType: GpkgInitGeomType;
    pickGeom: boolean;
    saving: boolean;
  }>({
    open: false,
    category: "polygons",
    name: "",
    geomType: "POLYGON",
    pickGeom: false,
    saving: false,
  });

  const openCreateDialog = React.useCallback((category: FileCategory) => {
    const geomType = CATEGORY_GEOM_TYPE[category] ?? "POLYGON";
    setCreateDialog({
      open: true,
      category,
      name: "",
      geomType,
      pickGeom: false,
      saving: false,
    });
  }, []);

  const openUserLayerDialog = React.useCallback(() => {
    setCreateDialog({
      open: true,
      category: "gis_layers",
      name: "",
      geomType: "POLYGON",
      pickGeom: true,
      saving: false,
    });
  }, []);

  const closeCreateDialog = React.useCallback(() => {
    setCreateDialog((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCreateFile = React.useCallback(async () => {
    if (!projectId || !createDialog.name.trim()) return;
    const { category, name, geomType, pickGeom } = createDialog;

    setCreateDialog((prev) => ({ ...prev, saving: true }));

    try {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      const db = new SQL.Database();
      const slug = name.trim().replace(/\s+/g, "_").toLowerCase();
      const tableName = pickGeom ? `user_${slug}` : slug;
      initializeGpkgSchema(db, { tableName, geometryType: geomType });
      if (pickGeom) {
        ensureGpkgColumns(db, tableName, new Map([["fclass", "TEXT"]]));
      }
      const bytes = exportDatabase(db);
      const filename = `${tableName}.gpkg`;

      await saveProjectFileRaw(
        projectId,
        category,
        filename,
        bytes.buffer as ArrayBuffer
      );
      db.close();

      // Refresh the file list, then auto-select and edit the new file
      await queryClient.invalidateQueries({
        queryKey: projectFileKeys.project(projectId),
      });

      const fileKey = `${category}/${filename}`;
      setSelectedFiles((prev) =>
        prev.includes(fileKey) ? prev : [...prev, fileKey]
      );
      setEditingFileKey(fileKey);
      setCreateDialog({
        open: false,
        category: "polygons",
        name: "",
        geomType: "POLYGON",
        pickGeom: false,
        saving: false,
      });
    } catch (e) {
      setError(`Failed to create file: ${String(e)}`);
      setCreateDialog((prev) => ({ ...prev, saving: false }));
    }
  }, [projectId, createDialog, queryClient]);

  const toggleLayerVisibility = React.useCallback((file: string) => {
    setHiddenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  const toggleFclassVisibility = React.useCallback(
    (file: string, fclass: string) => {
      const key = `${file}::${fclass}`;
      setHiddenFclasses((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const uniqueFclasses = React.useCallback(
    (fc: GeoJSONFeatureCollection | undefined): string[] => {
      if (!fc) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const f of fc.features) {
        const raw = f.properties?.fclass;
        if (raw == null) continue;
        const v = String(raw);
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      out.sort((a, b) => a.localeCompare(b));
      return out;
    },
    []
  );

  // ------------------------------------------------------------------
  // Combined GeoJSON for viewport
  // ------------------------------------------------------------------

  const combinedData =
    React.useMemo<GeoJSONFeatureCollection | null>(() => {
      const features: GeoJSONFeatureCollection["features"] = [];
      for (const key of selectedFiles) {
        const entry = layerData.get(key);
        if (!entry) continue;
        for (const f of entry.data.features) {
          features.push({
            ...f,
            properties: { ...f.properties, __layer: key },
          });
        }
      }
      if (features.length === 0) return null;
      return { type: "FeatureCollection", features };
    }, [selectedFiles, layerData]);

  const layers = React.useMemo<LayerStyle[]>(() => {
    const buildFclasses = (file: string, values: string[]) =>
      values.map((value) => ({
        value,
        color: fclassColorFor(value),
        visible: !hiddenFclasses.has(`${file}::${value}`),
      }));

    // Map category prefix to legend group label
    const GROUP_LABELS: Record<string, string> = {
      polygons: "Polygons",
      poi: "Points Of Interest",
      gis_layers: "Terrain models",
      osm_edits: "Terrain models",
    };

    // Strip "category/" prefix and ".gpkg"/".tif" extension for display
    const cleanName = (key: string): string => {
      const slash = key.indexOf("/");
      const filename = slash >= 0 ? key.slice(slash + 1) : key;
      return filename.replace(/\.(gpkg|tif)$/i, "");
    };

    // Sort: polygons first, poi, layers, osm_edits last (within OSM group)
    const ORDER: Record<string, number> = {
      polygons: 0, poi: 1, gis_layers: 2, osm_edits: 3,
    };

    return [...selectedFiles]
      .sort((a, b) => {
        const catA = a.split("/")[0];
        const catB = b.split("/")[0];
        return (ORDER[catA] ?? 99) - (ORDER[catB] ?? 99);
      })
      .map((key) => {
        const entry = layerData.get(key);
        const values = uniqueFclasses(entry?.data);
        const cat = key.split("/")[0];
        return {
          id: key,
          displayName: cleanName(key),
          group: GROUP_LABELS[cat],
          color: colorFor(key),
          visible: !hiddenFiles.has(key),
          fclasses: buildFclasses(key, values),
        };
      });
  }, [
    selectedFiles,
    layerData,
    hiddenFiles,
    hiddenFclasses,
    uniqueFclasses,
  ]);

  // ------------------------------------------------------------------
  // OSM panel viewport override: show only polygon + margin rectangle
  // ------------------------------------------------------------------

  const [osmPolyGeoJson, setOsmPolyGeoJson] = React.useState<GeoJSON.FeatureCollection | null>(null);
  const [osmDatasetExtent, setOsmDatasetExtent] = React.useState<GeoJSON.FeatureCollection | null>(null);
  const osmPolyKeyRef = React.useRef("");

  React.useEffect(() => {
    if (!osmPanelOpen || !projectId || !osmVp?.polygonName) {
      setOsmPolyGeoJson(null);
      setOsmDatasetExtent(null);
      osmPolyKeyRef.current = "";
      return;
    }
    const key = `${projectId}/${osmVp.polygonName}`;
    if (key === osmPolyKeyRef.current) return;
    osmPolyKeyRef.current = key;

    let cancelled = false;
    fetchFileGeoJson(projectId, "polygons", `${osmVp.polygonName}.gpkg`)
      .then((data) => { if (!cancelled) setOsmPolyGeoJson(data); })
      .catch(() => { if (!cancelled) setOsmPolyGeoJson(null); });
    // Also try to load the existing dataset extent (may not exist yet)
    fetchFileGeoJson(projectId, "polygons", "osm_dataset_extent.gpkg")
      .then((data) => { if (!cancelled) setOsmDatasetExtent(data); })
      .catch(() => { if (!cancelled) setOsmDatasetExtent(null); });
    return () => { cancelled = true; };
  }, [osmPanelOpen, projectId, osmVp?.polygonName]);

  const osmOverrideData = React.useMemo<GeoJSONFeatureCollection | null>(() => {
    if (!osmPanelOpen || !osmPolyGeoJson || !osmVp) return null;
    const features: GeoJSONFeatureCollection["features"] = [];

    // Add reference polygon features
    for (const f of osmPolyGeoJson.features) {
      features.push({
        type: "Feature",
        geometry: f.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
        properties: { ...f.properties, __layer: "__osm_polygon" },
      });
    }

    // Add margin rectangle (clipping boundaries)
    const rect = computeMarginRect(osmPolyGeoJson.features, osmVp.margins, osmVp.azimuth);
    if (rect) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [rect] },
        properties: { __layer: "__osm_clipping" },
      });
    }

    // Add dataset extent (if previously downloaded)
    if (osmDatasetExtent) {
      for (const f of osmDatasetExtent.features) {
        features.push({
          type: "Feature",
          geometry: f.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
          properties: { ...f.properties, __layer: "__osm_dataset" },
        });
      }
    }

    return features.length > 0 ? { type: "FeatureCollection", features } : null;
  }, [osmPanelOpen, osmPolyGeoJson, osmVp, osmDatasetExtent]);

  const osmOverrideLayers = React.useMemo<LayerStyle[]>(() => {
    if (!osmOverrideData) return [];
    const result: LayerStyle[] = [
      { id: "__osm_polygon", color: "#f97316", visible: true, fclasses: [] },
      { id: "__osm_clipping", color: "#64c8ff", visible: true, fclasses: [] },
    ];
    if (osmDatasetExtent) {
      result.push({ id: "__osm_dataset", color: "#a855f7", visible: true, fclasses: [] });
    }
    return result;
  }, [osmOverrideData, osmDatasetExtent]);

  // ------------------------------------------------------------------
  // Insert into an osm_edits file (via dbsRef/layerData)
  // ------------------------------------------------------------------

  const insertIntoOsmEditsFile = React.useCallback(
    (kind: EditKind, feature: GeoJSON.Feature): number | null => {
      const key = EDIT_FILE_KEYS[kind];
      const db = dbsRef.current.get(key);
      const entry = layerData.get(key);
      if (!db || !entry) {
        console.error(`[GIS] insertIntoOsmEditsFile: DB or entry missing for "${key}" (kind=${kind}, db=${!!db}, entry=${!!entry})`);
        return null;
      }
      const pks = insertGpkgFeatures(
        db,
        entry.meta,
        [
          {
            type: "Feature",
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: { ...(feature.properties ?? {}) },
          },
        ]
      );
      const newPk = pks[0];
      if (newPk == null) return null;
      const stored = {
        type: "Feature" as const,
        geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
        properties: {
          ...(feature.properties ?? {}),
          [entry.meta.pkCol]: newPk,
        },
      };
      setLayerData((prev) => {
        const next = new Map(prev);
        const cur = next.get(key);
        if (!cur) return prev;
        next.set(key, {
          ...cur,
          data: {
            ...cur.data,
            features: [...cur.data.features, stored],
          },
        });
        return next;
      });
      dirtySourceFilesRef.current.add(key);
      // Auto-select the edit file so it appears on the map
      setSelectedFiles((prev) =>
        prev.includes(key) ? prev : [...prev, key]
      );
      return newPk;
    },
    [layerData]
  );

  // ------------------------------------------------------------------
  // Editing callbacks
  // ------------------------------------------------------------------

  const handleEdited = React.useCallback(
    (features: GeoJSON.Feature[]) => {
      // Separate features by origin: inline-edit source vs OSM source.
      const inlineByFile = new Map<string, GeoJSON.Feature[]>();
      const osmFeatures: GeoJSON.Feature[] = [];

      for (const edited of features) {
        const sourceFile =
          (edited.properties?.__layer as string | undefined) ?? null;
        if (sourceFile && isInlineEditKey(sourceFile)) {
          const list = inlineByFile.get(sourceFile) ?? [];
          list.push(edited);
          inlineByFile.set(sourceFile, list);
        } else {
          osmFeatures.push(edited);
        }
      }

      // --- Inline-edit features (polygons/poi/osm_edits): update source DB directly ---
      for (const [file, edits] of inlineByFile) {
        const db = dbsRef.current.get(file);
        const srcEntry = layerData.get(file);
        if (!db || !srcEntry) continue;
        const meta = srcEntry.meta;

        const updateBatch: GeoJSON.Feature[] = [];
        for (const edited of edits) {
          const pk = edited.properties?.[meta.pkCol];
          if (pk == null) continue;
          const srcFeature = srcEntry.data.features.find(
            (f) => f.properties[meta.pkCol] === pk
          );
          const mergedProps: Record<string, unknown> = {
            ...(srcFeature?.properties ?? {}),
            ...(edited.properties ?? {}),
            [meta.pkCol]: pk,
          };
          delete mergedProps.__dirty;
          delete mergedProps.__layer;
          updateBatch.push({
            type: "Feature",
            geometry: edited.geometry,
            properties: mergedProps,
          });
        }
        if (updateBatch.length > 0) {
          updateGpkgFeatures(
            db,
            meta,
            updateBatch as unknown as GeoJSONFeatureCollection["features"]
          );
          dirtySourceFilesRef.current.add(file);
          const updatedPks = new Set(
            updateBatch.map((f) => f.properties![meta.pkCol])
          );
          setLayerData((prev) => {
            const entry = prev.get(file);
            if (!entry) return prev;
            const updated = entry.data.features.map((f) => {
              const fPk = f.properties[meta.pkCol];
              if (!updatedPks.has(fPk)) return f;
              const batch = updateBatch.find(
                (b) => b.properties![meta.pkCol] === fPk
              );
              if (!batch) return f;
              return {
                ...f,
                geometry: batch.geometry as typeof f.geometry,
                properties: { ...batch.properties! },
              };
            });
            const next = new Map(prev);
            next.set(file, {
              ...entry,
              data: { ...entry.data, features: updated },
            });
            return next;
          });
        }
      }

      // --- OSM Layers features: move to osm_edits file ---
      if (osmFeatures.length > 0) {
        const file = activeFile;
        const meta = metaRef.current;
        if (!file || !meta) return;

        const srcEntry = layerData.get(file);
        if (!srcEntry) return;

        const movedPks: (number | string)[] = [];
        const insertsByKind = new Map<EditKind, GeoJSON.Feature[]>();

        for (const edited of osmFeatures) {
          const pk = edited.properties?.[meta.pkCol];
          if (pk == null) continue;
          const srcFeature = srcEntry.data.features.find(
            (f) => f.properties[meta.pkCol] === pk
          );
          const mergedProps: Record<string, unknown> = {
            ...(srcFeature?.properties ?? {}),
            ...(edited.properties ?? {}),
          };
          delete mergedProps[meta.pkCol];
          delete mergedProps.__dirty;
          delete mergedProps.__layer;

          const merged: GeoJSON.Feature = {
            type: "Feature",
            geometry: edited.geometry,
            properties: mergedProps,
          };
          const kind = editKindForGeometry(edited.geometry);
          if (!kind) continue;
          const list = insertsByKind.get(kind) ?? [];
          list.push(merged);
          insertsByKind.set(kind, list);
          movedPks.push(pk as number | string);
        }

        for (const [kind, list] of insertsByKind) {
          for (const f of list) insertIntoOsmEditsFile(kind, f);
        }

        if (movedPks.length > 0) {
          const movedSet = new Set(movedPks);
          setLayerData((prev) => {
            const entry = prev.get(file);
            if (!entry) return prev;
            const filtered = entry.data.features.filter(
              (f) =>
                !movedSet.has(
                  f.properties[meta.pkCol] as number | string
                )
            );
            if (filtered.length === entry.data.features.length) return prev;
            const next = new Map(prev);
            next.set(file, {
              ...entry,
              data: { ...entry.data, features: filtered },
            });
            return next;
          });
          let set = deletedPksByFileRef.current.get(file);
          if (!set) {
            set = new Set();
            deletedPksByFileRef.current.set(file, set);
          }
          for (const pk of movedPks) set.add(pk);
        }
      }

      setDirty(true);
    },
    [activeFile, layerData, insertIntoOsmEditsFile]
  );

  const handleAdded = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const cleanProps: Record<string, unknown> = {
        ...(feature.properties ?? {}),
      };
      delete cleanProps.__dirty;
      delete cleanProps.__layer;

      const file = activeFile;
      const inline = file && isInlineEditKey(file);

      if (inline) {
        // Polygons/POI/osm_edits: insert directly into source DB
        const db = dbsRef.current.get(file);
        const entry = layerData.get(file);
        if (!db || !entry) {
          setAdding(false);
          setFreehand(false);
          return;
        }
        const pks = insertGpkgFeatures(db, entry.meta, [
          {
            type: "Feature",
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: cleanProps,
          },
        ]);
        const newPk = pks[0];
        if (newPk != null) {
          const stored = {
            type: "Feature" as const,
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: { ...cleanProps, [entry.meta.pkCol]: newPk },
          };
          setLayerData((prev) => {
            const cur = prev.get(file);
            if (!cur) return prev;
            const next = new Map(prev);
            next.set(file, {
              ...cur,
              data: { ...cur.data, features: [...cur.data.features, stored] },
            });
            return next;
          });
          dirtySourceFilesRef.current.add(file);
        }
      } else {
        // OSM Layers: insert into osm_edits file
        const kind = editKindForGeometry(feature.geometry);
        if (!kind) {
          setAdding(false);
          setFreehand(false);
          return;
        }
        insertIntoOsmEditsFile(kind, {
          type: "Feature",
          geometry: feature.geometry,
          properties: cleanProps,
        });
      }

      setDirty(true);
      setAdding(false);
      setFreehand(false);
    },
    [activeFile, layerData, insertIntoOsmEditsFile]
  );

  const handleReclassify = React.useCallback(
    (feature: GeoJSON.Feature, newFclass: string) => {
      const sourceFile = (feature.properties?.__layer as string | undefined) ??
        null;
      if (!sourceFile) return;

      const buildProps = (
        src: Record<string, unknown>,
        stripPk: string | null
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...src };
        delete out.__dirty;
        delete out.__layer;
        if (stripPk) delete out[stripPk];
        out.fclass = newFclass || null;
        return out;
      };

      if (isInlineEditKey(sourceFile)) {
        // Polygons/POI/osm_edits: update fclass in source DB directly
        const db = dbsRef.current.get(sourceFile);
        const srcEntry = layerData.get(sourceFile);
        if (!db || !srcEntry) return;
        const srcMeta = srcEntry.meta;
        const pk = feature.properties?.[srcMeta.pkCol] as
          | number | string | undefined;
        if (pk == null) return;

        const columnType = new Map<string, string>([["fclass", "TEXT"]]);
        ensureGpkgColumns(db, srcMeta.tableName, columnType);
        db.run(
          `UPDATE "${srcMeta.tableName}" SET "fclass" = ? WHERE "${srcMeta.pkCol}" = ?`,
          [newFclass || null, pk as number | string]
        );
        dirtySourceFilesRef.current.add(sourceFile);
        setLayerData((prev) => {
          const entry = prev.get(sourceFile);
          if (!entry) return prev;
          const updated = entry.data.features.map((f) => {
            if (f.properties[srcMeta.pkCol] !== pk) return f;
            return {
              ...f,
              properties: { ...f.properties, fclass: newFclass || null },
            };
          });
          const next = new Map(prev);
          next.set(sourceFile, {
            ...entry,
            data: { ...entry.data, features: updated },
          });
          return next;
        });
      } else {
        // OSM Layers: transfer to osm_edits file
        const srcEntry = layerData.get(sourceFile);
        if (!srcEntry) return;
        const srcMeta = srcEntry.meta;
        const pk = feature.properties?.[srcMeta.pkCol] as
          | number | string | undefined;
        if (pk == null) return;
        const srcFeature = srcEntry.data.features.find(
          (f) => f.properties[srcMeta.pkCol] === pk
        );
        if (!srcFeature?.geometry) return;

        const kind = editKindForGeometry(srcFeature.geometry);
        if (!kind) return;

        const merged: GeoJSON.Feature = {
          type: "Feature",
          geometry: srcFeature.geometry as GeoJSON.Geometry,
          properties: buildProps(srcFeature.properties, srcMeta.pkCol),
        };
        insertIntoOsmEditsFile(kind, merged);

        setLayerData((prev) => {
          const entry = prev.get(sourceFile);
          if (!entry) return prev;
          const filtered = entry.data.features.filter(
            (f) => f.properties[srcMeta.pkCol] !== pk
          );
          if (filtered.length === entry.data.features.length) return prev;
          const next = new Map(prev);
          next.set(sourceFile, {
            ...entry,
            data: { ...entry.data, features: filtered },
          });
          return next;
        });
        let set = deletedPksByFileRef.current.get(sourceFile);
        if (!set) {
          set = new Set();
          deletedPksByFileRef.current.set(sourceFile, set);
        }
        set.add(pk);
      }
      setDirty(true);
    },
    [layerData, insertIntoOsmEditsFile]
  );

  const handleDeleted = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const sourceLayer = (feature.properties?.__layer as string) ?? null;

      if (sourceLayer && isInlineEditKey(sourceLayer)) {
        // Polygons/POI/osm_edits: delete from source DB directly
        const db = dbsRef.current.get(sourceLayer);
        const entry = layerData.get(sourceLayer);
        if (!db || !entry) return;
        const pk = feature.properties?.[entry.meta.pkCol] as
          | number | string | undefined;
        if (pk != null) {
          deleteGpkgFeatures(db, entry.meta, [pk]);
          dirtySourceFilesRef.current.add(sourceLayer);
        }
        setLayerData((prev) => {
          const cur = prev.get(sourceLayer);
          if (!cur) return prev;
          const filtered = cur.data.features.filter((f) => {
            if (pk == null) return f !== feature;
            return f.properties[entry.meta.pkCol] !== pk;
          });
          if (filtered.length === cur.data.features.length) return prev;
          const next = new Map(prev);
          next.set(sourceLayer, {
            ...cur,
            data: { ...cur.data, features: filtered },
          });
          return next;
        });
        setDirty(true);
        return;
      }

      // OSM layers: defer deletion to save time
      const file = activeFile;
      const meta = metaRef.current;
      if (!file || !meta) return;
      const pk = feature.properties?.[meta.pkCol] as
        | number | string | undefined;
      setLayerData((prev) => {
        const entry = prev.get(file);
        if (!entry) return prev;
        const filtered = entry.data.features.filter((f) => {
          if (pk == null) return f !== feature;
          return f.properties[meta.pkCol] !== pk;
        });
        if (filtered.length === entry.data.features.length) return prev;
        const next = new Map(prev);
        next.set(file, {
          ...entry,
          data: { ...entry.data, features: filtered },
        });
        return next;
      });
      if (pk != null) {
        let set = deletedPksByFileRef.current.get(file);
        if (!set) {
          set = new Set();
          deletedPksByFileRef.current.set(file, set);
        }
        set.add(pk);
      }
      setDirty(true);
    },
    [activeFile, layerData]
  );

  // ------------------------------------------------------------------
  // Toggle callbacks
  // ------------------------------------------------------------------

  const handleToggleEdit = React.useCallback(() => {
    if (!canEdit) return;
    setEditing((e) => !e);
  }, [canEdit]);

  const handleToggleAdd = React.useCallback(() => {
    if (!canEdit) return;
    setAdding((a) => !a);
  }, [canEdit]);

  const handleToggleFreehand = React.useCallback(() => {
    if (!canEdit) return;
    setFreehand((f) => !f);
  }, [canEdit]);

  const handleToggleAutoPoly = React.useCallback(() => {
    if (!canEdit) return;
    setAutoPoly((v) => !v);
  }, [canEdit]);

  const handleToggleAutoVessel = React.useCallback(() => {
    if (!canEdit) return;
    setAutoVessel((v) => !v);
  }, [canEdit]);

  const handleToggleAutoSegment = React.useCallback(() => {
    if (!canEdit) return;
    setAutoSegment((v) => !v);
  }, [canEdit]);

  const handleToggleSimplify = React.useCallback(() => {
    if (!canEdit) return;
    setSimplifying((s) => !s);
  }, [canEdit]);

  const handleToggleSmooth = React.useCallback(() => {
    if (!canEdit) return;
    setSmoothing((s) => !s);
  }, [canEdit]);

  const handleToggleDelete = React.useCallback(() => {
    if (!canEdit) return;
    setDeleting((d) => !d);
  }, [canEdit]);

  const handleToggleReclassify = React.useCallback(() => {
    setReclassifying((r) => !r);
  }, []);

  const handleToggleImportDem = React.useCallback(() => {
    setImportingDem((v) => {
      if (v) setDemStatus({ kind: "idle" });
      return !v;
    });
  }, []);

  const handleToggleTerrain = React.useCallback(() => {
    setTerrainOn((v) => !v);
  }, []);

  // ------------------------------------------------------------------
  // DEM confirm download (uses demo's Next.js endpoint for now)
  // ------------------------------------------------------------------

  const demNameSuggestion = React.useMemo(() => {
    const parsed = activeFile ? parseFileKey(activeFile) : null;
    const base = (parsed?.filename ?? "dem").replace(/\.gpkg$/i, "");
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    return `${base}_dem_${stamp}.tif`;
  }, [activeFile, parseFileKey]);

  const handleConfirmDemDownload = React.useCallback(
    async (params: {
      bbox: [number, number, number, number];
      name: string;
      maxZoom: number;
    }) => {
      if (!projectId) return;
      setDemStatus({ kind: "fetching" });
      try {
        const { apiBaseUrl } = getRuntimeConfig();
        const res = await fetch(
          `${apiBaseUrl}/project/${projectId}/files/dem/download`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(params),
          },
        );
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          file: string;
          tiles: number;
          zoom: number;
        };
        setDemStatus({
          kind: "ok",
          file: json.file,
          tiles: json.tiles,
          zoom: json.zoom,
        });
        setImportingDem(false);
        setSelectedDem(json.file);
        queryClient.invalidateQueries({
          queryKey: projectFileKeys.project(projectId),
        });
      } catch (e) {
        setDemStatus({ kind: "error", message: String(e) });
      }
    },
    [projectId, queryClient]
  );

  // ------------------------------------------------------------------
  // Discard
  // ------------------------------------------------------------------

  const handleDiscard = React.useCallback(async () => {
    if (!projectId) return;

    // 1. OSM layers with deferred deletions — re-read from untouched DB
    const osmAffected = new Set<string>(
      deletedPksByFileRef.current.keys()
    );
    if (osmAffected.size > 0) {
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const file of osmAffected) {
          const db = dbsRef.current.get(file);
          if (!db) continue;
          const { geojson, meta } = gpkgToGeoJSON(db);
          next.set(file, { data: geojson, meta });
        }
        return next;
      });
      deletedPksByFileRef.current.clear();
    }

    // 2. Inline-edited source files (polygons/poi/osm_edits) — reload from disk
    const inlineDirty = [...dirtySourceFilesRef.current];
    if (inlineDirty.length > 0) {
      try {
        const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
        for (const key of inlineDirty) {
          const parsed = parseFileKey(key);
          if (!parsed) continue;
          // Close old DB
          dbsRef.current.get(key)?.close();
          // Re-fetch from disk (or bootstrap empty for osm_edits)
          const kind = EDIT_KINDS.find((k) => EDIT_FILE_KEYS[k] === key);
          let db: Database;
          try {
            const buf = await ensureProjectFileRaw(
              queryClient,
              projectId,
              parsed.category,
              parsed.filename,
            );
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            if (kind) {
              db = new SQL.Database();
              initializeGpkgSchema(db, {
                tableName: parsed.filename.replace(/\.gpkg$/i, ""),
                geometryType: EDIT_GEOMETRY_TYPE[kind],
              });
            } else {
              continue;
            }
          }
          dbsRef.current.set(key, db);
          const { geojson, meta } = gpkgToGeoJSON(db);
          setLayerData((prev) => {
            const next = new Map(prev);
            next.set(key, { data: geojson, meta });
            return next;
          });
        }
      } catch (e) {
        setError(`Failed to reload source files: ${String(e)}`);
      }
      dirtySourceFilesRef.current.clear();
    }

    setDirty(false);
    setDiscardId((n) => n + 1);
  }, [projectId, parseFileKey, queryClient]);

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  const handleSave = React.useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Inline-edited source files (polygons/poi/osm_edits) — already
      //    mutated, just export and PUT
      console.log(`[GIS] handleSave: ${dirtySourceFilesRef.current.size} dirty source files:`, [...dirtySourceFilesRef.current]);
      for (const key of dirtySourceFilesRef.current) {
        const db = dbsRef.current.get(key);
        if (!db) continue;
        const bytes = exportDatabase(db);
        const parsed = parseFileKey(key);
        if (!parsed) continue;
        await saveProjectFileRaw(
          projectId,
          parsed.category,
          parsed.filename,
          bytes.buffer as ArrayBuffer
        );
      }

      // 2. OSM layers with pending deletions — apply then PUT
      const osmFiles = [...deletedPksByFileRef.current.keys()];
      for (const key of osmFiles) {
        const pks = deletedPksByFileRef.current.get(key);
        if (!pks || pks.size === 0) continue;
        const db = dbsRef.current.get(key);
        const entry = layerData.get(key);
        if (!db || !entry) continue;
        deleteGpkgFeatures(db, entry.meta, [...pks]);
        const bytes = exportDatabase(db);
        const parsed = parseFileKey(key);
        if (!parsed) continue;
        await saveProjectFileRaw(
          projectId,
          parsed.category,
          parsed.filename,
          bytes.buffer as ArrayBuffer
        );
      }

      dirtySourceFilesRef.current.clear();
      deletedPksByFileRef.current.clear();
      setDirty(false);
      // Refresh sidebar file list so newly created files (e.g. osm_edits) appear
      queryClient.invalidateQueries({ queryKey: projectFileKeys.project(projectId) });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [projectId, layerData, parseFileKey, queryClient]);

  // ------------------------------------------------------------------
  // DEM URL overrides for viewport
  // ------------------------------------------------------------------

  const demFileUrl = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    const { apiBaseUrl } = getRuntimeConfig();
    return `${apiBaseUrl}/project/${projectId}/files/dem/${encodeURIComponent(selectedDem)}/raw`;
  }, [projectId, selectedDem]);

  const demTileUrlTemplate = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    return projectDemTileUrl(projectId, selectedDem);
  }, [projectId, selectedDem]);

  const demManifestUrlValue = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    return projectDemManifestUrl(projectId, selectedDem);
  }, [projectId, selectedDem]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const featureCount = combinedData?.features.length ?? 0;
  const demFiles = fileList?.dem ?? [];
  const osmEditFiles = fileList?.osm_edits ?? [];
  const seismicFiles = fileList?.seismic ?? [];

  // Group seismic files by the grid option they were produced for.
  // Recognised filename shapes (slug = non-alphanumerics → ``_``):
  //   - ``{grid_theoretical|grid_offset|grid_mesh}__{slug}.gpkg`` — gpkg layers
  //   - ``{theoretical_grid|offset_grid}__{slug}.gpkg`` — pre-rename
  //     legacy gpkg names; the writer migrates them on next run but
  //     they remain visible until then.
  //   - ``fold__{slug}__{omin}-{omax}.tif`` — theoretical fold raster
  //   - ``fold_offsets__{slug}__{omin}-{omax}.tif`` — offsets fold raster
  //   - ``fold__{slug}.tif`` / ``fold_offsets__{slug}.tif`` — legacy
  //     unstamped fold (kept readable so older projects don't lose their
  //     listings on first refresh after upgrade).
  // Unmatched slugs (stale/orphan files) fall through under the raw slug
  // so nothing silently vanishes.
  const { data: designOptionsSection } = useProjectSection(
    projectId,
    "design_options",
  );
  const seismicGroups = React.useMemo(() => {
    const slugify = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const options = ((designOptionsSection?.data as {
      options?: { name?: string }[];
    } | undefined)?.options ?? [])
      .map((o) => (typeof o?.name === "string" ? o.name : ""))
      .filter((n) => n.length > 0);
    const slugToName = new Map(options.map((n) => [slugify(n), n]));
    const order = new Map<string, number>(options.map((n, i) => [n, i]));

    const slugFromFile = (f: string): string => {
      const gpkg = /^(grid_theoretical|grid_offset|grid_mesh|theoretical_grid|offset_grid)__(.+)\.gpkg$/.exec(f);
      if (gpkg) return gpkg[2];
      // Fold tifs: longest-stem-first so ``fold_offsets`` is matched
      // before the shorter ``fold`` prefix.
      const foldOff = /^fold_offsets__(.+?)(?:__[\d.+-]+)?\.tif$/.exec(f);
      if (foldOff) return foldOff[1];
      const fold = /^fold__(.+?)(?:__[\d.+-]+)?\.tif$/.exec(f);
      if (fold) return fold[1];
      return "";
    };

    const groups = new Map<string, string[]>();
    for (const f of seismicFiles) {
      const slug = slugFromFile(f);
      const display = (slug && slugToName.get(slug)) || slug || "Unknown";
      const bucket = groups.get(display) ?? [];
      bucket.push(f);
      groups.set(display, bucket);
    }
    return Array.from(groups.entries())
      .map(([name, files]) => ({ name, files: files.sort() }))
      .sort((a, b) => {
        const ai = order.get(a.name);
        const bi = order.get(b.name);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [seismicFiles, designOptionsSection]);

  // ------------------------------------------------------------------
  // Grid-north alignment: compute γ (meridian convergence) at the
  // centroid of the first survey option's acquisition polygon, using
  // the project CRS's proj4 string. Fed into GisGlobeViewport so the
  // user can rotate the map to put grid north up.
  // ------------------------------------------------------------------
  const { data: surveySection } = useProjectSection(projectId, "survey");
  const { data: definitionSection } = useProjectSection(projectId, "definition");

  const firstAcquisitionPolygon = React.useMemo<string | null>(() => {
    const groups = (surveySection?.data as
      | { groups?: { acquisitionPolygon?: string }[] }
      | undefined)?.groups;
    const name = Array.isArray(groups) && groups.length > 0
      ? (groups[0]?.acquisitionPolygon ?? "").trim()
      : "";
    return name || null;
  }, [surveySection]);

  const projectEpsg = React.useMemo<number | null>(() => {
    const raw = (definitionSection?.data as { epsg?: string | number } | undefined)?.epsg;
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [definitionSection]);

  const polygonQuery = useQuery({
    queryKey: ["grid-north-polygon", projectId, firstAcquisitionPolygon],
    queryFn: () => fetchFileGeoJson(projectId!, "polygons", `${firstAcquisitionPolygon}.gpkg`),
    enabled: !!projectId && !!firstAcquisitionPolygon,
    staleTime: 60_000,
  });

  const polygonCentroid = React.useMemo<[number, number] | null>(() => {
    const fc = polygonQuery.data;
    if (!fc || !Array.isArray(fc.features) || fc.features.length === 0) return null;
    let sumLon = 0;
    let sumLat = 0;
    let n = 0;
    const walk = (c: unknown) => {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === "number" && typeof c[1] === "number") {
        sumLon += c[0] as number;
        sumLat += c[1] as number;
        n += 1;
        return;
      }
      for (const sub of c) walk(sub);
    };
    for (const f of fc.features) {
      if (f.geometry) walk((f.geometry as GeoJSON.Geometry & { coordinates: unknown }).coordinates);
    }
    return n > 0 ? [sumLon / n, sumLat / n] : null;
  }, [polygonQuery.data]);

  const crsQuery = useQuery<CrsInfoResponse, Error>({
    queryKey: ["crs-info", projectEpsg],
    queryFn: ({ signal }) => fetchCrsInfo(projectEpsg as number, signal),
    enabled: projectEpsg != null,
    staleTime: Infinity,
  });

  const gridConvergenceDeg = React.useMemo<number | null>(() => {
    const proj = crsQuery.data?.proj4text;
    if (!proj || !polygonCentroid) return null;
    return computeGridConvergence(polygonCentroid[0], polygonCentroid[1], proj);
  }, [crsQuery.data?.proj4text, polygonCentroid]);

  const [alignToGridNorth, setAlignToGridNorth] = React.useState<boolean>(
    () => {
      if (projectId == null) return false;
      return (
        getMapSessionState(`files:${projectId}`)?.alignToGridNorth ?? false
      );
    }
  );
  // Restore on project switch (initial useState only fires on first mount).
  const restoredAlignProjectIdRef = React.useRef<number | null>(projectId);
  React.useEffect(() => {
    if (projectId == null) return;
    if (restoredAlignProjectIdRef.current === projectId) return;
    restoredAlignProjectIdRef.current = projectId;
    setAlignToGridNorth(
      getMapSessionState(`files:${projectId}`)?.alignToGridNorth ?? false,
    );
  }, [projectId]);
  // Persist toggle state for cross-navigation restore.
  React.useEffect(() => {
    if (projectId == null) return;
    updateMapSessionState(`files:${projectId}`, { alignToGridNorth });
  }, [alignToGridNorth, projectId]);
  // Auto-disable when the inputs disappear (project change, survey cleared, etc.)
  React.useEffect(() => {
    if (gridConvergenceDeg == null && alignToGridNorth) setAlignToGridNorth(false);
  }, [gridConvergenceDeg, alignToGridNorth]);

  // ------------------------------------------------------------------
  // Fold overlay — radio-style: at most one fold raster on the globe.
  // The picked range identifies a single rendered triple on disk
  // (.tif + tile pyramid + meta), and useFoldMeta hits the backend
  // ``/meta?omin=&omax=&option=`` endpoint for that exact render.
  // ------------------------------------------------------------------
  const foldRangeKey = React.useMemo(
    () =>
      activeFold
        ? {
            omin: activeFold.omin,
            omax: activeFold.omax,
            option: activeFold.option,
          }
        : undefined,
    [activeFold],
  );
  const { data: activeFoldMeta } = useFoldMeta(
    projectId,
    activeFold?.source ?? "grid",
    foldRangeKey,
    activeFold !== null,
  );
  const foldOverlay = React.useMemo<FoldOverlaySpec | null>(() => {
    if (!activeFold || !activeFoldMeta || projectId == null) return null;
    // The Files page renders the fold as one MapLibre image source
    // per chunk, each anchored at four UTM-projected WGS84 corners.
    // Older meta files (rendered before chunked overlays existed)
    // won't carry ``image_chunks``; the user re-renders to pick them up.
    const chunks = activeFoldMeta.image_chunks;
    if (!chunks || chunks.length === 0) return null;
    // Version embeds everything that affects the served PNGs so the
    // browser cache invalidates exactly when a re-render changes the
    // bytes (same shape the grid + offsets viewports use).
    const version = [
      activeFoldMeta.option_name,
      activeFoldMeta.colormap,
      activeFoldMeta.value_max,
      activeFoldMeta.params.offset_min,
      activeFoldMeta.params.offset_max,
    ].join(":");
    return {
      id: `${activeFold.option}::${activeFold.source}::${activeFold.omin}-${activeFold.omax}`,
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.chunk_id,
        imageUrl: foldRasterChunkUrl(
          projectId,
          chunk.chunk_id,
          version,
          activeFold.source,
          foldRangeKey,
        ),
        corners: chunk.corners_wgs84,
      })),
    };
  }, [activeFold, activeFoldMeta, projectId, foldRangeKey]);
  const foldLegendNode =
    activeFold && activeFoldMeta ? (
      <div className="glb-legend__group">Fold</div>
    ) : null;
  const foldLegendExtra =
    activeFold && activeFoldMeta ? (
      <>
        {foldLegendNode}
        <FoldColormapLegend
          colormap={activeFoldMeta.colormap}
          valueMin={activeFoldMeta.value_min}
          valueMax={activeFoldMeta.value_max}
        />
      </>
    ) : null;

  return (
    <ProjectSettingsPage
      title="Files"
      panelTitle="GIS Files"
      viewport={
        <GisGlobeViewport
          data={osmPanelOpen && osmOverrideData ? osmOverrideData : combinedData}
          layers={osmPanelOpen && osmOverrideLayers.length > 0 ? osmOverrideLayers : layers}
          onToggleLayerVisibility={toggleLayerVisibility}
          onToggleFclassVisibility={toggleFclassVisibility}
          viewStateKey={projectId != null ? `files:${projectId}` : undefined}
          dataKey={osmPanelOpen ? `osm-preview:${osmVp?.polygonName ?? ""}:${osmDatasetExtent ? "has-extent" : "no-extent"}` : `project:${loadId}`}
          discardKey={discardId}
          editing={osmPanelOpen ? false : editing}
          adding={osmPanelOpen ? false : adding}
          freehand={osmPanelOpen ? false : freehand}
          autoPoly={osmPanelOpen ? false : autoPoly}
          autoVessel={osmPanelOpen ? false : autoVessel}
          autoSegment={osmPanelOpen ? false : autoSegment}
          simplifying={osmPanelOpen ? false : simplifying}
          smoothing={osmPanelOpen ? false : smoothing}
          importingDem={osmPanelOpen ? false : importingDem}
          deleting={osmPanelOpen ? false : deleting}
          reclassifying={osmPanelOpen ? false : reclassifying}
          demFile={osmPanelOpen ? "" : selectedDem}
          demOpacity={demOpacity}
          demColorRamp={demColorRamp}
          terrainOn={osmPanelOpen ? false : terrainOn}
          terrainExaggeration={terrainExaggeration}
          dirty={osmPanelOpen ? false : dirty}
          saving={osmPanelOpen ? false : saving}
          canEdit={osmPanelOpen ? false : canEdit}
          geometryType={metaRef.current?.geometryType ?? "GEOMETRY"}
          onToggleEdit={handleToggleEdit}
          onToggleAdd={handleToggleAdd}
          onToggleFreehand={handleToggleFreehand}
          onToggleAutoPoly={handleToggleAutoPoly}
          onToggleAutoVessel={handleToggleAutoVessel}
          onToggleAutoSegment={handleToggleAutoSegment}
          onToggleSimplify={handleToggleSimplify}
          onToggleSmooth={handleToggleSmooth}
          onToggleDelete={handleToggleDelete}
          onToggleReclassify={handleToggleReclassify}
          onToggleImportDem={handleToggleImportDem}
          onToggleTerrain={handleToggleTerrain}
          onSetTerrainExaggeration={setTerrainExaggeration}
          onSetDemOpacity={setDemOpacity}
          onSetDemColorRamp={setDemColorRamp}
          demNameSuggestion={demNameSuggestion}
          onConfirmDemDownload={handleConfirmDemDownload}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onEdited={handleEdited}
          onAdded={handleAdded}
          onDeleted={handleDeleted}
          onReclassify={handleReclassify}
          demFileUrl={demFileUrl}
          demTileUrlTemplate={demTileUrlTemplate}
          demManifestUrl={demManifestUrlValue}
          gridConvergenceDeg={gridConvergenceDeg}
          alignToGridNorth={alignToGridNorth}
          onAlignToGridNorthChange={setAlignToGridNorth}
          foldOverlay={foldOverlay}
          legendExtra={foldLegendExtra}
        />
      }
      middlePanel={osmPanelOpen ? (
        <OsmDownloadPanel
          projectId={projectId}
          onClose={() => { setOsmPanelOpen(false); setOsmVp(null); }}
          onViewportChange={setOsmVp}
          onLayersClipped={() => {
            queryClient.invalidateQueries({ queryKey: projectFileKeys.project(projectId ?? 0) });
            // Refresh dataset extent polygon on viewport
            if (projectId) {
              fetchFileGeoJson(projectId, "polygons", "osm_dataset_extent.gpkg")
                .then(setOsmDatasetExtent)
                .catch(() => {});
            }
          }}
        />
      ) : terrainAnalysisOpen ? (
        <LayerStatsPanel
          projectId={projectId}
          polygonFile={terrainPolygon || null}
          sourceField={terrainSourceField}
          runToken={terrainAnalysisToken}
          onClose={() => setTerrainAnalysisOpen(false)}
        />
      ) : undefined}
    >
      <div className="space-y-[var(--space-4)]">
        {/* Polygons, POI sections */}
        {SIDEBAR_SECTIONS.filter(({ key }) => key !== "gis_layers").map(({ key, label, category }) => {
          const files = fileList?.[key] ?? [];
          const sectionCollapsed = collapsedSections.has(key);
          return (
            <div key={key} className="flex flex-col gap-[var(--space-2)]">
              <CollapsibleSectionHeader
                title={label}
                collapsed={sectionCollapsed}
                onToggle={() => toggleSectionCollapsed(key)}
                actions={
                  <button
                    type="button"
                    title={`Create new ${key === "poi" ? "POI" : "polygon"} file`}
                    onClick={() => openCreateDialog(category)}
                    className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    <Plus size={14} />
                  </button>
                }
              />
              <div
                className={
                  "flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-[var(--space-2)]"
                  + (sectionCollapsed ? " hidden" : "")
                }
              >
                {files.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    No files
                  </p>
                ) : (
                  files.map((f) => {
                    const fileKey = `${category}/${f}`;
                    const checked = selectedFiles.includes(fileKey);
                    const isEditTarget = editingFileKey === fileKey;
                    return (
                      <div
                        key={f}
                        className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFileSelected(fileKey)}
                          className="shrink-0 cursor-pointer"
                        />
                        <span
                          className={`block size-3 shrink-0 rounded-[3px] border border-[var(--color-border-strong)] ${checked ? "opacity-100" : "opacity-35"}`}
                          // eslint-disable-next-line template/no-jsx-style-prop
                          style={{ backgroundColor: colorFor(fileKey) }}
                        />
                        <span className="min-w-0 flex-1 truncate">{f}</span>
                        {checked && (
                          <button
                            type="button"
                            title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                            disabled={!isEditTarget && editModesActive}
                            onClick={() => toggleEditTarget(fileKey)}
                            className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Terrain models section + osm edit files after separator */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <CollapsibleSectionHeader
            title="Terrain models"
            collapsed={collapsedSections.has("terrain-models")}
            onToggle={() => toggleSectionCollapsed("terrain-models")}
            actions={
              <div className="flex items-center gap-[var(--space-1)]">
                <button
                  type="button"
                  title="Create a new user layer file"
                  onClick={openUserLayerDialog}
                  className="flex items-center gap-[var(--space-1)] rounded px-[var(--space-1)] py-0.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  user <Plus size={12} />
                </button>
                <button
                  type="button"
                  title="Download OSM layers"
                  onClick={() => setOsmPanelOpen((v) => !v)}
                  className={`flex items-center gap-[var(--space-1)] rounded px-[var(--space-1)] py-0.5 text-xs ${osmPanelOpen ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}
                >
                  osm <Plus size={12} />
                </button>
              </div>
            }
          />
          <div
            className={
              "flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-[var(--space-2)]"
              + (collapsedSections.has("terrain-models") ? " hidden" : "")
            }
          >
            {(fileList?.gis_layers ?? []).length === 0 && osmEditFiles.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              <>
                {(fileList?.gis_layers ?? []).map((f) => {
                  const fileKey = `gis_layers/${f}`;
                  const checked = selectedFiles.includes(fileKey);
                  const isEditTarget = editingFileKey === fileKey;
                  return (
                    <div
                      key={f}
                      className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFileSelected(fileKey)}
                        className="shrink-0 cursor-pointer"
                      />
                      <span
                        className={`block size-3 shrink-0 rounded-[3px] border border-[var(--color-border-strong)] ${checked ? "opacity-100" : "opacity-35"}`}
                        // eslint-disable-next-line template/no-jsx-style-prop
                        style={{ backgroundColor: colorFor(fileKey) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{f}</span>
                      {checked && (
                        <button
                          type="button"
                          title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                          disabled={!isEditTarget && editModesActive}
                          onClick={() => toggleEditTarget(fileKey)}
                          className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Separator + osm edit files */}
                {osmEditFiles.length > 0 && (fileList?.gis_layers ?? []).length > 0 && (
                  <hr className="my-1 border-[var(--color-border-subtle)]" />
                )}
                {osmEditFiles.map((f) => {
                  const fileKey = `osm_edits/${f}`;
                  const checked = selectedFiles.includes(fileKey);
                  const isEditTarget = editingFileKey === fileKey;
                  return (
                    <div
                      key={f}
                      className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFileSelected(fileKey)}
                        className="shrink-0 cursor-pointer"
                      />
                      <span
                        className={`block size-3 shrink-0 rounded-[3px] border border-[var(--color-border-strong)] ${checked ? "opacity-100" : "opacity-35"}`}
                        // eslint-disable-next-line template/no-jsx-style-prop
                        style={{ backgroundColor: colorFor(fileKey) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{f}</span>
                      {checked && (
                        <button
                          type="button"
                          title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                          disabled={!isEditTarget && editModesActive}
                          onClick={() => toggleEditTarget(fileKey)}
                          className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Terrain Analysis — sits right after Terrain models because
            its inputs (polygons, layer fields) flow naturally from the
            terrain-layer choices above. Form-only, no listing scroll. */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <CollapsibleSectionHeader
            title="Terrain Analysis"
            collapsed={collapsedSections.has("terrain-analysis")}
            onToggle={() => toggleSectionCollapsed("terrain-analysis")}
          />
          <div
            className={
              "flex flex-col gap-[var(--space-2)]"
              + (collapsedSections.has("terrain-analysis") ? " hidden" : "")
            }
          >
            <Field label="Polygon" layout="horizontal">
              <Select
                value={terrainPolygon}
                onChange={(e) => setTerrainPolygon(e.target.value)}
              >
                <option value="">None</option>
                {(fileList?.polygons ?? []).map((f) => {
                  const stem = f.replace(/\.gpkg$/i, "");
                  return (
                    <option key={stem} value={stem}>{stem}</option>
                  );
                })}
              </Select>
            </Field>
            <Field label="Source field" layout="horizontal">
              <Input
                value={terrainSourceField}
                onChange={(e) => setTerrainSourceField(e.target.value)}
                className="font-mono text-xs"
              />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                disabled={!projectId || !terrainPolygon}
                onClick={() => {
                  setTerrainAnalysisOpen(true);
                  setTerrainAnalysisToken(Date.now());
                }}
              >
                <Play size={12} className="mr-[var(--space-1)]" />
                Process
              </Button>
            </div>
          </div>
        </div>

        {/* Seismic section — pipeline-generated .gpkg (read-only).
            Files are grouped by the grid option that produced them so
            multiple options can coexist without ambiguity. Collapsible
            because the listing can grow long with many fold renders.*/}
        <div className="flex flex-col gap-[var(--space-2)]">
          <CollapsibleSectionHeader
            title="Seismic"
            collapsed={collapsedSections.has("seismic")}
            onToggle={() => toggleSectionCollapsed("seismic")}
          />
          <div
            className={
              "flex flex-col gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-[var(--space-2)]"
              + (collapsedSections.has("seismic") ? " hidden" : "")
            }
          >
            {seismicGroups.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              seismicGroups.map((group) => (
                <div key={group.name} className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {group.name}
                  </span>
                  {group.files.map((f) => {
                    const fileKey = `seismic/${f}`;
                    const checked = selectedFiles.includes(fileKey);
                    // Build a compact label — group heading already names
                    // the option, so drop the slug. Fold tifs surface
                    // their source (theoretical/offset) and offset range.
                    const foldOff = /^fold_offsets__.+?(?:__([\d.+-]+))?\.tif$/.exec(f);
                    const fold = /^fold__.+?(?:__([\d.+-]+))?\.tif$/.exec(f);
                    const isFoldTif = !!(foldOff || fold);
                    const foldSource: FoldSource | null = foldOff
                      ? "offsets"
                      : fold
                      ? "grid"
                      : null;
                    const rangeStr = foldOff?.[1] ?? fold?.[1] ?? null;
                    let foldRange: { omin: number; omax: number } | null = null;
                    if (rangeStr) {
                      const parts = rangeStr.split("-").map(Number);
                      if (parts.length === 2 && parts.every(Number.isFinite)) {
                        foldRange = { omin: parts[0], omax: parts[1] };
                      }
                    }
                    let shortLabel: string;
                    if (foldOff) {
                      const range = rangeStr ? ` (${rangeStr}m)` : "";
                      shortLabel = `Fold - offset${range}`;
                    } else if (fold) {
                      const range = rangeStr ? ` (${rangeStr}m)` : "";
                      shortLabel = `Fold - theoretical${range}`;
                    } else {
                      shortLabel = f.replace(/__[^.]+(?=\.gpkg$)/, "");
                    }
                    if (isFoldTif) {
                      // Range-stamped fold tifs become a radio toggle —
                      // single-active across the whole listing, drives
                      // the on-globe overlay. Legacy unstamped tifs (no
                      // ``__omin-omax`` suffix) stay as plain inventory
                      // because their tile pyramid was already wiped
                      // when a newer render landed.
                      // Bind the activatable triple once so the type
                      // narrowing carries into the click handler.
                      const activatable =
                        foldSource !== null && foldRange !== null
                          ? {
                              option: group.name,
                              source: foldSource,
                              omin: foldRange.omin,
                              omax: foldRange.omax,
                            }
                          : null;
                      const isActiveOverlay =
                        activatable !== null
                        && activeFold !== null
                        && activeFold.option === activatable.option
                        && activeFold.source === activatable.source
                        && activeFold.omin === activatable.omin
                        && activeFold.omax === activatable.omax;
                      return (
                        <div
                          key={f}
                          className={
                            "flex min-w-0 items-center gap-2 pl-[var(--space-2)] text-xs leading-tight"
                            + (activatable ? "" : " text-[var(--color-text-muted)]")
                          }
                        >
                          {activatable ? (
                            <input
                              type="radio"
                              name={`fold-overlay-${projectId ?? 0}`}
                              checked={isActiveOverlay}
                              // Click handles the toggle-off case
                              // (radios don't fire onChange when the
                              // already-checked input is clicked).
                              onClick={() => toggleFoldOverlay(activatable)}
                              onChange={() => {}}
                              className="shrink-0 cursor-pointer"
                              aria-label={`Show ${shortLabel} on the map`}
                              title={
                                isActiveOverlay
                                  ? "Click to hide this fold overlay"
                                  : "Click to display this fold overlay"
                              }
                            />
                          ) : (
                            <span className="shrink-0 select-none" aria-hidden>
                              ·
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">{shortLabel}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={f}
                        className="flex min-w-0 items-center gap-2 pl-[var(--space-2)] text-xs leading-tight"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFileSelected(fileKey)}
                          className="shrink-0 cursor-pointer"
                        />
                        <span
                          className={`block size-3 shrink-0 rounded-[3px] border border-[var(--color-border-strong)] ${checked ? "opacity-100" : "opacity-35"}`}
                          // eslint-disable-next-line template/no-jsx-style-prop
                          style={{ backgroundColor: colorFor(fileKey) }}
                        />
                        <span className="min-w-0 flex-1 truncate">{shortLabel}</span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* DEM section */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <CollapsibleSectionHeader
            title="DEM"
            collapsed={collapsedSections.has("dem")}
            onToggle={() => toggleSectionCollapsed("dem")}
          />
          <div
            className={
              "flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] p-[var(--space-2)]"
              + (collapsedSections.has("dem") ? " hidden" : "")
            }
          >
            {demFiles.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              demFiles.map((f) => {
                const checked = selectedDem === f;
                return (
                  <label
                    key={f}
                    className="flex min-w-0 cursor-pointer items-center gap-2 text-xs leading-tight"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedDem((prev) => (prev === f ? "" : f))
                      }
                      className="shrink-0 cursor-pointer"
                    />
                    <span className="min-w-0 truncate">{f}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {loading && (
          <p className="text-xs text-[var(--color-text-muted)]">Loading...</p>
        )}
        {error && (
          <p className="text-xs text-[var(--color-text-danger)]">{error}</p>
        )}
        {combinedData && !loading && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {featureCount} feature{featureCount !== 1 ? "s" : ""} loaded across{" "}
            {selectedFiles.length} layer{selectedFiles.length !== 1 ? "s" : ""}
          </p>
        )}
        {importingDem && demStatus.kind === "idle" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            DEM import: click a feature to fetch its terrain.
          </p>
        )}
        {demStatus.kind === "fetching" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Fetching DEM tiles...
          </p>
        )}
        {demStatus.kind === "ok" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            DEM saved: {demStatus.file} (z{demStatus.zoom},{" "}
            {demStatus.tiles} tile{demStatus.tiles !== 1 ? "s" : ""})
          </p>
        )}
        {demStatus.kind === "error" && (
          <p className="text-xs text-[var(--color-text-danger)]">
            DEM error: {demStatus.message}
          </p>
        )}
      </div>

      {/* Create new file dialog */}
      <Dialog open={createDialog.open} onOpenChange={(open) => !open && closeCreateDialog()}>
        <DialogHeader>
          <DialogTitle>
            {createDialog.pickGeom
              ? "New user layer file"
              : `New ${createDialog.category === "poi" ? "POI" : "Polygon"} file`}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-[var(--space-3)]">
            <Input
              autoFocus
              placeholder="File name"
              value={createDialog.name}
              onChange={(e) =>
                setCreateDialog((prev) => ({ ...prev, name: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && createDialog.name.trim()) handleCreateFile();
              }}
            />
            {createDialog.pickGeom && (
              <Field label="Feature type" htmlFor="user-layer-geom" layout="horizontal">
                <Select
                  id="user-layer-geom"
                  value={createDialog.geomType}
                  onChange={(e) =>
                    setCreateDialog((prev) => ({
                      ...prev,
                      geomType: e.target.value as GpkgInitGeomType,
                    }))
                  }
                >
                  <option value="POINT">Point</option>
                  <option value="LINESTRING">Line</option>
                  <option value="POLYGON">Polygon</option>
                </Select>
              </Field>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeCreateDialog}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!createDialog.name.trim() || createDialog.saving}
            onClick={handleCreateFile}
          >
            {createDialog.saving ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </Dialog>
    </ProjectSettingsPage>
  );
}
