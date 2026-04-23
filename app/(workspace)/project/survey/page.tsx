"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { PathLayer } from "@deck.gl/layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectSurvey } from "@/components/features/project/project-survey";
import type { SurveyViewportData } from "@/components/features/project/project-survey";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { VisibleFile, GisLayerStyle } from "@/components/features/project/project-gis-viewer";
import { useSectionData } from "@/lib/use-autosave";
import { fetchFileGeoJson } from "@/services/api/project-files";
import type { FileCategory } from "@/services/api/project-files";

const GisViewerViewport = dynamic(
  () =>
    import("@/components/features/project/gis-viewer-viewport").then(
      (m) => m.GisViewerViewport,
    ),
  { ssr: false },
);

const PALETTE = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444",
  "#a855f7", "#06b6d4", "#f59e0b", "#ec4899",
];

type PersistedStyles = Record<
  string,
  { color: string; width: number; opacity: number; filled?: boolean }
>;

/* ------------------------------------------------------------------
   Geo helpers: offset a [lon, lat] by distance (meters) + bearing (deg)
   ------------------------------------------------------------------ */

const EARTH_R = 6_371_008.8; // mean radius in meters

/* ------------------------------------------------------------------
   Compute rotated margin rectangle around a polygon's bounding box.

   The azimuth gives the direction of the "inline" (top/bottom) sides.
   - azimuth 0 → top side faces north
   - The rectangle is aligned to the azimuth, then offset outward by margins
   ------------------------------------------------------------------ */

function computeMarginRect(
  features: GeoJSON.Feature[],
  margins: { top: number; left: number; right: number; bottom: number },
  azimuthDeg: number,
): [number, number][] | null {
  // Collect all coordinates
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

  // Find centroid
  let cLon = 0, cLat = 0;
  for (const [lon, lat] of coords) { cLon += lon; cLat += lat; }
  cLon /= coords.length;
  cLat /= coords.length;

  // Convert to local meters relative to centroid (equirectangular approx)
  const cosLat = Math.cos((cLat * Math.PI) / 180);
  const DEG_TO_M_LAT = (Math.PI / 180) * EARTH_R;
  const DEG_TO_M_LON = DEG_TO_M_LAT * cosLat;

  const local = coords.map(([lon, lat]) => ({
    x: (lon - cLon) * DEG_TO_M_LON,
    y: (lat - cLat) * DEG_TO_M_LAT,
  }));

  // Rotate into azimuth-aligned frame.
  // Local frame: +X = east, +Y = north.
  // Azimuth direction vector: (sin(az), cos(az)).
  // We rotate so the azimuth direction maps to +X (inline axis).
  // Rotation angle (standard math, CCW from +X): az - 90°.
  const azRad = ((azimuthDeg - 90) * Math.PI) / 180;
  const cosA = Math.cos(azRad);
  const sinA = Math.sin(azRad);
  const rotated = local.map(({ x, y }) => ({
    x: x * cosA - y * sinA,
    y: x * sinA + y * cosA,
  }));

  // Find bounding box in rotated frame
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of rotated) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Expand by margins.
  // +X = inline (azimuth direction): left/right expand along RLs
  // +Y = crossline: top expands in the "up" cross direction, bottom in "down"
  minX -= margins.left;
  maxX += margins.right;
  minY -= margins.bottom;
  maxY += margins.top;

  // 4 corners in rotated frame
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  // Rotate back to geographic frame and convert to lon/lat
  const cosB = Math.cos(-azRad);
  const sinB = Math.sin(-azRad);
  const result: [number, number][] = corners.map(({ x, y }) => {
    const gx = x * cosB - y * sinB;
    const gy = x * sinB + y * cosB;
    return [cLon + gx / DEG_TO_M_LON, cLat + gy / DEG_TO_M_LAT] as [number, number];
  });

  // Close the ring
  result.push(result[0]);
  return result;
}

/* ------------------------------------------------------------------
   Page
   ------------------------------------------------------------------ */

export default function SurveyPage() {
  const [vp, setVp] = React.useState<SurveyViewportData | null>(null);

  const projectId = vp?.projectId ?? null;

  // Shared persisted styles
  const { data: savedStyles, update: updateSavedStyles } =
    useSectionData<PersistedStyles>(projectId, "gis_styles", {});

  // Build visible files from acquisition polygon + POIs
  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    if (!vp) return [];
    let idx = 0;
    const files: VisibleFile[] = [];

    if (vp.acquisitionPolygon) {
      const filename = `${vp.acquisitionPolygon}.gpkg`;
      const key = `polygons/${filename}`;
      const saved = savedStyles[key];
      files.push({
        category: "polygons" as FileCategory,
        filename,
        style: saved
          ? { color: saved.color, width: saved.width, opacity: saved.opacity ?? 0.8, filled: saved.filled ?? true, visible: true }
          : { color: PALETTE[idx % PALETTE.length], width: 2, opacity: 0.8, filled: true, visible: true },
      });
      idx++;
    }

    for (const poi of vp.pois) {
      const filename = `${poi}.gpkg`;
      const key = `poi/${filename}`;
      const saved = savedStyles[key];
      files.push({
        category: "poi" as FileCategory,
        filename,
        style: saved
          ? { color: saved.color, width: saved.width, opacity: saved.opacity ?? 0.8, filled: false, visible: true }
          : { color: PALETTE[idx % PALETTE.length], width: 2, opacity: 0.8, filled: false, visible: true },
      });
      idx++;
    }

    return files;
  }, [vp, savedStyles]);

  // Local style overrides
  const [styleOverrides, setStyleOverrides] = React.useState<
    Record<string, Partial<GisLayerStyle>>
  >({});

  const mergedFiles: VisibleFile[] = React.useMemo(
    () =>
      visibleFiles.map((f) => {
        const key = `${f.category}/${f.filename}`;
        const over = styleOverrides[key];
        return over ? { ...f, style: { ...f.style, ...over } } : f;
      }),
    [visibleFiles, styleOverrides],
  );

  const handleStyleChange = React.useCallback(
    (category: FileCategory, filename: string, patch: Partial<GisLayerStyle>) => {
      const key = `${category}/${filename}`;
      setStyleOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
      const current = visibleFiles.find((f) => f.category === category && f.filename === filename);
      if (current) {
        const merged = { ...current.style, ...styleOverrides[key], ...patch };
        updateSavedStyles({
          ...savedStyles,
          [key]: { color: merged.color, width: merged.width, opacity: merged.opacity, filled: merged.filled },
        });
      }
    },
    [visibleFiles, styleOverrides, savedStyles, updateSavedStyles],
  );

  // Fetch polygon GeoJSON to compute margin rectangle
  const [polyGeoJson, setPolyGeoJson] = React.useState<GeoJSON.FeatureCollection | null>(null);
  const prevPolyKey = React.useRef("");

  React.useEffect(() => {
    if (!projectId || !vp?.acquisitionPolygon) {
      setPolyGeoJson(null);
      prevPolyKey.current = "";
      return;
    }
    const key = `${projectId}/${vp.acquisitionPolygon}`;
    if (key === prevPolyKey.current) return;
    prevPolyKey.current = key;

    let cancelled = false;
    fetchFileGeoJson(projectId, "polygons", `${vp.acquisitionPolygon}.gpkg`)
      .then((data) => { if (!cancelled) setPolyGeoJson(data); })
      .catch(() => { if (!cancelled) setPolyGeoJson(null); });
    return () => { cancelled = true; };
  }, [projectId, vp?.acquisitionPolygon]);

  // Build extra deck.gl layers for extent rectangles
  const extraLayers = React.useMemo(() => {
    if (!polyGeoJson || !vp) return [];
    const layers: unknown[] = [];

    // Build dashed extent rectangle
    const rect = computeMarginRect(polyGeoJson.features, vp.margins, vp.azimuth);
    if (rect) {
      layers.push(
        new PathLayer({
          id: "survey-extent-rect",
          data: [{ path: rect }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [100, 200, 255, 200],
          getWidth: 2,
          widthUnits: "pixels" as const,
          getDashArray: [8, 4],
          dashJustified: true,
          extensions: [new PathStyleExtension({ dash: true })],
        }),
      );
    }

    return layers;
  }, [polyGeoJson, vp]);

  const hasContent = visibleFiles.length > 0;
  const hasExtent = extraLayers.length > 0;

  const extentLegend = hasExtent ? (
    <>
      {/* eslint-disable-next-line template/no-jsx-style-prop -- legend divider sizing */}
      <div style={{ height: 1, margin: "4px 10px", backgroundColor: "rgba(255,255,255,0.08)" }} />
      <div className="gis-legend__row">
        {/* eslint-disable-next-line template/no-jsx-style-prop -- SVG flex sizing */}
        <svg width={10} height={10} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
          <rect
            x={0.5} y={0.5} width={9} height={9} rx={1.5}
            fill="none"
            stroke="rgb(100,200,255)"
            strokeWidth={1.5}
            strokeDasharray="2 1.5"
          />
        </svg>
        <span className="gis-legend__label">Extent</span>
      </div>
    </>
  ) : null;

  return (
    <ProjectSettingsPage
      title="Survey"
      viewport={
        hasContent ? (
          <GisViewerViewport
            projectId={projectId}
            visibleFiles={mergedFiles}
            onStyleChange={handleStyleChange}
            extraLayers={extraLayers}
            legendExtra={extentLegend}
            viewStateKey={projectId != null ? `survey:${projectId}` : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder variant="constellation" message="Select an acquisition polygon" />
          </div>
        )
      }
    >
      <ProjectSurvey onViewportChange={setVp} />
    </ProjectSettingsPage>
  );
}
