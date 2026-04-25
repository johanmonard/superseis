"use client";

import * as React from "react";
import { ArcLayer, BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";

import type {
  VisibleFile,
  GisLayerStyle,
} from "@/components/features/project/project-gis-viewer";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { GisViewerViewport } from "@/components/features/project/gis-viewer-viewport";
import { FoldColormapLegend } from "@/components/features/project/fold-colormap-legend";
import { appIcons, Icon } from "@/components/ui/icon";
import type { FileCategory } from "@/services/api/project-files";
import { foldTilesUrlTemplate } from "@/services/api/project-fold";
import type { OffsetArtifactResponse } from "@/services/api/project-offset-artifacts";
import { useOffsetStations } from "@/services/query/project-offset-artifacts";
import { useFoldMeta } from "@/services/query/project-fold";

const R_OFFSET_COLOR: [number, number, number, number] = [29, 78, 216, 220]; // blue-700
const R_LEFT_COLOR: [number, number, number, number] = [147, 197, 253, 220]; // blue-300
const S_OFFSET_COLOR: [number, number, number, number] = [185, 28, 28, 220]; // red-700
const S_LEFT_COLOR: [number, number, number, number] = [252, 165, 165, 220]; // red-300
const SKIPPED_COLOR: [number, number, number, number] = [255, 255, 255, 230]; // white

// Single radius for all station categories — dots read as one population
// regardless of whether they moved, stayed, or got skipped.
const DOT_RADIUS = 5;

const REGION_PALETTE = [
  "#64748b", "#0ea5e9", "#a855f7", "#14b8a6",
  "#ef4444", "#f59e0b", "#84cc16", "#ec4899",
];

export interface OffsetsGridViewportProps {
  projectId: number | null;
  regionPolygons: ReadonlyArray<string>;
}

function is404(err: unknown): boolean {
  return err instanceof Error && /404/.test(err.message);
}

type CategoryKey =
  | "r-left"
  | "r-offs"
  | "r-skp"
  | "s-left"
  | "s-offs"
  | "s-skp";

const ALL_CATEGORIES_VISIBLE: Record<CategoryKey, boolean> = {
  "r-left": true,
  "r-offs": true,
  "r-skp": true,
  "s-left": true,
  "s-offs": true,
  "s-skp": true,
};

export function OffsetsGridViewport({
  projectId,
  regionPolygons,
}: OffsetsGridViewportProps) {
  const rQuery = useOffsetStations(projectId, "r");
  const sQuery = useOffsetStations(projectId, "s");
  const foldQuery = useFoldMeta(projectId, "offsets");
  const foldMeta = foldQuery.data ?? null;
  // Tile URL carries a version string so a Process-fold re-run flushes
  // both the browser's HTTP cache and deck.gl's internal tile cache —
  // the backend overwrites tiles at the same paths otherwise.
  const foldTileVersion = foldMeta
    ? `${foldMeta.option_name}:offsets:${foldMeta.colormap}:${foldMeta.value_max}:${foldMeta.params.offset_min}:${foldMeta.params.offset_max}`
    : null;
  const [foldVisible, setFoldVisible] = React.useState(true);

  // Per-category + per-region visibility. Default on; the legend renders a
  // checkbox for each entry so the user can toggle any layer independently.
  const [categoryVisible, setCategoryVisible] = React.useState<
    Record<CategoryKey, boolean>
  >(ALL_CATEGORIES_VISIBLE);
  const [regionVisible, setRegionVisible] = React.useState<Record<string, boolean>>({});
  // When on, offset dots + arcs use (lon_offs_snap, lat_offs_snap) where
  // available and fall back to the pre-snap (lon_offs, lat_offs) for rows
  // that didn't snap. Off: always the raw offset coords.
  const [useSnapped, setUseSnapped] = React.useState(true);

  const toggleCategory = React.useCallback((key: CategoryKey) => {
    setCategoryVisible((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);
  const toggleRegion = React.useCallback((stem: string) => {
    setRegionVisible((prev) => ({ ...prev, [stem]: !(prev[stem] ?? true) }));
  }, []);
  const rPts: OffsetArtifactResponse | null = rQuery.data ?? null;
  const sPts: OffsetArtifactResponse | null = sQuery.data ?? null;
  const anyLoading = rQuery.isLoading || sQuery.isLoading;
  const firstError = rQuery.error ?? sQuery.error ?? null;
  const missing = is404(rQuery.error) || is404(sQuery.error);
  const loadState: "idle" | "loading" | "error" | "missing" = missing
    ? "missing"
    : firstError
      ? "error"
      : anyLoading && !rPts && !sPts
        ? "loading"
        : "idle";
  const errorMsg = !missing && firstError ? firstError.message : null;

  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    const style = (color: string, visible: boolean): GisLayerStyle => ({
      color,
      width: 2,
      opacity: 0.9,
      fillOpacity: 0.12,
      filled: true,
      visible,
    });
    return regionPolygons.map<VisibleFile>((stem, i) => ({
      category: "polygons" as FileCategory,
      filename: `${stem}.gpkg`,
      style: style(
        REGION_PALETTE[i % REGION_PALETTE.length],
        regionVisible[stem] ?? true,
      ),
    }));
  }, [regionPolygons, regionVisible]);

  const extraLayers = React.useMemo(() => {
    const layers: unknown[] = [];

    // Offsets-fold overlay first so station dots and arcs draw on top.
    // Mirrors the design-grid viewport's fold layer, except the tiles
    // come from the ``offsets-fold`` endpoint (raster built from the
    // post-offset stations).
    if (foldMeta && foldTileVersion && projectId !== null) {
      const tileUrl = foldTilesUrlTemplate(projectId, foldTileVersion, "offsets");
      const [west, south, east, north] = foldMeta.bounds;
      layers.push(
        new TileLayer({
          id: `offsets-fold-tiles:${foldTileVersion}`,
          visible: foldVisible,
          data: tileUrl,
          loadOptions: {
            fetch: { credentials: "include" },
          },
          minZoom: foldMeta.min_zoom,
          maxZoom: foldMeta.max_zoom,
          tileSize: 256,
          extent: [west, south, east, north],
          pickable: false,
          renderSubLayers: (props) => {
            const data = props.data as
              | ImageBitmap
              | HTMLImageElement
              | null;
            if (!data) return null;
            const bbox = props.tile.bbox as {
              west: number;
              south: number;
              east: number;
              north: number;
            };
            return new BitmapLayer({
              id: props.id,
              image: data,
              bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
              opacity: 0.65,
              pickable: false,
              // Crisp bin edges at every zoom — fold values are
              // discrete counts, so the default ``linear`` texture
              // filter would smear adjacent bins together when zoomed
              // past the tile pyramid's max zoom (matches the
              // server-side nearest sampler and the Files-page
              // viewport's ``raster-resampling: nearest``).
              textureParameters: {
                minFilter: "nearest",
                magFilter: "nearest",
              },
            });
          },
        }),
      );
    }

    const pushSide = (
      data: OffsetArtifactResponse | null,
      idPrefix: string,
      leftKey: CategoryKey,
      movedKey: CategoryKey,
      skippedKey: CategoryKey,
      leftColor: [number, number, number, number],
      movedColor: [number, number, number, number],
    ) => {
      if (!data || data.points.length === 0) return;

      // Partition points into three mutually-exclusive categories so each
      // gets a distinct visual. `offset=true` wins over `skipped`; an
      // offset point is always the moved variant regardless of the skip
      // flag history.
      const leftInPlace = data.points.filter((p) => !p.offset && !p.skipped);
      const skipped = data.points.filter((p) => !p.offset && p.skipped);
      const moved = data.points.filter((p) => p.offset);

      const leftOn = categoryVisible[leftKey] ?? true;
      const movedOn = categoryVisible[movedKey] ?? true;
      const skippedOn = categoryVisible[skippedKey] ?? true;

      const dotCommon = {
        radiusUnits: "meters" as const,
        getRadius: DOT_RADIUS,
        radiusMinPixels: 1,
        radiusMaxPixels: 12,
        pickable: false,
      };

      if (leftOn && leftInPlace.length > 0) {
        layers.push(
          new ScatterplotLayer({
            id: `${idPrefix}-left`,
            data: leftInPlace,
            getPosition: (p: { lon_theo: number; lat_theo: number }) => [
              p.lon_theo,
              p.lat_theo,
            ],
            getFillColor: leftColor,
            ...dotCommon,
          }),
        );
      }

      if (skippedOn && skipped.length > 0) {
        layers.push(
          new ScatterplotLayer({
            id: `${idPrefix}-skipped`,
            data: skipped,
            getPosition: (p: { lon_theo: number; lat_theo: number }) => [
              p.lon_theo,
              p.lat_theo,
            ],
            getFillColor: SKIPPED_COLOR,
            ...dotCommon,
          }),
        );
      }

      if (movedOn && moved.length > 0) {
        // Pick the offset position per point. When the snapped toggle is
        // on and a snap was recorded, the dot + arc-end sit on the GIS
        // feature; otherwise they stay at the raw multioffset landing.
        const offsPos = (p: {
          lon_offs: number;
          lat_offs: number;
          lon_offs_snap: number | null;
          lat_offs_snap: number | null;
        }): [number, number] => {
          if (useSnapped && p.lon_offs_snap != null && p.lat_offs_snap != null) {
            return [p.lon_offs_snap, p.lat_offs_snap];
          }
          return [p.lon_offs, p.lat_offs];
        };

        layers.push(
          new ScatterplotLayer({
            id: `${idPrefix}-moved`,
            data: moved,
            getPosition: offsPos,
            getFillColor: movedColor,
            updateTriggers: { getPosition: useSnapped },
            ...dotCommon,
          }),
        );

        // Movement arcs track the moved-layer toggle — hiding the dots
        // also hides their arcs so the two never fall out of sync.
        layers.push(
          new ArcLayer({
            id: `${idPrefix}-arcs`,
            data: moved,
            getSourcePosition: (p: { lon_theo: number; lat_theo: number }) => [
              p.lon_theo,
              p.lat_theo,
            ],
            getTargetPosition: offsPos,
            getSourceColor: movedColor,
            getTargetColor: movedColor,
            getWidth: 1,
            getHeight: 0.02,
            updateTriggers: { getTargetPosition: useSnapped },
            pickable: false,
          }),
        );
      }
    };

    pushSide(sPts, "offs-s", "s-left", "s-offs", "s-skp", S_LEFT_COLOR, S_OFFSET_COLOR);
    pushSide(rPts, "offs-r", "r-left", "r-offs", "r-skp", R_LEFT_COLOR, R_OFFSET_COLOR);
    return layers;
  }, [rPts, sPts, categoryVisible, useSnapped, foldMeta, foldTileVersion, foldVisible, projectId]);

  const hasStations =
    (rPts?.points.length ?? 0) + (sPts?.points.length ?? 0) > 0;
  const hasRegions = regionPolygons.length > 0;
  const anyOffsets =
    (rPts?.offset_count ?? 0) + (sPts?.offset_count ?? 0) > 0;

  const stationBounds = React.useMemo<[number, number, number, number] | null>(() => {
    const bboxes = [rPts?.bbox, sPts?.bbox].filter(Boolean) as [number, number, number, number][];
    if (bboxes.length === 0) return null;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const b of bboxes) {
      if (b[0] < w) w = b[0];
      if (b[1] < s) s = b[1];
      if (b[2] > e) e = b[2];
      if (b[3] > n) n = b[3];
    }
    return [w, s, e, n];
  }, [rPts, sPts]);

  if (loadState === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
        <Icon icon={appIcons.loader} size={14} className="animate-spin" />
        Loading offsets…
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="flex h-full items-center justify-center p-[var(--space-4)] text-sm text-[var(--color-status-danger)]">
        {errorMsg}
      </div>
    );
  }
  if (!hasStations && !hasRegions) {
    return (
      <div className="flex h-full items-center justify-center p-[var(--space-4)]">
        <ViewportPlaceholder
          variant="constellation"
          message={
            loadState === "missing"
              ? "Click 'Show grid' to compute offsets"
              : "Configure the offsets and click 'Show grid'"
          }
        />
      </div>
    );
  }

  // Left in place = total − offset − skipped per side. Mirrors the filter
  // the viewport applies so the legend + KPI counts stay in sync with
  // the dots.
  const rLeft = rPts
    ? Math.max(0, rPts.count - rPts.offset_count - rPts.skipped_count)
    : 0;
  const sLeft = sPts
    ? Math.max(0, sPts.count - sPts.offset_count - sPts.skipped_count)
    : 0;
  const rSkipped = rPts?.skipped_count ?? 0;
  const sSkipped = sPts?.skipped_count ?? 0;

  const categoryLegend = (
    key: CategoryKey,
    color: string,
    label: string,
  ) => ({
    key,
    color,
    label,
    visible: categoryVisible[key] ?? true,
    onToggle: () => toggleCategory(key),
  });

  type LegendItem = {
    key: string;
    color: string;
    label: string;
    visible?: boolean;
    onToggle?: () => void;
    separator?: boolean;
  };

  const sourceItems: LegendItem[] = [];
  if (sLeft > 0) sourceItems.push(categoryLegend("s-left", "#fca5a5", "In place"));
  if (sPts && sPts.offset_count > 0) sourceItems.push(categoryLegend("s-offs", "#b91c1c", "Offset"));
  if (sSkipped > 0) sourceItems.push(categoryLegend("s-skp", "#ffffff", "Skipped"));

  const receiverItems: LegendItem[] = [];
  if (rLeft > 0) receiverItems.push(categoryLegend("r-left", "#93c5fd", "In place"));
  if (rPts && rPts.offset_count > 0) receiverItems.push(categoryLegend("r-offs", "#1d4ed8", "Offset"));
  if (rSkipped > 0) receiverItems.push(categoryLegend("r-skp", "#ffffff", "Skipped"));

  const regionItems: LegendItem[] = regionPolygons.map((stem, i) => ({
    key: `region-${stem}`,
    color: REGION_PALETTE[i % REGION_PALETTE.length],
    label: stem,
    visible: regionVisible[stem] ?? true,
    onToggle: () => toggleRegion(stem),
  }));

  const totalSnapped =
    (rPts?.snapped_count ?? 0) + (sPts?.snapped_count ?? 0);

  const legendItems: LegendItem[] = [];
  if (sourceItems.length > 0) {
    legendItems.push({ key: "hd-sources", color: "", label: "Sources", separator: true });
    legendItems.push(...sourceItems);
  }
  if (receiverItems.length > 0) {
    legendItems.push({ key: "hd-receivers", color: "", label: "Receivers", separator: true });
    legendItems.push(...receiverItems);
  }
  if (totalSnapped > 0) {
    legendItems.push({
      key: "hd-display",
      color: "",
      label: "Display",
      separator: true,
    });
    legendItems.push({
      key: "snapped",
      color: "#10b981",
      label: `Snapped coords (${totalSnapped})`,
      visible: useSnapped,
      onToggle: () => setUseSnapped((v) => !v),
    });
  }
  if (regionItems.length > 0) {
    legendItems.push({ key: "hd-regions", color: "", label: "Regions", separator: true });
    legendItems.push(...regionItems);
  }
  if (foldMeta) {
    legendItems.push({
      key: "hd-fold",
      color: "",
      label: "Fold",
      separator: true,
    });
    legendItems.push({
      key: "fold",
      color: "#7c3aed",
      label: `Offsets fold (max ${foldMeta.value_max})`,
      visible: foldVisible,
      onToggle: () => setFoldVisible((v) => !v),
    });
  }

  // Per-side denominators: left + skip + offset partitions the side's
  // total count exactly, so each KPI percentage sums to 100 per side.
  const rDenom = rPts?.count ?? 0;
  const sDenom = sPts?.count ?? 0;
  type KpiEntry = {
    key: string;
    color: string;
    label: string;
    count: number;
    denom: number;
  };
  const kpiGroups: { title: string; items: KpiEntry[] }[] = [];
  if (sDenom > 0) {
    kpiGroups.push({
      title: "Sources",
      items: [
        { key: "s-left", color: "#fca5a5", label: "In place", count: sLeft, denom: sDenom },
        { key: "s-offs", color: "#b91c1c", label: "Offset", count: sPts?.offset_count ?? 0, denom: sDenom },
        { key: "s-skp", color: "#ffffff", label: "Skipped", count: sSkipped, denom: sDenom },
      ],
    });
  }
  if (rDenom > 0) {
    kpiGroups.push({
      title: "Receivers",
      items: [
        { key: "r-left", color: "#93c5fd", label: "In place", count: rLeft, denom: rDenom },
        { key: "r-offs", color: "#1d4ed8", label: "Offset", count: rPts?.offset_count ?? 0, denom: rDenom },
        { key: "r-skp", color: "#ffffff", label: "Skipped", count: rSkipped, denom: rDenom },
      ],
    });
  }

  const formatCount = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const formatPct = (count: number, denom: number) =>
    denom > 0 ? `${((count / denom) * 100).toFixed(1)}%` : "—";

  const emptyNotice =
    hasStations && !anyOffsets ? (
      <div className="absolute left-1/2 top-[var(--space-4)] z-10 -translate-x-1/2 rounded-[var(--radius-sm)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] shadow-sm">
        No points offset yet
      </div>
    ) : null;

  const kpiPanel =
    kpiGroups.length > 0 ? (
      <div className="pointer-events-none absolute right-[var(--space-3)] top-[var(--space-3)] z-10 flex flex-col gap-[var(--space-2)]">
        {kpiGroups.map((g) => (
          <div
            key={g.title}
            className="pointer-events-auto rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/95 p-[var(--space-2)] shadow-[0_4px_12px_var(--color-shadow-alpha)] backdrop-blur-sm"
          >
            <div className="mb-[var(--space-1)] text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {g.title}
            </div>
            <div className="grid grid-cols-3 gap-[var(--space-2)]">
              {g.items.map((it) => (
                <div
                  key={it.key}
                  className="flex min-w-[72px] flex-col items-start gap-[2px]"
                >
                  <div className="flex items-center gap-[var(--space-1)]">
                    <span
                      className="inline-block h-2 w-2 rounded-full border border-[var(--color-border-subtle)]"
                      // eslint-disable-next-line template/no-jsx-style-prop
                      style={{ backgroundColor: it.color }}
                    />
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      {it.label}
                    </span>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {formatCount(it.count)}
                  </div>
                  <div className="text-[11px] tabular-nums text-[var(--color-text-secondary)]">
                    {formatPct(it.count, it.denom)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="relative h-full w-full">
      {emptyNotice}
      {kpiPanel}
      <GisViewerViewport
        projectId={projectId}
        visibleFiles={visibleFiles}
        onStyleChange={() => {
          /* legend edits ignored — styling is deterministic */
        }}
        extraLayers={extraLayers}
        legendItems={legendItems}
        legendExtra={
          foldMeta && foldVisible ? (
            <FoldColormapLegend
              colormap={foldMeta.colormap}
              valueMin={foldMeta.value_min}
              valueMax={foldMeta.value_max}
            />
          ) : null
        }
        fitBounds={stationBounds}
        viewStateKey={projectId != null ? `offsets:${projectId}` : undefined}
      />
    </div>
  );
}
