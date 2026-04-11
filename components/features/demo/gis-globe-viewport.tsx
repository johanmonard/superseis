"use client";

import * as React from "react";
import maplibregl, {
  type Map as MLMap,
  type StyleSpecification,
  type LngLatBoundsLike,
  type RasterSourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONFeatureCollection } from "@/lib/gpkg";

type TileSource = {
  name: string;
  tiles: string[];
  attribution: string;
  maxZoom: number;
  tileSize?: number;
};

const TILE_SOURCES: TileSource[] = [
  {
    name: "Esri Satellite",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
  },
  {
    name: "Esri Satellite + Labels",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
  },
  {
    name: "Google Satellite",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Google Hybrid",
    tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "OpenStreetMap",
    tiles: [
      "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
      "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    ],
    attribution:
      "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    maxZoom: 19,
  },
  {
    name: "Google Streets",
    tiles: ["https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Google Terrain",
    tiles: ["https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Esri Street",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  {
    name: "OpenTopoMap",
    tiles: [
      "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
      "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    attribution: "&copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
  {
    name: "Esri Topo",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  {
    name: "Esri NatGeo",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri &mdash; National Geographic",
    maxZoom: 16,
  },
  {
    name: "Esri Ocean",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 13,
  },
  {
    name: "Esri Light Gray",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  {
    name: "Esri Dark Gray",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  {
    name: "CartoDB Positron",
    tiles: [
      "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    ],
    attribution: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  {
    name: "CartoDB Dark",
    tiles: [
      "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    ],
    attribution: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  {
    name: "CartoDB Voyager",
    tiles: [
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    ],
    attribution: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  {
    name: "USGS Imagery",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; USGS",
    maxZoom: 16,
  },
  {
    name: "USGS Topo",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; USGS",
    maxZoom: 16,
  },
  {
    name: "Wikimedia",
    tiles: ["https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png"],
    attribution:
      "&copy; <a href='https://wikimediafoundation.org/'>Wikimedia</a>, &copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
];

const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const BASE_SOURCE_ID = "base-tiles";
const LABELS_SOURCE_ID = "labels-tiles";
const BASE_LAYER_ID = "base-layer";
const LABELS_LAYER_ID = "labels-layer";

const FEATURES_SOURCE_ID = "features-source";
const FEATURES_FILL_LAYER = "features-fill";
const FEATURES_LINE_LAYER = "features-line";
const FEATURES_CIRCLE_LAYER = "features-circle";

const DRAFT_SOURCE_ID = "draft-source";
const DRAFT_FILL_LAYER = "draft-fill";
const DRAFT_LINE_LAYER = "draft-line";

// Separate source holding only the feature currently being edited. Keeping it
// tiny means per-frame setData calls during vertex drag are cheap — the main
// source (which may hold tens of thousands of features) is never touched
// during a drag.
const EDIT_SOURCE_ID = "edit-source";
const EDIT_FILL_LAYER = "edit-fill";
const EDIT_LINE_LAYER = "edit-line";
const EDIT_CIRCLE_LAYER = "edit-circle";

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;

const FEATURE_COLOR = "#facc15";
const SELECTED_COLOR = "#3b82f6";
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0b1220" },
    },
  ],
};

function rasterSourceFor(tile: TileSource): RasterSourceSpecification {
  return {
    type: "raster",
    tiles: tile.tiles,
    tileSize: tile.tileSize ?? 256,
    attribution: tile.attribution,
    maxzoom: tile.maxZoom,
  };
}

function geojsonBounds(
  data: GeoJSONFeatureCollection
): [[number, number], [number, number]] | null {
  let minLat = Infinity,
    maxLat = -Infinity;
  let minLng = Infinity,
    maxLng = -Infinity;

  function visit(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      const [lng, lat] = coords as number[];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) visit(c);
    }
  }

  for (const f of data.features) {
    if (f.geometry) visit((f.geometry as GeoJSON.Geometry & { coordinates: unknown }).coordinates);
  }

  if (!isFinite(minLat)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

// ---------------------------------------------------------------------------
// Geometry editing helpers — index/path-addressed vertices, plus draft builder
// ---------------------------------------------------------------------------

type VertexEntry = { path: number[]; coord: [number, number] };
type DrawShape = "Point" | "LineString" | "Polygon";

function cloneGeometry<G extends GeoJSON.Geometry>(g: G): G {
  return JSON.parse(JSON.stringify(g)) as G;
}

function enumerateVertices(geom: GeoJSON.Geometry): VertexEntry[] {
  const out: VertexEntry[] = [];
  const push = (path: number[], c: GeoJSON.Position) =>
    out.push({ path, coord: [c[0], c[1]] });

  switch (geom.type) {
    case "Point":
      push([], geom.coordinates);
      break;
    case "MultiPoint":
      geom.coordinates.forEach((c, i) => push([i], c));
      break;
    case "LineString":
      geom.coordinates.forEach((c, i) => push([i], c));
      break;
    case "MultiLineString":
      geom.coordinates.forEach((line, li) =>
        line.forEach((c, i) => push([li, i], c))
      );
      break;
    case "Polygon":
      geom.coordinates.forEach((ring, ri) => {
        const last = ring.length - 1;
        ring.forEach((c, i) => {
          if (i === last && ring.length > 1) return;
          push([ri, i], c);
        });
      });
      break;
    case "MultiPolygon":
      geom.coordinates.forEach((poly, pi) =>
        poly.forEach((ring, ri) => {
          const last = ring.length - 1;
          ring.forEach((c, i) => {
            if (i === last && ring.length > 1) return;
            push([pi, ri, i], c);
          });
        })
      );
      break;
  }
  return out;
}

// In-place vertex mutation. Safe to call at 60fps during drag because it does
// no allocations — the caller owns the geometry object and must clone it
// beforehand if they need an immutable copy.
function mutateGeomVertex(
  geom: GeoJSON.Geometry,
  path: number[],
  coord: [number, number]
): void {
  if (geom.type === "Point") {
    (geom as GeoJSON.Point).coordinates = coord;
    return;
  }
  let parent: unknown = (geom as { coordinates: unknown }).coordinates;
  for (let i = 0; i < path.length - 1; i++) {
    parent = (parent as unknown[])[path[i]];
  }
  (parent as unknown[])[path[path.length - 1]] = coord;

  // Keep polygon rings closed when the first vertex is moved
  if (geom.type === "Polygon" && path.length === 2 && path[1] === 0) {
    const ring = (geom as GeoJSON.Polygon).coordinates[path[0]];
    if (ring.length > 1) ring[ring.length - 1] = coord;
  }
  if (geom.type === "MultiPolygon" && path.length === 3 && path[2] === 0) {
    const ring = (geom as GeoJSON.MultiPolygon).coordinates[path[0]][path[1]];
    if (ring.length > 1) ring[ring.length - 1] = coord;
  }
}

// Segment midpoints for LineString / Polygon (including closing edge) and their
// multi variants. The returned `path` is the insertion index — splicing the new
// vertex there yields a ring/line with the midpoint inserted at the clicked edge.
function enumerateMidpoints(geom: GeoJSON.Geometry): VertexEntry[] {
  const out: VertexEntry[] = [];
  const addSegments = (coords: GeoJSON.Position[], pathPrefix: number[]) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      out.push({
        path: [...pathPrefix, i + 1],
        coord: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      });
    }
  };
  switch (geom.type) {
    case "LineString":
      addSegments(geom.coordinates, []);
      break;
    case "MultiLineString":
      geom.coordinates.forEach((line, li) => addSegments(line, [li]));
      break;
    case "Polygon":
      geom.coordinates.forEach((ring, ri) => addSegments(ring, [ri]));
      break;
    case "MultiPolygon":
      geom.coordinates.forEach((poly, pi) =>
        poly.forEach((ring, ri) => addSegments(ring, [pi, ri]))
      );
      break;
  }
  return out;
}

function mutateInsertGeomVertex(
  geom: GeoJSON.Geometry,
  path: number[],
  coord: [number, number]
): void {
  let parent: unknown = (geom as { coordinates: unknown }).coordinates;
  for (let i = 0; i < path.length - 1; i++) {
    parent = (parent as unknown[])[path[i]];
  }
  (parent as unknown[]).splice(path[path.length - 1], 0, coord);
}

function gpkgTypeToDrawShape(geometryType: string): DrawShape {
  const t = geometryType.toUpperCase().replace(/^MULTI/, "");
  if (t.startsWith("POINT")) return "Point";
  if (t.startsWith("LINESTRING")) return "LineString";
  return "Polygon";
}

function wrapGeomToType(
  geom: GeoJSON.Geometry,
  geometryType: string
): GeoJSON.Geometry {
  const t = geometryType.toUpperCase();
  if (!t.startsWith("MULTI")) return geom;
  if (geom.type === "Point" && t === "MULTIPOINT") {
    return { type: "MultiPoint", coordinates: [geom.coordinates] };
  }
  if (geom.type === "LineString" && t === "MULTILINESTRING") {
    return { type: "MultiLineString", coordinates: [geom.coordinates] };
  }
  if (geom.type === "Polygon" && t === "MULTIPOLYGON") {
    return { type: "MultiPolygon", coordinates: [geom.coordinates] };
  }
  return geom;
}

function buildDraftGeometry(
  shape: DrawShape,
  coords: [number, number][]
): GeoJSON.Geometry | null {
  if (coords.length === 0) return null;
  if (shape === "Point") return { type: "Point", coordinates: coords[0] };
  if (coords.length === 1) return { type: "Point", coordinates: coords[0] };
  if (shape === "LineString") return { type: "LineString", coordinates: coords };
  if (coords.length < 3) return { type: "LineString", coordinates: coords };
  return { type: "Polygon", coordinates: [[...coords, coords[0]]] };
}

const GLOBE_CSS = `
  .glb-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    border: 1px solid rgba(15, 23, 42, 0.14);
    background-color: #fff;
    color: #1e293b;
    cursor: pointer;
    background-clip: padding-box;
  }
  .glb-fs-toolbar .glb-btn {
    border-color: transparent;
    background-color: rgba(15, 23, 42, 0.05);
  }
  .glb-fs-toolbar .glb-btn:hover:not(:disabled) {
    background-color: rgba(15, 23, 42, 0.1);
  }
  [data-theme="dark"] .glb-fs-toolbar .glb-btn {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }
  [data-theme="dark"] .glb-fs-toolbar .glb-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.16);
  }
  .glb-btn:hover:not(:disabled) { background-color: #f3f4f6; }
  .glb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .glb-btn--active {
    background-color: #3b82f6 !important;
    color: #fff !important;
    border-color: #3b82f6 !important;
  }
  .glb-btn--dirty {
    background-color: #fbbf24 !important;
    color: #78350f !important;
    border-color: #f59e0b !important;
    animation: glb-pulse 2s ease-in-out infinite;
  }
  [data-theme="dark"] .glb-btn {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
  }
  [data-theme="dark"] .glb-btn:hover:not(:disabled) {
    background-color: var(--color-bg-elevated);
  }

  .glb-panel {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }
  .glb-panel > * { pointer-events: auto; }
  .glb-panel--tl { top: 8px; left: 8px; }
  .glb-panel--tr { top: 8px; right: 8px; }
  .glb-panel--bl { bottom: 8px; left: 8px; }

  .glb-tile-select {
    font-size: 11px;
    font-family: system-ui, sans-serif;
    padding: 4px 22px 4px 8px;
    border-radius: 4px;
    border: 2px solid rgba(0,0,0,0.2);
    background-color: #fff;
    color: #333;
    cursor: pointer;
    outline: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    background-clip: padding-box;
  }
  [data-theme="dark"] .glb-tile-select {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23cbd5e1'/%3E%3C/svg%3E");
  }
  .glb-fs-toolbar .glb-tile-select {
    border-color: transparent;
    background-color: rgba(15, 23, 42, 0.05);
    color: #1e293b;
    font-weight: 500;
  }
  [data-theme="dark"] .glb-fs-toolbar .glb-tile-select {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .glb-zoom-badge {
    font-size: 13px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    letter-spacing: 0.02em;
    color: #fff;
    background-color: rgba(0,0,0,0.6);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 5px;
    padding: 4px 9px;
    pointer-events: none;
    user-select: none;
    align-self: flex-start;
    min-width: 54px;
    text-align: center;
  }
  .glb-fs-toolbar .glb-zoom-badge {
    background-color: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.18);
    color: #0f172a;
  }
  [data-theme="dark"] .glb-fs-toolbar .glb-zoom-badge {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }

  .glb-attribution {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    font-size: 10px;
    font-family: system-ui, sans-serif;
    color: #fff;
    background-color: rgba(0,0,0,0.55);
    border-radius: 4px;
    padding: 3px 8px;
    pointer-events: none;
    user-select: none;
    max-width: 60%;
    text-align: center;
  }
  .glb-attribution a { color: #fff; text-decoration: underline; }

  /* Vertex handle (draggable) — solid white square with blue border */
  .glb-vertex {
    width: 11px;
    height: 11px;
    background-color: #fff;
    border: 2px solid #3b82f6;
    border-radius: 2px;
    box-shadow: 0 0 3px rgba(0,0,0,0.5);
    box-sizing: border-box;
    cursor: move;
  }
  .glb-vertex:hover { background-color: #dbeafe; }

  /* Draft vertex (while drawing a new feature) — same look, crosshair cursor */
  .glb-vertex--draft { cursor: crosshair; }

  /* Midpoint handle — click (or drag) to insert a new vertex on the segment.
     Never put a transition on the transform property here: maplibregl.Marker
     repositions by writing translate() into the inline transform on every
     move event, and a transform transition would animate those position
     updates (making handles lag behind the globe during pan). */
  .glb-midpoint {
    width: 9px;
    height: 9px;
    background-color: #fb923c;
    border: 1.5px solid #fff;
    border-radius: 50%;
    opacity: 0.75;
    cursor: copy;
    box-sizing: border-box;
    box-shadow: 0 0 2px rgba(0,0,0,0.35);
    transition: opacity 0.1s ease-out, box-shadow 0.1s ease-out;
  }
  .glb-midpoint:hover {
    opacity: 1;
    box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.45);
  }

  @keyframes glb-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.5); }
    50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
  }

  /* Merged draggable toolbar — all controls in one pill.
     Defaults to bottom-center; once dragged, absolute left/top take over. */
  .glb-fs-toolbar {
    position: absolute;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18);
    cursor: grab;
    user-select: none;
    backdrop-filter: blur(8px);
  }
  [data-theme="dark"] .glb-fs-toolbar {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .glb-fs-toolbar--dragging { cursor: grabbing; }

  .glb-fs-divider {
    width: 1px;
    height: 22px;
    background-color: rgba(15, 23, 42, 0.14);
    flex-shrink: 0;
  }
  [data-theme="dark"] .glb-fs-divider {
    background-color: rgba(255, 255, 255, 0.22);
  }
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = GLOBE_CSS;
  document.head.appendChild(style);
}

const EDIT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 4-9 9H3v-4z"/><path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ADD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const SAVE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
const ZOOM_IN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ZOOM_OUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const EXPAND_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const SHRINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

export function GisGlobeViewport({
  data,
  dataKey,
  editing,
  adding,
  dirty,
  saving,
  geometryType,
  onToggleEdit,
  onToggleAdd,
  onSave,
  onEdited,
  onAdded,
}: {
  data: GeoJSONFeatureCollection | null;
  dataKey: string;
  editing: boolean;
  adding: boolean;
  dirty: boolean;
  saving: boolean;
  geometryType: string;
  onToggleEdit: () => void;
  onToggleAdd: () => void;
  onSave: () => void;
  onEdited: (features: GeoJSON.Feature[]) => void;
  onAdded: (feature: GeoJSON.Feature) => void;
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [tileIndex, setTileIndex] = React.useState(0);
  const [styleReady, setStyleReady] = React.useState(false);
  const [zoomDisplay, setZoomDisplay] = React.useState(DEFAULT_ZOOM);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const fittedKeyRef = React.useRef<string | null>(null);

  // Track fullscreen state at the viewport level so we can swap the chrome.
  React.useEffect(() => {
    const update = () => {
      const el = wrapperRef.current;
      setIsFullscreen(!!el && document.fullscreenElement === el);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  // Live copies of callbacks so effects don't have to re-subscribe
  const onSaveRef = React.useRef(onSave);
  const onEditedRef = React.useRef(onEdited);
  const onAddedRef = React.useRef(onAdded);
  const onToggleEditRef = React.useRef(onToggleEdit);
  const onToggleAddRef = React.useRef(onToggleAdd);
  React.useEffect(() => {
    onSaveRef.current = onSave;
    onEditedRef.current = onEdited;
    onAddedRef.current = onAdded;
    onToggleEditRef.current = onToggleEdit;
    onToggleAddRef.current = onToggleAdd;
  });

  // Mutable working copy of the feature collection for in-session edits.
  // Kept in sync with upstream `data` whenever the file changes.
  const workingRef = React.useRef<GeoJSON.FeatureCollection | null>(null);
  React.useEffect(() => {
    workingRef.current = data
      ? (JSON.parse(JSON.stringify(data)) as GeoJSON.FeatureCollection)
      : null;
  }, [data, dataKey]);

  React.useEffect(() => injectCss(), []);

  // Create the map once
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: EMPTY_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    // Enable real WebGL globe projection (MapLibre GL 5+)
    try {
      map.setProjection({ type: "globe" });
    } catch {
      // noop — older version fallback
    }

    map.on("load", () => {
      setStyleReady(true);
      setZoomDisplay(map.getZoom());
    });
    map.on("zoom", () => setZoomDisplay(map.getZoom()));

    // During a splitter drag we avoid calling map.resize() at all — each
    // call sets canvas.width/height, which clears the WebGL framebuffer,
    // and the blank frame between clear and MapLibre's next render reads
    // as a strobe. Instead the canvas is locked to 100% via CSS so it
    // stretches with the container (slightly blurry mid-drag, but
    // continuous), and the real resize is debounced until the drag quiets.
    const canvasEl = map.getCanvas();
    const stretchCanvas = () => {
      canvasEl.style.width = "100%";
      canvasEl.style.height = "100%";
    };
    stretchCanvas();

    let resizeTimer: number | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        map.resize();
        // map.resize writes explicit pixel width/height back onto the
        // canvas style — restore the 100% lock so future drags stretch.
        stretchCanvas();
      }, 120);
    });
    ro.observe(el);

    mapRef.current = map;

    return () => {
      ro.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
  }, []);

  // Apply the selected tile source (and optional labels overlay)
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const tile = TILE_SOURCES[tileIndex];
    const showLabels = tile.name === "Esri Satellite + Labels";

    // Remove previous base/labels if any
    for (const layerId of [LABELS_LAYER_ID, BASE_LAYER_ID]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const srcId of [LABELS_SOURCE_ID, BASE_SOURCE_ID]) {
      if (map.getSource(srcId)) map.removeSource(srcId);
    }

    map.addSource(BASE_SOURCE_ID, rasterSourceFor(tile));
    // Insert base below any existing feature layers
    const beforeId = map.getLayer(FEATURES_FILL_LAYER)
      ? FEATURES_FILL_LAYER
      : undefined;
    map.addLayer(
      {
        id: BASE_LAYER_ID,
        type: "raster",
        source: BASE_SOURCE_ID,
      },
      beforeId
    );

    if (showLabels) {
      map.addSource(LABELS_SOURCE_ID, {
        type: "raster",
        tiles: [LABELS_URL],
        tileSize: 256,
      });
      map.addLayer(
        {
          id: LABELS_LAYER_ID,
          type: "raster",
          source: LABELS_SOURCE_ID,
        },
        beforeId
      );
    }
  }, [tileIndex, styleReady]);

  // Sync GeoJSON features source
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const fc: GeoJSON.FeatureCollection = data
      ? (data as unknown as GeoJSON.FeatureCollection)
      : { type: "FeatureCollection", features: [] };

    const src = map.getSource(FEATURES_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;

    if (src) {
      src.setData(fc);
    } else {
      map.addSource(FEATURES_SOURCE_ID, {
        type: "geojson",
        data: fc,
        generateId: true,
      });
      map.addLayer({
        id: FEATURES_FILL_LAYER,
        type: "fill",
        source: FEATURES_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": FEATURE_COLOR,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.15,
          ],
        },
      });
      map.addLayer({
        id: FEATURES_LINE_LAYER,
        type: "line",
        source: FEATURES_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "Polygon"],
        ],
        paint: {
          "line-color": FEATURE_COLOR,
          "line-width": 2,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.9,
          ],
        },
      });
      map.addLayer({
        id: FEATURES_CIRCLE_LAYER,
        type: "circle",
        source: FEATURES_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": FEATURE_COLOR,
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.85,
          ],
          "circle-stroke-color": "#78350f",
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            1,
          ],
        },
      });
    }

    // Fit bounds once per dataKey
    if (data && data.features.length > 0 && fittedKeyRef.current !== dataKey) {
      fittedKeyRef.current = dataKey;
      const bounds = geojsonBounds(data);
      if (bounds) {
        // Small delay so the size is final after ResizeObserver settles
        setTimeout(() => {
          map.fitBounds(bounds as LngLatBoundsLike, {
            padding: 48,
            maxZoom: 14,
            duration: 1200,
          });
        }, 80);
      }
    } else if (!data) {
      fittedKeyRef.current = null;
    }
  }, [data, dataKey, styleReady]);

  // --------------------------------------------------------------------
  // Editing mode. The currently-selected feature is cloned into a dedicated
  // single-feature source so drags only re-tessellate that one feature, not
  // the whole collection. The main source is hidden at the selected id via
  // feature-state.editing and re-populated at deselect time.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !editing) return;

    type MarkerEntry = {
      marker: maplibregl.Marker;
      kind: "vertex" | "mid";
    };

    const editedIds = new Set<number>();
    let selectedId: number | null = null;
    let editingFeature: GeoJSON.Feature | null = null;
    let entries: MarkerEntry[] = [];
    let skipMapClick = false;
    let pendingDraftRender = false;

    const editFC = (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: editingFeature ? [editingFeature] : [],
    });

    const applyEditSourceData = () => {
      const src = map.getSource(EDIT_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(editFC());
    };

    const ensureEditSource = () => {
      if (map.getSource(EDIT_SOURCE_ID)) return;
      map.addSource(EDIT_SOURCE_ID, {
        type: "geojson",
        data: editFC(),
      });
      map.addLayer({
        id: EDIT_FILL_LAYER,
        type: "fill",
        source: EDIT_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": SELECTED_COLOR,
          "fill-opacity": 0.3,
        },
      });
      map.addLayer({
        id: EDIT_LINE_LAYER,
        type: "line",
        source: EDIT_SOURCE_ID,
        filter: [
          "any",
          ["==", ["geometry-type"], "LineString"],
          ["==", ["geometry-type"], "Polygon"],
        ],
        paint: {
          "line-color": SELECTED_COLOR,
          "line-width": 3,
          "line-opacity": 0.95,
        },
      });
      map.addLayer({
        id: EDIT_CIRCLE_LAYER,
        type: "circle",
        source: EDIT_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 7,
          "circle-color": SELECTED_COLOR,
          "circle-opacity": 0.9,
          "circle-stroke-color": "#1e3a8a",
          "circle-stroke-width": 1,
        },
      });
    };

    const removeEditSource = () => {
      for (const layerId of [
        EDIT_CIRCLE_LAYER,
        EDIT_LINE_LAYER,
        EDIT_FILL_LAYER,
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(EDIT_SOURCE_ID)) map.removeSource(EDIT_SOURCE_ID);
    };

    const clearMarkers = () => {
      entries.forEach((e) => e.marker.remove());
      entries = [];
    };

    // Surgical midpoint refresh — called on every drag frame. Paths are stable
    // during a drag (no insert/remove) so we can index midpoint entries by
    // position without any path matching.
    const refreshMidpointPositions = () => {
      if (!editingFeature?.geometry) return;
      const mids = enumerateMidpoints(editingFeature.geometry);
      let mi = 0;
      for (const entry of entries) {
        if (entry.kind === "mid") {
          const m = mids[mi++];
          if (m) entry.marker.setLngLat(m.coord);
        }
      }
    };

    const commitSelectedToWorking = () => {
      if (selectedId === null || !editingFeature || !workingRef.current) return;
      workingRef.current.features[selectedId] = editingFeature;
    };

    const commitSelectedToMain = () => {
      commitSelectedToWorking();
      if (!workingRef.current) return;
      const src = map.getSource(FEATURES_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(workingRef.current);
    };

    const deselect = () => {
      if (selectedId === null) return;
      const wasEdited = editedIds.has(selectedId);
      const oldId = selectedId;

      if (wasEdited) {
        // Push the edited geometry back into the main source (single setData
        // per deselect — not per frame).
        commitSelectedToMain();
      }

      map.setFeatureState(
        { source: FEATURES_SOURCE_ID, id: oldId },
        { editing: false }
      );
      selectedId = null;
      editingFeature = null;
      clearMarkers();
      removeEditSource();
    };

    const renderMarkers = () => {
      clearMarkers();
      if (!editingFeature?.geometry) return;

      const vertices = enumerateVertices(editingFeature.geometry);
      for (const v of vertices) {
        const el = document.createElement("div");
        el.className = "glb-vertex";
        const marker = new maplibregl.Marker({
          element: el,
          draggable: true,
        })
          .setLngLat(v.coord)
          .addTo(map);

        const vpath = v.path;

        marker.on("drag", () => {
          if (!editingFeature?.geometry) return;
          const ll = marker.getLngLat();
          mutateGeomVertex(editingFeature.geometry, vpath, [ll.lng, ll.lat]);
          // Throttle edit-source updates to rAF so multiple drag events in a
          // single frame coalesce.
          if (!pendingDraftRender) {
            pendingDraftRender = true;
            requestAnimationFrame(() => {
              pendingDraftRender = false;
              applyEditSourceData();
              refreshMidpointPositions();
            });
          }
        });

        marker.on("dragend", () => {
          if (selectedId !== null) editedIds.add(selectedId);
          skipMapClick = true;
          setTimeout(() => {
            skipMapClick = false;
          }, 0);
          // Final sync in case an rAF was still pending
          applyEditSourceData();
          refreshMidpointPositions();
        });

        entries.push({ marker, kind: "vertex" });
      }

      const midpoints = enumerateMidpoints(editingFeature.geometry);
      for (const m of midpoints) {
        const el = document.createElement("div");
        el.className = "glb-midpoint";
        const mpath = m.path;
        const mcoord: [number, number] = [m.coord[0], m.coord[1]];

        // Drag-to-insert: on the very first drag frame, splice a new vertex
        // into the geometry at the midpoint's insertion index and then treat
        // this marker as the new vertex for the rest of the gesture. On
        // dragend we rebuild markers — vertex/midpoint paths after the
        // insertion point have all shifted.
        let converted = false;
        const newVertexPath = mpath;

        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(m.coord)
          .addTo(map);

        marker.on("drag", () => {
          if (!editingFeature?.geometry) return;
          const ll = marker.getLngLat();
          const coord: [number, number] = [ll.lng, ll.lat];
          if (!converted) {
            converted = true;
            mutateInsertGeomVertex(editingFeature.geometry, mpath, coord);
            if (selectedId !== null) editedIds.add(selectedId);
          } else {
            mutateGeomVertex(editingFeature.geometry, newVertexPath, coord);
          }
          if (!pendingDraftRender) {
            pendingDraftRender = true;
            requestAnimationFrame(() => {
              pendingDraftRender = false;
              applyEditSourceData();
              // Don't refresh midpoint markers while this midpoint is
              // becoming a vertex — the entry array length no longer matches
              // enumerateMidpoints(). renderMarkers() on dragend restores.
            });
          }
        });

        marker.on("dragend", () => {
          skipMapClick = true;
          setTimeout(() => {
            skipMapClick = false;
          }, 0);
          if (converted) {
            applyEditSourceData();
            renderMarkers();
          }
        });

        // Pure click (no drag movement): insert at the midpoint centroid and
        // rebuild. `converted` stays false because the drag handler never
        // fired.
        el.addEventListener("click", (ev) => {
          if (converted) return;
          ev.stopPropagation();
          if (!editingFeature?.geometry) return;
          mutateInsertGeomVertex(editingFeature.geometry, mpath, mcoord);
          if (selectedId !== null) editedIds.add(selectedId);
          applyEditSourceData();
          renderMarkers();
        });

        entries.push({ marker, kind: "mid" });
      }
    };

    const select = (id: number) => {
      if (selectedId === id) return;
      deselect();
      const working = workingRef.current;
      if (!working) return;
      const feature = working.features[id];
      if (!feature?.geometry) return;

      selectedId = id;
      editingFeature = {
        ...feature,
        geometry: cloneGeometry(feature.geometry),
      };

      // Hide the feature in the main source; the edit-source shows it live
      map.setFeatureState(
        { source: FEATURES_SOURCE_ID, id },
        { editing: true }
      );
      ensureEditSource();
      applyEditSourceData();
      renderMarkers();
    };

    const mainQueryLayers = () =>
      [FEATURES_FILL_LAYER, FEATURES_LINE_LAYER, FEATURES_CIRCLE_LAYER].filter(
        (id) => !!map.getLayer(id)
      );
    const editQueryLayers = () =>
      [EDIT_FILL_LAYER, EDIT_LINE_LAYER, EDIT_CIRCLE_LAYER].filter(
        (id) => !!map.getLayer(id)
      );

    const HIT_TOLERANCE = 6;

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      if (skipMapClick) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const layers = [...mainQueryLayers(), ...editQueryLayers()];
      if (layers.length === 0) {
        deselect();
        return;
      }
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) {
        deselect();
        return;
      }
      // If the first hit is the edit-source, we clicked the currently-selected
      // feature — keep the selection as-is.
      const first = hits[0];
      if (first.source === EDIT_SOURCE_ID) return;
      const rawId = first.id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      select(id);
    };

    const canvas = map.getCanvas();
    const setHoverCursor = () => {
      canvas.style.cursor = "pointer";
    };
    const clearHoverCursor = () => {
      canvas.style.cursor = "";
    };

    const hoverLayers = mainQueryLayers();
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }

    map.on("click", onMapClick);

    return () => {
      deselect();
      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";

      if (editedIds.size > 0 && workingRef.current) {
        const features: GeoJSON.Feature[] = [];
        for (const id of editedIds) {
          const f = workingRef.current.features[id];
          if (f) features.push(f);
        }
        if (features.length > 0) onEditedRef.current(features);
      }
    };
  }, [editing, styleReady]);

  // --------------------------------------------------------------------
  // Adding mode — click to place vertices, double-click to finish.
  // Single click for Point, ≥2 for LineString, ≥3 for Polygon.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !adding) return;

    const shape = gpkgTypeToDrawShape(geometryType);
    let coords: [number, number][] = [];
    let vertexMarkers: maplibregl.Marker[] = [];
    let clickTimer: number | null = null;

    const dblZoomWasEnabled = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();

    const draftEmpty: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    map.addSource(DRAFT_SOURCE_ID, { type: "geojson", data: draftEmpty });
    map.addLayer({
      id: DRAFT_FILL_LAYER,
      type: "fill",
      source: DRAFT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": SELECTED_COLOR,
        "fill-opacity": 0.2,
      },
    });
    map.addLayer({
      id: DRAFT_LINE_LAYER,
      type: "line",
      source: DRAFT_SOURCE_ID,
      filter: [
        "any",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["geometry-type"], "Polygon"],
      ],
      paint: {
        "line-color": SELECTED_COLOR,
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });

    const updateDraftSource = () => {
      const src = map.getSource(DRAFT_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      const geom = buildDraftGeometry(shape, coords);
      src.setData(
        geom
          ? {
              type: "FeatureCollection",
              features: [
                { type: "Feature", properties: {}, geometry: geom },
              ],
            }
          : draftEmpty
      );
    };

    const clearVertexMarkers = () => {
      vertexMarkers.forEach((m) => m.remove());
      vertexMarkers = [];
    };

    const addVertexMarker = (coord: [number, number]) => {
      const el = document.createElement("div");
      el.className = "glb-vertex glb-vertex--draft";
      const marker = new maplibregl.Marker({ element: el, draggable: false })
        .setLngLat(coord)
        .addTo(map);
      vertexMarkers.push(marker);
    };

    const commit = () => {
      const minCount =
        shape === "Point" ? 1 : shape === "LineString" ? 2 : 3;
      if (coords.length < minCount) return;

      let geom: GeoJSON.Geometry;
      if (shape === "Point") {
        geom = { type: "Point", coordinates: coords[0] };
      } else if (shape === "LineString") {
        geom = { type: "LineString", coordinates: coords };
      } else {
        geom = { type: "Polygon", coordinates: [[...coords, coords[0]]] };
      }
      geom = wrapGeomToType(geom, geometryType);

      const feature: GeoJSON.Feature = {
        type: "Feature",
        properties: {},
        geometry: geom,
      };
      onAddedRef.current(feature);

      coords = [];
      clearVertexMarkers();
      updateDraftSource();
    };

    const placeVertex = (lngLat: maplibregl.LngLat) => {
      const c: [number, number] = [lngLat.lng, lngLat.lat];
      coords.push(c);
      addVertexMarker(c);
      updateDraftSource();
      if (shape === "Point") commit();
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (shape === "Point") {
        placeVertex(e.lngLat);
        return;
      }
      // Delay for a possible dblclick
      if (clickTimer !== null) return;
      const lngLat = e.lngLat;
      clickTimer = window.setTimeout(() => {
        clickTimer = null;
        placeVertex(lngLat);
      }, 220);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      commit();
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    return () => {
      if (clickTimer !== null) clearTimeout(clickTimer);
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      canvas.style.cursor = "";
      clearVertexMarkers();
      for (const layerId of [DRAFT_LINE_LAYER, DRAFT_FILL_LAYER]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(DRAFT_SOURCE_ID)) map.removeSource(DRAFT_SOURCE_ID);
      if (dblZoomWasEnabled) map.doubleClickZoom.enable();
    };
  }, [adding, geometryType, styleReady]);

  const tile = TILE_SOURCES[tileIndex];

  return (
    <div
      ref={wrapperRef}
      className="glb-wrapper relative h-full w-full overflow-hidden rounded-[var(--radius-md)]"
    >
      <div ref={containerRef} className="h-full w-full" />

      <DraggableToolbar wrapperRef={wrapperRef}>
        <select
          className="glb-tile-select"
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
        >
          {TILE_SOURCES.map((src, i) => (
            <option key={src.name} value={i}>
              {src.name}
            </option>
          ))}
        </select>
        <span className="glb-zoom-badge">Z {zoomDisplay.toFixed(1)}</span>
        <div className="glb-fs-divider" />
        <ToolbarButton
          title={adding ? "Cancel add" : "Add feature"}
          icon={ADD_ICON}
          disabled={saving || editing}
          active={adding}
          onClick={() => onToggleAddRef.current()}
        />
        <ToolbarButton
          title={editing ? "Stop editing" : "Edit vertices"}
          icon={EDIT_ICON}
          disabled={saving || adding}
          active={editing}
          onClick={() => onToggleEditRef.current()}
        />
        <ToolbarButton
          title={
            saving ? "Saving…" : dirty ? "Save edits" : "No unsaved edits"
          }
          icon={SAVE_ICON}
          disabled={saving || !dirty}
          dirty={dirty}
          onClick={() => onSaveRef.current()}
        />
        <div className="glb-fs-divider" />
        <ToolbarButton
          icon={ZOOM_IN_ICON}
          title="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        />
        <ToolbarButton
          icon={ZOOM_OUT_ICON}
          title="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        />
        <ToolbarButton
          icon={isFullscreen ? SHRINK_ICON : EXPAND_ICON}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
        />
      </DraggableToolbar>

      <p
        className="glb-attribution"
        dangerouslySetInnerHTML={{ __html: tile.attribution }}
      />
    </div>
  );
}

function ToolbarButton({
  icon,
  title,
  onClick,
  disabled,
  active,
  dirty,
}: {
  icon: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  dirty?: boolean;
}) {
  const cls = [
    "glb-btn",
    active ? "glb-btn--active" : "",
    dirty ? "glb-btn--dirty" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      title={title}
      className={cls}
      disabled={disabled}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  );
}

// Floating pill that holds all controls. Drag the padding
// area (or any non-interactive child) to move the toolbar; the first drag
// promotes it from the default bottom-center CSS layout to explicit
// absolute left/top coords via direct style mutation (no React state churn
// during drag, no JSX `style={}` that the project lint forbids).
function DraggableToolbar({
  wrapperRef,
  children,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const dragStateRef = React.useRef({
    active: false,
    startX: 0,
    startY: 0,
    offX: 0,
    offY: 0,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, option")) return;
    const toolbar = toolbarRef.current;
    const wrapper = wrapperRef.current;
    if (!toolbar || !wrapper) return;
    e.preventDefault();
    const tbRect = toolbar.getBoundingClientRect();
    const wrRect = wrapper.getBoundingClientRect();
    // Promote to absolute positioning so further drag updates use left/top
    toolbar.style.left = `${tbRect.left - wrRect.left}px`;
    toolbar.style.top = `${tbRect.top - wrRect.top}px`;
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "none";
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      offX: tbRect.left - wrRect.left,
      offY: tbRect.top - wrRect.top,
    };
    toolbar.classList.add("glb-fs-toolbar--dragging");
    toolbar.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    if (!s.active) return;
    const toolbar = toolbarRef.current;
    const wrapper = wrapperRef.current;
    if (!toolbar || !wrapper) return;
    const wrRect = wrapper.getBoundingClientRect();
    const tbRect = toolbar.getBoundingClientRect();
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const maxX = Math.max(0, wrRect.width - tbRect.width);
    const maxY = Math.max(0, wrRect.height - tbRect.height);
    const nx = Math.max(0, Math.min(maxX, s.offX + dx));
    const ny = Math.max(0, Math.min(maxY, s.offY + dy));
    toolbar.style.left = `${nx}px`;
    toolbar.style.top = `${ny}px`;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStateRef.current;
    if (!s.active) return;
    s.active = false;
    toolbarRef.current?.releasePointerCapture(e.pointerId);
    toolbarRef.current?.classList.remove("glb-fs-toolbar--dragging");
  };

  return (
    <div
      ref={toolbarRef}
      className="glb-fs-toolbar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}
