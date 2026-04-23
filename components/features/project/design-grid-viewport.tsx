"use client";

import * as React from "react";
import { BitmapLayer, ScatterplotLayer } from "@deck.gl/layers";
import { TileLayer } from "@deck.gl/geo-layers";

import type {
  VisibleFile,
  GisLayerStyle,
} from "@/components/features/project/project-gis-viewer";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { GisViewerViewport } from "@/components/features/project/gis-viewer-viewport";
import { appIcons, Icon } from "@/components/ui/icon";
import type { FileCategory } from "@/services/api/project-files";
import { foldTilesUrlTemplate } from "@/services/api/project-fold";
import type { GridArtifactResponse } from "@/services/api/project-grid-artifacts";
import { useFoldMeta } from "@/services/query/project-fold";
import { useGridStations } from "@/services/query/project-grid-artifacts";

const R_COLOR: [number, number, number, number] = [59, 130, 246, 200]; // blue-500
const S_COLOR: [number, number, number, number] = [249, 115, 22, 200]; // orange-500

const REGION_PALETTE = [
  "#64748b", "#0ea5e9", "#a855f7", "#14b8a6",
  "#ef4444", "#f59e0b", "#84cc16", "#ec4899",
];

export interface DesignGridViewportProps {
  projectId: number | null;
  /** Set of polygon file stems (no .gpkg) referenced by active regioning. */
  regionPolygons: ReadonlyArray<string>;
}

function is404(err: unknown): boolean {
  return err instanceof Error && /404/.test(err.message);
}

export function DesignGridViewport({
  projectId,
  regionPolygons,
}: DesignGridViewportProps) {
  // Station fetches run through react-query so the data survives tab
  // switches and component remounts. Invalidation (after a grid run or
  // option change) is the caller's job — see useInvalidateGridArtifacts.
  const rQuery = useGridStations(projectId, "r");
  const sQuery = useGridStations(projectId, "s");
  const foldQuery = useFoldMeta(projectId);
  const foldMeta = foldQuery.data ?? null;
  // Version string makes the tile URL unique per run so the browser and
  // TileLayer's own cache don't serve stale PNGs when the user re-runs
  // Process fold with new params — the backend overwrites the tiles
  // at the same paths.
  const foldTileVersion = foldMeta
    ? `${foldMeta.option_name}:${foldMeta.colormap}:${foldMeta.value_max}:${foldMeta.params.offset_min}:${foldMeta.params.offset_max}`
    : null;
  const rPts: GridArtifactResponse | null = rQuery.data ?? null;
  const sPts: GridArtifactResponse | null = sQuery.data ?? null;
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

  // Per-component visibility owned locally — the viewport's built-in
  // file toggle is bypassed because we supply our own legendItems. Each
  // flag defaults to true and gets flipped by the legend checkboxes.
  const [foldVisible, setFoldVisible] = React.useState(true);
  const [rVisible, setRVisible] = React.useState(true);
  const [sVisible, setSVisible] = React.useState(true);
  const [regionVisible, setRegionVisible] = React.useState<Record<string, boolean>>({});
  // Prune stale entries when regioning changes (removed polygons) and
  // seed new ones to visible-by-default — React setState inside render
  // would loop, so this runs as an effect keyed on regionPolygons.
  React.useEffect(() => {
    setRegionVisible((prev) => {
      const next: Record<string, boolean> = {};
      for (const stem of regionPolygons) {
        next[stem] = prev[stem] ?? true;
      }
      return next;
    });
  }, [regionPolygons]);

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
    // Fold overlay first so stations draw on top of it. The backend
    // reprojects the rotated GeoTIFF to Web-Mercator PNG tiles at
    // upload time, so deck.gl's TileLayer does the standard {z}/{x}/{y}
    // dance — no hand-placed quad, no rotation handling on the client.
    // The TileLayer stays mounted across tick/untick cycles — hiding via
    // the ``visible`` prop instead of omitting the layer entirely. deck.gl
    // disposes a tile cache when a layer unmounts; re-mounting with the
    // same id picks up a stale/empty cache and silently fails to refetch
    // on the second re-show. Keeping the instance alive sidesteps that.
    if (foldMeta && foldTileVersion && projectId !== null) {
      const tileUrl = foldTilesUrlTemplate(projectId, foldTileVersion);
      const [west, south, east, north] = foldMeta.bounds;
      layers.push(
        new TileLayer({
          id: `fold-tiles:${foldTileVersion}`,
          visible: foldVisible,
          data: tileUrl,
          // The tile endpoint sits behind the session cookie. deck.gl's
          // URL loader doesn't carry cookies by default, so push the
          // flag through loadOptions — @loaders.gl/images forwards this
          // to the underlying ``fetch`` call.
          loadOptions: {
            fetch: { credentials: "include" },
          },
          minZoom: foldMeta.min_zoom,
          maxZoom: foldMeta.max_zoom,
          tileSize: 256,
          extent: [west, south, east, north],
          pickable: false,
          // deck.gl renders each tile as its own BitmapLayer. The bbox
          // discriminator ("west" key) distinguishes geo tiles from the
          // non-geo (OSM-style) variant — we're always geo.
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
            });
          },
        }),
      );
    }
    // Station radius is in world meters so dots grow/shrink with zoom.
    // The clamps keep them visible at extreme zoom-out and from turning
    // into blobs at extreme zoom-in. 5 m ~ one bin for typical seismic
    // grids with RPI/SPI 25–50 m.
    const radiusMeters = 5;
    if (sPts && sPts.points.length > 0 && sVisible) {
      layers.push(
        new ScatterplotLayer({
          id: "grid-s",
          data: sPts.points,
          getPosition: (p: { lon: number; lat: number }) => [p.lon, p.lat],
          getFillColor: S_COLOR,
          radiusUnits: "meters" as const,
          getRadius: radiusMeters,
          radiusMinPixels: 1,
          radiusMaxPixels: 12,
          pickable: false,
        }),
      );
    }
    if (rPts && rPts.points.length > 0 && rVisible) {
      layers.push(
        new ScatterplotLayer({
          id: "grid-r",
          data: rPts.points,
          getPosition: (p: { lon: number; lat: number }) => [p.lon, p.lat],
          getFillColor: R_COLOR,
          radiusUnits: "meters" as const,
          getRadius: radiusMeters,
          radiusMinPixels: 1,
          radiusMaxPixels: 12,
          pickable: false,
        }),
      );
    }
    return layers;
  }, [
    rPts,
    sPts,
    foldMeta,
    foldTileVersion,
    projectId,
    foldVisible,
    rVisible,
    sVisible,
  ]);

  const hasStations =
    (rPts?.points.length ?? 0) + (sPts?.points.length ?? 0) > 0;
  const hasRegions = regionPolygons.length > 0;

  // Combined bbox of both ptypes — the viewport only fits-to-bounds via
  // visibleFiles, and an empty regioning list means there's nothing to
  // fit to. Compute the union of r + s bboxes and pass it through so
  // newly-generated stations actually land on-screen.
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
        Loading grid…
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
              ? "Click 'Show grid' to generate the theoretical stations"
              : "Configure an option and click 'Show grid'"
          }
        />
      </div>
    );
  }

  const legendItems = [
    ...(foldMeta
      ? [{
          key: "fold",
          color: "#8b5cf6",
          label: `Fold ${foldMeta.value_min}–${foldMeta.value_max} (${foldMeta.colormap})`,
          visible: foldVisible,
          onToggle: () => setFoldVisible((v) => !v),
        }]
      : []),
    ...(rPts && rPts.points.length > 0
      ? [{
          key: "r",
          color: "#3b82f6",
          label: `Receivers (${rPts.count})`,
          visible: rVisible,
          onToggle: () => setRVisible((v) => !v),
        }]
      : []),
    ...(sPts && sPts.points.length > 0
      ? [{
          key: "s",
          color: "#f97316",
          label: `Sources (${sPts.count})`,
          visible: sVisible,
          onToggle: () => setSVisible((v) => !v),
        }]
      : []),
    ...regionPolygons.map((stem, i) => ({
      key: `region-${stem}`,
      color: REGION_PALETTE[i % REGION_PALETTE.length],
      label: stem,
      visible: regionVisible[stem] ?? true,
      onToggle: () =>
        setRegionVisible((prev) => ({ ...prev, [stem]: !(prev[stem] ?? true) })),
    })),
  ];

  return (
    <GisViewerViewport
      projectId={projectId}
      visibleFiles={visibleFiles}
      onStyleChange={() => {
        /* legend edits ignored — styling is deterministic */
      }}
      extraLayers={extraLayers}
      legendItems={legendItems}
      fitBounds={stationBounds}
      viewStateKey={projectId != null ? `grid:${projectId}` : undefined}
    />
  );
}
