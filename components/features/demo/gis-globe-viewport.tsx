"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import maplibregl, {
  type Map as MLMap,
  type StyleSpecification,
  type LngLatBoundsLike,
  type RasterSourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fromArrayBuffer } from "geotiff";
import type { GeoJSONFeatureCollection } from "@/lib/gpkg";
import {
  FclassInfoCard,
  type FclassCardState,
} from "@/components/features/gis/fclass-info-card";
import {
  getCachedFclassInfo,
  loadFclassInfo,
  themeFromLayerId,
} from "@/lib/osm/fclass-info";

type TileGroup = "Satellite" | "Color" | "LightNoColor" | "Dark";

type TileSource = {
  name: string;
  tiles: string[];
  attribution: string;
  maxZoom: number;
  tileSize?: number;
  group: TileGroup;
};

const TILE_GROUP_LABEL: Record<TileGroup, string> = {
  Satellite: "Satellite",
  Color: "Color maps",
  LightNoColor: "Light maps",
  Dark: "Dark maps",
};

const TILE_GROUP_ORDER: TileGroup[] = [
  "Satellite",
  "Color",
  "LightNoColor",
  "Dark",
];

const TILE_SOURCES: TileSource[] = [
  {
    name: "Esri Satellite",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
    group: "Satellite",
  },
  {
    name: "Esri Satellite + Labels",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 18,
    group: "Satellite",
  },
  {
    name: "Google Satellite",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
    group: "Satellite",
  },
  {
    name: "Google Hybrid",
    tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
    group: "Satellite",
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
    group: "Color",
  },
  {
    name: "Google Streets",
    tiles: ["https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
    group: "Color",
  },
  {
    name: "Google Terrain",
    tiles: ["https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"],
    attribution: "&copy; Google",
    maxZoom: 22,
    group: "Color",
  },
  {
    name: "Esri Street",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
    group: "Color",
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
    group: "Color",
  },
  {
    name: "Esri Topo",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
    group: "Color",
  },
  {
    name: "Esri NatGeo",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri &mdash; National Geographic",
    maxZoom: 16,
    group: "Color",
  },
  {
    name: "Esri Ocean",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 13,
    group: "Color",
  },
  {
    name: "Esri Light Gray",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
    group: "LightNoColor",
  },
  {
    name: "Esri Dark Gray",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; Esri",
    maxZoom: 16,
    group: "Dark",
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
    group: "LightNoColor",
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
    group: "Dark",
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
    group: "LightNoColor",
  },
  {
    name: "USGS Imagery",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; USGS",
    maxZoom: 16,
    group: "Satellite",
  },
  {
    name: "USGS Topo",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Tiles &copy; USGS",
    maxZoom: 16,
    group: "Color",
  },
  {
    name: "Wikimedia",
    tiles: ["https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png"],
    attribution:
      "&copy; <a href='https://wikimediafoundation.org/'>Wikimedia</a>, &copy; OpenStreetMap contributors",
    maxZoom: 19,
    group: "Color",
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

// Read-only vertex preview painted on top of the simplify-mode edit-source.
// Using a circle layer (not Markers) keeps redraws cheap when the slider is
// moving — the source's setData call is the only per-tick work.
const SIMPLIFY_VERTS_SOURCE_ID = "simplify-verts-source";
const SIMPLIFY_VERTS_LAYER = "simplify-verts-layer";

// Colored 2D overlay rendered from a saved DEM .tif. The image is decoded
// from a Float32 GeoTIFF on the client and added as an `image` source.
const DEM_OVERLAY_SOURCE_ID = "dem-overlay-source";
const DEM_OVERLAY_LAYER = "dem-overlay-layer";

// Live raster-dem source used for MapLibre's 3D terrain. Two modes:
// - No DEM selected → tiles fetched directly from AWS Terrarium.
// - DEM selected → tiles fetched from /api/gis/dem-tiles/<name>/{z}/{x}/{y},
//   which serves the local terrain-rgb pyramid where it has data and
//   transparently proxies AWS Terrarium for tiles outside that area.
const AWS_TERRAIN_SOURCE_ID = "aws-terrain-source";
const LOCAL_TERRAIN_SOURCE_ID = "local-terrain-source";
const AWS_TERRAIN_TILES =
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

// Live preview rectangle drawn while the user is configuring a DEM
// download in the modal — updates as the padding slider moves.
const DEM_PREVIEW_SOURCE_ID = "dem-preview-source";
const DEM_PREVIEW_FILL_LAYER = "dem-preview-fill";
const DEM_PREVIEW_LINE_LAYER = "dem-preview-line";

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;

const FEATURE_COLOR = "#facc15";
const DIRTY_COLOR = "#f97316";
const SELECTED_COLOR = "#3b82f6";

// Build a paint-color expression that picks per-feature color from:
//   1. `fclass` property (when any layer supplies an fclass palette)
//   2. `__layer` property (falls back to per-layer color)
//   3. FEATURE_COLOR default
// DIRTY_COLOR overrides all when `__dirty` is set.
function buildLayerColorExpression(
  layers: ReadonlyArray<LayerStyle> | undefined
): maplibregl.ExpressionSpecification {
  const byLayer =
    layers && layers.length > 0
      ? ([
          "match",
          ["coalesce", ["get", "__layer"], "__none__"],
          ...layers.flatMap((l) => [l.id, l.color]),
          FEATURE_COLOR,
        ] as unknown as maplibregl.ExpressionSpecification)
      : (FEATURE_COLOR as unknown as maplibregl.ExpressionSpecification);

  const fclassPairs: string[] = [];
  const seen = new Set<string>();
  for (const l of layers ?? []) {
    for (const fc of l.fclasses ?? []) {
      if (seen.has(fc.value)) continue;
      seen.add(fc.value);
      fclassPairs.push(fc.value, fc.color);
    }
  }

  const byFclass =
    fclassPairs.length > 0
      ? ([
          "match",
          ["to-string", ["coalesce", ["get", "fclass"], "__none__"]],
          ...fclassPairs,
          byLayer,
        ] as unknown as maplibregl.ExpressionSpecification)
      : byLayer;

  return [
    "case",
    ["==", ["coalesce", ["get", "__dirty"], 0], 1],
    DIRTY_COLOR,
    byFclass,
  ] as unknown as maplibregl.ExpressionSpecification;
}

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

// Spherical-Mercator → lng/lat (used to map a saved DEM's pixel extent
// back to a MapLibre `image` source's lng/lat coordinates).
const MERC_HALF = 20037508.342789244;
function mercToLngLat(x: number, y: number): [number, number] {
  const lng = (x / MERC_HALF) * 180;
  const lat =
    (Math.atan(Math.exp((y / MERC_HALF) * Math.PI)) * 360) / Math.PI - 90;
  return [lng, lat];
}

// Swappable color ramps. Each is a sorted list of (t, [r,g,b]) stops
// keyed on a normalized 0..1 elevation value, sampled by `ramp()`.
type RampStops = ReadonlyArray<readonly [number, readonly [number, number, number]]>;
export type RampName =
  | "hypsometric"
  | "viridis"
  | "grayscale"
  | "magma"
  | "plasma"
  | "cividis"
  | "turbo"
  | "spectral"
  | "terrain";
const RAMPS: Record<RampName, RampStops> = {
  // Blue (water) → green (lowlands) → yellow → brown → white (peaks).
  hypsometric: [
    [0.0, [56, 96, 168]],
    [0.05, [110, 158, 200]],
    [0.2, [120, 180, 110]],
    [0.45, [220, 200, 120]],
    [0.75, [150, 100, 70]],
    [1.0, [255, 255, 255]],
  ],
  // Perceptually-uniform purple → blue → green → yellow.
  viridis: [
    [0.0, [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5, [33, 144, 141]],
    [0.75, [94, 201, 98]],
    [1.0, [253, 231, 37]],
  ],
  grayscale: [
    [0.0, [20, 20, 20]],
    [1.0, [240, 240, 240]],
  ],
  // Perceptually-uniform black → purple → red → orange → yellow.
  magma: [
    [0.0, [0, 0, 4]],
    [0.25, [80, 18, 123]],
    [0.5, [182, 54, 121]],
    [0.75, [251, 136, 97]],
    [1.0, [252, 253, 191]],
  ],
  // Perceptually-uniform dark purple → magenta → orange → yellow.
  plasma: [
    [0.0, [13, 8, 135]],
    [0.25, [126, 3, 168]],
    [0.5, [204, 71, 120]],
    [0.75, [248, 149, 64]],
    [1.0, [240, 249, 33]],
  ],
  // Colorblind-friendly perceptually-uniform dark blue → tan → yellow.
  cividis: [
    [0.0, [0, 32, 76]],
    [0.25, [55, 75, 110]],
    [0.5, [124, 124, 120]],
    [0.75, [186, 178, 100]],
    [1.0, [254, 232, 56]],
  ],
  // Google's improved rainbow (perceptually better than Jet).
  turbo: [
    [0.0, [48, 18, 59]],
    [0.13, [70, 107, 227]],
    [0.25, [54, 170, 248]],
    [0.38, [26, 219, 196]],
    [0.5, [88, 250, 95]],
    [0.63, [201, 233, 47]],
    [0.75, [254, 165, 49]],
    [0.88, [233, 76, 31]],
    [1.0, [122, 4, 3]],
  ],
  // Diverging blue → white → red, oriented low→high (cool→warm).
  spectral: [
    [0.0, [94, 79, 162]],
    [0.1, [50, 136, 189]],
    [0.2, [102, 194, 165]],
    [0.3, [171, 221, 164]],
    [0.4, [230, 245, 152]],
    [0.5, [255, 255, 191]],
    [0.6, [254, 224, 139]],
    [0.7, [253, 174, 97]],
    [0.8, [244, 109, 67]],
    [0.9, [213, 62, 79]],
    [1.0, [158, 1, 66]],
  ],
  // Matplotlib-style "terrain" with bathymetric blues at the bottom.
  terrain: [
    [0.0, [51, 51, 153]],
    [0.15, [51, 102, 204]],
    [0.25, [102, 204, 204]],
    [0.4, [102, 204, 102]],
    [0.55, [204, 204, 102]],
    [0.7, [204, 102, 51]],
    [0.85, [153, 102, 51]],
    [1.0, [255, 255, 255]],
  ],
};

// Ramp render order for the inline picker — most useful first.
const RAMP_ORDER: ReadonlyArray<RampName> = [
  "hypsometric",
  "terrain",
  "spectral",
  "viridis",
  "magma",
  "plasma",
  "cividis",
  "turbo",
  "grayscale",
];

function formatElev(v: number): string {
  // 1-decimal for magnitudes under 100 m so small surveys read as e.g.
  // "3.4" rather than "3"; integer otherwise to keep the legend compact.
  return Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toString();
}

function rampToCssGradient(name: RampName): string {
  const stops = RAMPS[name];
  const parts = stops.map(
    ([t, [r, g, b]]) => `rgb(${r},${g},${b}) ${(t * 100).toFixed(1)}%`
  );
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

function ramp(t: number, name: keyof typeof RAMPS): [number, number, number] {
  const stops = RAMPS[name];
  if (t <= stops[0][0]) return [...stops[0][1]] as [number, number, number];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return [...last[1]] as [number, number, number];
  for (let i = 1; i < stops.length; i++) {
    const [tA, cA] = stops[i - 1];
    const [tB, cB] = stops[i];
    if (t <= tB) {
      const f = (t - tA) / (tB - tA);
      return [
        cA[0] + (cB[0] - cA[0]) * f,
        cA[1] + (cB[1] - cA[1]) * f,
        cA[2] + (cB[2] - cA[2]) * f,
      ];
    }
  }
  return [...last[1]] as [number, number, number];
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

// ---------------------------------------------------------------------------
// Ramer–Douglas–Peucker simplification. The threshold is "perpendicular
// distance from the segment between two kept neighbours" — when a vertex
// falls inside that band the three points are considered nearly collinear
// and the middle one drops out. Operates in raw lng/lat space, which is
// fine for the interactive preview since the per-feature bbox diagonal is
// what scales the slider.
// ---------------------------------------------------------------------------

function perpendicularDistanceSq(
  p: GeoJSON.Position,
  a: GeoJSON.Position,
  b: GeoJSON.Position
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return ex * ex + ey * ey;
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  const ex = p[0] - cx;
  const ey = p[1] - cy;
  return ex * ex + ey * ey;
}

function rdpSimplify(
  points: GeoJSON.Position[],
  tolSq: number
): GeoJSON.Position[] {
  if (points.length < 3 || tolSq <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [i0, i1] = stack.pop()!;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perpendicularDistanceSq(points[i], points[i0], points[i1]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx !== -1 && maxDist > tolSq) {
      keep[maxIdx] = 1;
      stack.push([i0, maxIdx]);
      stack.push([maxIdx, i1]);
    }
  }
  const result: GeoJSON.Position[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

function simplifyRing(
  ring: GeoJSON.Position[],
  tolSq: number
): GeoJSON.Position[] {
  if (ring.length <= 4) return ring;
  const next = rdpSimplify(ring, tolSq);
  // A polygon ring needs ≥4 points (3 unique + closure). Bail out if
  // simplification would collapse it past that floor.
  if (next.length < 4) return ring;
  const first = next[0];
  const last = next[next.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    next.push([first[0], first[1]]);
  }
  return next;
}

function simplifyGeometry(
  geom: GeoJSON.Geometry,
  tolerance: number
): GeoJSON.Geometry {
  if (tolerance <= 0) return geom;
  const tolSq = tolerance * tolerance;
  switch (geom.type) {
    case "LineString": {
      const next = rdpSimplify(geom.coordinates, tolSq);
      return next.length >= 2 ? { ...geom, coordinates: next } : geom;
    }
    case "MultiLineString":
      return {
        ...geom,
        coordinates: geom.coordinates.map((line) => {
          const next = rdpSimplify(line, tolSq);
          return next.length >= 2 ? next : line;
        }),
      };
    case "Polygon":
      return {
        ...geom,
        coordinates: geom.coordinates.map((ring) => simplifyRing(ring, tolSq)),
      };
    case "MultiPolygon":
      return {
        ...geom,
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => simplifyRing(ring, tolSq))
        ),
      };
    default:
      return geom;
  }
}

// Chaikin's corner-cutting subdivision. For an open polyline, endpoints are
// preserved; each interior edge is replaced by two points at 25% and 75%.
// For a closed ring, the algorithm wraps around.
// Laplacian smoothing: each vertex moves toward the average of its
// neighbors by factor `alpha`. Repeated iterations progressively iron out
// noise and pull the shape toward a smooth blob. Vertex count stays
// constant (unlike Chaikin which subdivides). Endpoints are preserved for
// open polylines; rings wrap around naturally.
function smoothLine(
  coords: GeoJSON.Position[],
  iterations: number
): GeoJSON.Position[] {
  if (iterations <= 0 || coords.length < 3) return coords;
  const alpha = 0.5;
  let pts = coords.map((p) => [p[0], p[1]] as [number, number]);
  for (let iter = 0; iter < iterations; iter++) {
    const next: [number, number][] = pts.map((p) => [p[0], p[1]]);
    // Skip first and last (preserve endpoints)
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const nxt = pts[i + 1];
      const avg0 = (prev[0] + nxt[0]) / 2;
      const avg1 = (prev[1] + nxt[1]) / 2;
      next[i] = [
        curr[0] + alpha * (avg0 - curr[0]),
        curr[1] + alpha * (avg1 - curr[1]),
      ];
    }
    pts = next;
  }
  return pts;
}

function smoothRing(
  ring: GeoJSON.Position[],
  iterations: number
): GeoJSON.Position[] {
  if (iterations <= 0 || ring.length < 4) return ring;
  const alpha = 0.5;
  // Drop closure point
  let pts = ring.slice(0, -1).map((p) => [p[0], p[1]] as [number, number]);
  const n = pts.length;
  for (let iter = 0; iter < iterations; iter++) {
    const next: [number, number][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const nxt = pts[(i + 1) % n];
      const avg0 = (prev[0] + nxt[0]) / 2;
      const avg1 = (prev[1] + nxt[1]) / 2;
      next[i] = [
        curr[0] + alpha * (avg0 - curr[0]),
        curr[1] + alpha * (avg1 - curr[1]),
      ];
    }
    pts = next;
  }
  pts.push([pts[0][0], pts[0][1]]); // re-close
  return pts;
}

function smoothGeometry(
  geom: GeoJSON.Geometry,
  iterations: number
): GeoJSON.Geometry {
  if (iterations <= 0) return geom;
  switch (geom.type) {
    case "LineString":
      return { ...geom, coordinates: smoothLine(geom.coordinates, iterations) };
    case "MultiLineString":
      return {
        ...geom,
        coordinates: geom.coordinates.map((line) => smoothLine(line, iterations)),
      };
    case "Polygon":
      return {
        ...geom,
        coordinates: geom.coordinates.map((ring) => smoothRing(ring, iterations)),
      };
    case "MultiPolygon":
      return {
        ...geom,
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => smoothRing(ring, iterations))
        ),
      };
    default:
      return geom;
  }
}

// ---------------------------------------------------------------------------
// Auto-polygon (region grow) utilities. The auto-polygon tool samples the
// rendered satellite pixels inside a user-picked reference polygon to build a
// color signature, then BFS-flood-fills from a second click point accepting
// neighbor pixels whose RGB distance from the signature mean sits under a
// tolerance derived from the signature's own per-channel standard deviation.
// The grown mask is outlined via Moore-neighborhood boundary tracing, the
// pixel contour is simplified with RDP and unprojected back to lng/lat.
// ---------------------------------------------------------------------------

type AutoPolySignature = {
  // Reference color in linear 0..255 space.
  meanR: number;
  meanG: number;
  meanB: number;
  // Per-channel standard deviation; used to scale the matching tolerance so
  // uniform regions (e.g. water) match tightly while noisy ones (mottled
  // forest) stay permissive.
  stdR: number;
  stdG: number;
  stdB: number;
  // Sample count; purely informational, handy for debugging.
  samples: number;
};

type AutoPolyMask = {
  mask: Uint8Array;
  // Absolute (full-canvas) pixel bbox of accepted pixels, inclusive.
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  // Dimensions of the `mask` buffer — matches (maxX-minX+1) × (maxY-minY+1).
  width: number;
  height: number;
};

// Standard ray-casting point-in-polygon test operating on a planar ring in
// canvas pixel space. The ring is open (not explicitly closed); the test
// treats index N as wrapping back to index 0.
function canvasPointInRing(
  x: number,
  y: number,
  ring: ReadonlyArray<[number, number]>
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringPixelBounds(
  ring: ReadonlyArray<[number, number]>,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  minX = Math.max(0, Math.floor(minX));
  minY = Math.max(0, Math.floor(minY));
  maxX = Math.min(width - 1, Math.ceil(maxX));
  maxY = Math.min(height - 1, Math.ceil(maxY));
  return { minX, minY, maxX, maxY };
}

function sampleSignatureInsideRing(
  image: ImageData,
  ring: ReadonlyArray<[number, number]>
): AutoPolySignature | null {
  const { width, height, data } = image;
  const { minX, minY, maxX, maxY } = ringPixelBounds(ring, width, height);
  if (maxX <= minX || maxY <= minY) return null;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumR2 = 0;
  let sumG2 = 0;
  let sumB2 = 0;
  let count = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!canvasPointInRing(x + 0.5, y + 0.5, ring)) continue;
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      sumR2 += r * r;
      sumG2 += g * g;
      sumB2 += b * b;
      count++;
    }
  }

  if (count < 16) return null;

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const varR = Math.max(0, sumR2 / count - meanR * meanR);
  const varG = Math.max(0, sumG2 / count - meanG * meanG);
  const varB = Math.max(0, sumB2 / count - meanB * meanB);

  return {
    meanR,
    meanG,
    meanB,
    stdR: Math.sqrt(varR),
    stdG: Math.sqrt(varG),
    stdB: Math.sqrt(varB),
    samples: count,
  };
}

// Sample pixels inside a narrow corridor of `halfWidth` pixels around a
// polyline, producing the same RGB mean/stddev signature used by the polygon
// sampler. Disks are stamped along each segment with sub-pixel stepping and a
// visited mask prevents double counting in the overlap zones between adjacent
// segments.
function sampleSignatureAlongLine(
  image: ImageData,
  linePix: ReadonlyArray<[number, number]>,
  halfWidth: number
): AutoPolySignature | null {
  if (linePix.length < 2) return null;
  const { width, height, data } = image;
  const visited = new Uint8Array(width * height);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumR2 = 0;
  let sumG2 = 0;
  let sumB2 = 0;
  let count = 0;
  const hwSq = halfWidth * halfWidth;

  const stamp = (cx: number, cy: number): void => {
    for (let oy = -halfWidth; oy <= halfWidth; oy++) {
      for (let ox = -halfWidth; ox <= halfWidth; ox++) {
        if (ox * ox + oy * oy > hwSq) continue;
        const px = cx + ox;
        const py = cy + oy;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const flat = py * width + px;
        if (visited[flat]) continue;
        visited[flat] = 1;
        const idx = flat * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sumR += r;
        sumG += g;
        sumB += b;
        sumR2 += r * r;
        sumG2 += g * g;
        sumB2 += b * b;
        count++;
      }
    }
  };

  for (let i = 0; i < linePix.length - 1; i++) {
    const [ax, ay] = linePix[i];
    const [bx, by] = linePix[i + 1];
    const len = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let t = 0; t <= len; t++) {
      const fx = ax + ((bx - ax) * t) / len;
      const fy = ay + ((by - ay) * t) / len;
      stamp(Math.round(fx), Math.round(fy));
    }
  }

  if (count < 16) return null;

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const varR = Math.max(0, sumR2 / count - meanR * meanR);
  const varG = Math.max(0, sumG2 / count - meanG * meanG);
  const varB = Math.max(0, sumB2 / count - meanB * meanB);

  return {
    meanR,
    meanG,
    meanB,
    stdR: Math.sqrt(varR),
    stdG: Math.sqrt(varG),
    stdB: Math.sqrt(varB),
    samples: count,
  };
}

// Minimal binary min-heap keyed on a numeric priority. Used by the A*
// least-cost path solver below. Payloads are arbitrary (here: Int32 pixel
// indices) but the heap is typed as generic `number[]` to keep the shape
// simple — no class, just two parallel arrays wrapped by closures.
type MinHeap = {
  push: (priority: number, payload: number) => void;
  pop: () => number;
  size: () => number;
};

function createMinHeap(): MinHeap {
  const keys: number[] = [];
  const vals: number[] = [];
  const up = (start: number): void => {
    let i = start;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= keys[i]) break;
      const tk = keys[p];
      const tv = vals[p];
      keys[p] = keys[i];
      vals[p] = vals[i];
      keys[i] = tk;
      vals[i] = tv;
      i = p;
    }
  };
  const down = (start: number): void => {
    let i = start;
    const n = keys.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let s = i;
      if (l < n && keys[l] < keys[s]) s = l;
      if (r < n && keys[r] < keys[s]) s = r;
      if (s === i) break;
      const tk = keys[s];
      const tv = vals[s];
      keys[s] = keys[i];
      vals[s] = vals[i];
      keys[i] = tk;
      vals[i] = tv;
      i = s;
    }
  };
  return {
    push(priority, payload) {
      keys.push(priority);
      vals.push(payload);
      up(keys.length - 1);
    },
    pop() {
      const v = vals[0];
      const lastK = keys.pop();
      const lastV = vals.pop();
      if (keys.length > 0 && lastK !== undefined && lastV !== undefined) {
        keys[0] = lastK;
        vals[0] = lastV;
        down(0);
      }
      return v;
    },
    size() {
      return keys.length;
    },
  };
}

// A* over the 8-connected pixel grid between `start` and `end`, bounded to
// the bbox of the two endpoints padded by a fraction of their separation so
// the path can bow around obstacles. Per-pixel cost is derived from the RGB
// distance to the signature — on-signature pixels have near-baseline cost,
// off-signature pixels are penalized quadratically. Returns the pixel path
// in absolute canvas coordinates, or null if no path fits in the bbox.
function astarLeastCostPath(
  image: ImageData,
  signature: AutoPolySignature,
  toleranceMul: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  paintMask?: { data: Uint8Array; width: number; height: number } | null
): [number, number][] | null {
  const W = image.width;
  const H = image.height;
  if (
    startX < 0 ||
    startY < 0 ||
    endX < 0 ||
    endY < 0 ||
    startX >= W ||
    startY >= H ||
    endX >= W ||
    endY >= H
  ) {
    return null;
  }

  // When a paint mask is provided, use its tight bounding box (expanded to
  // include both endpoints) instead of the default endpoint-derived bbox.
  // This lets the search follow long curving corridors that would exceed the
  // default 1.5M pixel cap.
  let bboxMinX: number;
  let bboxMaxX: number;
  let bboxMinY: number;
  let bboxMaxY: number;
  if (paintMask && paintMask.data.length > 0) {
    // Scan the mask for its tight bbox.
    let mMinX = paintMask.width;
    let mMinY = paintMask.height;
    let mMaxX = 0;
    let mMaxY = 0;
    for (let y = 0; y < paintMask.height; y++) {
      for (let x = 0; x < paintMask.width; x++) {
        if (paintMask.data[y * paintMask.width + x]) {
          if (x < mMinX) mMinX = x;
          if (x > mMaxX) mMaxX = x;
          if (y < mMinY) mMinY = y;
          if (y > mMaxY) mMaxY = y;
        }
      }
    }
    if (mMaxX < mMinX) return null; // empty mask
    // Expand to include both endpoints.
    bboxMinX = Math.max(0, Math.min(mMinX, startX, endX));
    bboxMaxX = Math.min(W - 1, Math.max(mMaxX, startX, endX));
    bboxMinY = Math.max(0, Math.min(mMinY, startY, endY));
    bboxMaxY = Math.min(H - 1, Math.max(mMaxY, startY, endY));
  } else {
    const span = Math.hypot(endX - startX, endY - startY);
    const pad = Math.max(40, Math.round(span * 0.35));
    bboxMinX = Math.max(0, Math.min(startX, endX) - pad);
    bboxMaxX = Math.min(W - 1, Math.max(startX, endX) + pad);
    bboxMinY = Math.max(0, Math.min(startY, endY) - pad);
    bboxMaxY = Math.min(H - 1, Math.max(startY, endY) + pad);
  }
  const bw = bboxMaxX - bboxMinX + 1;
  const bh = bboxMaxY - bboxMinY + 1;
  const N = bw * bh;
  // Guard against runaway searches.
  if (N > 4_000_000) return null;

  const baseline = 18;
  const stdTerm = Math.hypot(signature.stdR, signature.stdG, signature.stdB);
  const threshold = Math.max(8, toleranceMul * (baseline + stdTerm));
  // Squared form saves the sqrt in the hot loop.
  const thresholdSq = threshold * threshold;
  // Penalty scale — bigger K = steeper cliff at the threshold and a path
  // that tries harder to stay on-signature.
  const K = 80;

  const WALL = 1e9;
  const pixCost = new Float32Array(N);
  for (let y = 0; y < bh; y++) {
    const sy = y + bboxMinY;
    for (let x = 0; x < bw; x++) {
      const sx = x + bboxMinX;
      // Pixels outside the paint mask are impassable walls.
      if (
        paintMask &&
        (sx >= paintMask.width ||
          sy >= paintMask.height ||
          !paintMask.data[sy * paintMask.width + sx])
      ) {
        pixCost[y * bw + x] = WALL;
        continue;
      }
      const idx = (sy * W + sx) * 4;
      const dr = image.data[idx] - signature.meanR;
      const dg = image.data[idx + 1] - signature.meanG;
      const db = image.data[idx + 2] - signature.meanB;
      const dsq = dr * dr + dg * dg + db * db;
      const norm = dsq / thresholdSq;
      pixCost[y * bw + x] = 1 + K * norm;
    }
  }

  const gScore = new Float32Array(N);
  gScore.fill(Infinity);
  const parent = new Int32Array(N);
  parent.fill(-1);
  const closed = new Uint8Array(N);

  const localStartX = startX - bboxMinX;
  const localStartY = startY - bboxMinY;
  const localEndX = endX - bboxMinX;
  const localEndY = endY - bboxMinY;
  const startFlat = localStartY * bw + localStartX;
  const endFlat = localEndY * bw + localEndX;

  gScore[startFlat] = 0;
  const heap = createMinHeap();
  heap.push(0, startFlat);

  const NDX = [1, -1, 0, 0, 1, 1, -1, -1];
  const NDY = [0, 0, 1, -1, 1, -1, 1, -1];
  const NSTEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  // Iteration cap scales with the bbox — ~3× the pixel count is generous
  // while still bounding the worst case on a tainted or tangled search.
  const MAX_ITER = N * 3;
  let iter = 0;
  let found = false;
  while (heap.size() > 0) {
    if (++iter > MAX_ITER) break;
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === endFlat) {
      found = true;
      break;
    }
    const cx = cur % bw;
    const cy = (cur - cx) / bw;
    const curCost = pixCost[cur];
    const curG = gScore[cur];
    for (let k = 0; k < 8; k++) {
      const nx = cx + NDX[k];
      const ny = cy + NDY[k];
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const nflat = ny * bw + nx;
      if (closed[nflat]) continue;
      const step = NSTEP[k] * 0.5 * (curCost + pixCost[nflat]);
      const tentative = curG + step;
      if (tentative < gScore[nflat]) {
        gScore[nflat] = tentative;
        parent[nflat] = cur;
        const hx = localEndX - nx;
        const hy = localEndY - ny;
        // Heuristic: Euclidean distance × 1 (minimum edge cost), admissible.
        const h = Math.sqrt(hx * hx + hy * hy);
        heap.push(tentative + h, nflat);
      }
    }
  }

  if (!found) return null;

  const path: [number, number][] = [];
  let c = endFlat;
  for (let guard = 0; guard < N; guard++) {
    const x = c % bw;
    const y = (c - x) / bw;
    path.push([x + bboxMinX, y + bboxMinY]);
    if (c === startFlat) break;
    const p = parent[c];
    if (p < 0) break;
    c = p;
  }
  path.reverse();
  return path.length >= 2 ? path : null;
}

// ---------------------------------------------------------------------------
// Frangi vesselness filter. Detects elongated tubular structures (roads,
// tracks, rivers) in grayscale imagery via multi-scale Hessian eigenanalysis.
// Returns a [0..1] Float32Array where 1 = strong tubular response.
// ---------------------------------------------------------------------------

// Separable 1D Gaussian convolution (horizontal or vertical pass). Writes
// result into `dst`. `srcW`/`srcH` are image dimensions; `vertical` flips
// the axis so the same function handles both passes.
function gaussConvolve1D(
  src: Float32Array,
  dst: Float32Array,
  srcW: number,
  srcH: number,
  kernel: Float32Array,
  vertical: boolean
): void {
  const r = (kernel.length - 1) / 2;
  const w = srcW;
  const h = srcH;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        let sx: number;
        let sy: number;
        if (vertical) {
          sx = x;
          sy = Math.min(h - 1, Math.max(0, y + k));
        } else {
          sx = Math.min(w - 1, Math.max(0, x + k));
          sy = y;
        }
        sum += src[sy * w + sx] * kernel[k + r];
      }
      dst[y * w + x] = sum;
    }
  }
}

function computeVesselnessMap(
  image: ImageData,
  sigmaMin: number,
  sigmaMax: number,
  sigmaSteps: number,
  paintMask?: { data: Uint8Array; width: number; height: number } | null
): Float32Array {
  const W = image.width;
  const H = image.height;
  const N = W * H;

  // Grayscale conversion
  const gray = new Float32Array(N);
  const d = image.data;
  for (let i = 0; i < N; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
  }

  const vesselness = new Float32Array(N);
  const beta = 0.5;
  const betaSq2 = 2 * beta * beta;
  const C = 15.0;
  const cSq2 = 2 * C * C;

  // Temporary buffers for convolutions
  const tmp1 = new Float32Array(N);
  const ixx = new Float32Array(N);
  const iyy = new Float32Array(N);
  const ixy = new Float32Array(N);

  // Build Gaussian derivative kernels for a given sigma
  const makeKernels = (sigma: number) => {
    const r = Math.ceil(3 * sigma);
    const len = 2 * r + 1;
    const g = new Float32Array(len);
    const gp = new Float32Array(len); // first derivative
    const gpp = new Float32Array(len); // second derivative
    const s2 = sigma * sigma;
    const s4 = s2 * s2;
    let gSum = 0;
    for (let k = -r; k <= r; k++) {
      const t = k;
      const e = Math.exp(-(t * t) / (2 * s2));
      g[k + r] = e;
      gp[k + r] = (-t / s2) * e;
      gpp[k + r] = ((t * t - s2) / s4) * e;
      gSum += e;
    }
    // Normalize G so it sums to 1 (smoothing kernel).
    for (let i = 0; i < len; i++) g[i] /= gSum;
    // Scale derivative kernels by sigma^2 for Lindeberg normalization.
    for (let i = 0; i < len; i++) {
      gp[i] *= s2;
      gpp[i] *= s2;
    }
    return { g, gp, gpp };
  };

  for (let si = 0; si < sigmaSteps; si++) {
    const sigma =
      sigmaSteps === 1
        ? sigmaMin
        : sigmaMin *
          Math.pow(sigmaMax / sigmaMin, si / (sigmaSteps - 1));
    const { g, gp, gpp } = makeKernels(sigma);

    // Ixx = Gpp(x) * G(y)
    gaussConvolve1D(gray, tmp1, W, H, gpp, false);
    gaussConvolve1D(tmp1, ixx, W, H, g, true);

    // Iyy = G(x) * Gpp(y)
    gaussConvolve1D(gray, tmp1, W, H, g, false);
    gaussConvolve1D(tmp1, iyy, W, H, gpp, true);

    // Ixy = Gp(x) * Gp(y)
    gaussConvolve1D(gray, tmp1, W, H, gp, false);
    gaussConvolve1D(tmp1, ixy, W, H, gp, true);

    // Eigenvalue decomposition + vesselness per pixel
    for (let i = 0; i < N; i++) {
      // Skip pixels outside the mask
      if (paintMask && !paintMask.data[i]) continue;

      const a = ixx[i];
      const b = ixy[i];
      const cc = iyy[i];
      const trace = a + cc;
      const det = a * cc - b * b;
      const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
      let l1 = (trace + disc) / 2;
      let l2 = (trace - disc) / 2;
      // Order by absolute value: |l1| >= |l2|
      if (Math.abs(l1) < Math.abs(l2)) {
        const tmp = l1;
        l1 = l2;
        l2 = tmp;
      }
      // Skip near-zero response (background)
      if (Math.abs(l1) < 1e-6) continue;

      const rb = l2 / l1;
      const s2v = l1 * l1 + l2 * l2;
      const v =
        Math.exp(-(rb * rb) / betaSq2) *
        (1 - Math.exp(-s2v / cSq2));
      if (v > vesselness[i]) vesselness[i] = v;
    }
  }

  return vesselness;
}

// A* on a vesselness cost field. High vesselness = low traversal cost.
// Structurally identical to astarLeastCostPath but with a different cost
// function that doesn't depend on a color signature.
function astarVesselnessPath(
  vesselness: Float32Array,
  imgWidth: number,
  imgHeight: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  paintMask?: { data: Uint8Array; width: number; height: number } | null
): [number, number][] | null {
  if (
    startX < 0 ||
    startY < 0 ||
    endX < 0 ||
    endY < 0 ||
    startX >= imgWidth ||
    startY >= imgHeight ||
    endX >= imgWidth ||
    endY >= imgHeight
  ) {
    return null;
  }

  let bboxMinX: number;
  let bboxMaxX: number;
  let bboxMinY: number;
  let bboxMaxY: number;
  if (paintMask && paintMask.data.length > 0) {
    let mMinX = paintMask.width;
    let mMinY = paintMask.height;
    let mMaxX = 0;
    let mMaxY = 0;
    for (let y = 0; y < paintMask.height; y++) {
      for (let x = 0; x < paintMask.width; x++) {
        if (paintMask.data[y * paintMask.width + x]) {
          if (x < mMinX) mMinX = x;
          if (x > mMaxX) mMaxX = x;
          if (y < mMinY) mMinY = y;
          if (y > mMaxY) mMaxY = y;
        }
      }
    }
    if (mMaxX < mMinX) return null;
    bboxMinX = Math.max(0, Math.min(mMinX, startX, endX));
    bboxMaxX = Math.min(imgWidth - 1, Math.max(mMaxX, startX, endX));
    bboxMinY = Math.max(0, Math.min(mMinY, startY, endY));
    bboxMaxY = Math.min(imgHeight - 1, Math.max(mMaxY, startY, endY));
  } else {
    const span = Math.hypot(endX - startX, endY - startY);
    const pad = Math.max(40, Math.round(span * 0.35));
    bboxMinX = Math.max(0, Math.min(startX, endX) - pad);
    bboxMaxX = Math.min(imgWidth - 1, Math.max(startX, endX) + pad);
    bboxMinY = Math.max(0, Math.min(startY, endY) - pad);
    bboxMaxY = Math.min(imgHeight - 1, Math.max(startY, endY) + pad);
  }
  const bw = bboxMaxX - bboxMinX + 1;
  const bh = bboxMaxY - bboxMinY + 1;
  const NN = bw * bh;
  if (NN > 4_000_000) return null;

  const WALL = 1e9;
  const K = 80;
  const pixCost = new Float32Array(NN);
  for (let y = 0; y < bh; y++) {
    const sy = y + bboxMinY;
    for (let x = 0; x < bw; x++) {
      const sx = x + bboxMinX;
      if (
        paintMask &&
        (sx >= paintMask.width ||
          sy >= paintMask.height ||
          !paintMask.data[sy * paintMask.width + sx])
      ) {
        pixCost[y * bw + x] = WALL;
        continue;
      }
      const v = vesselness[sy * imgWidth + sx];
      // Invert: high vesselness → low cost.
      const inv = 1 - v;
      pixCost[y * bw + x] = 1 + K * inv * inv;
    }
  }

  // A* (shared logic — same as astarLeastCostPath)
  const gScore = new Float32Array(NN);
  gScore.fill(Infinity);
  const parent = new Int32Array(NN);
  parent.fill(-1);
  const closed = new Uint8Array(NN);

  const localStartX = startX - bboxMinX;
  const localStartY = startY - bboxMinY;
  const localEndX = endX - bboxMinX;
  const localEndY = endY - bboxMinY;
  const startFlat = localStartY * bw + localStartX;
  const endFlat = localEndY * bw + localEndX;

  gScore[startFlat] = 0;
  const heap = createMinHeap();
  heap.push(0, startFlat);

  const NDX = [1, -1, 0, 0, 1, 1, -1, -1];
  const NDY = [0, 0, 1, -1, 1, -1, 1, -1];
  const NSTEP = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  const MAX_ITER = NN * 3;
  let iter = 0;
  let found = false;
  while (heap.size() > 0) {
    if (++iter > MAX_ITER) break;
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === endFlat) {
      found = true;
      break;
    }
    const cx = cur % bw;
    const cy = (cur - cx) / bw;
    const curCost = pixCost[cur];
    const curG = gScore[cur];
    for (let k = 0; k < 8; k++) {
      const nx = cx + NDX[k];
      const ny = cy + NDY[k];
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      const nflat = ny * bw + nx;
      if (closed[nflat]) continue;
      const step = NSTEP[k] * 0.5 * (curCost + pixCost[nflat]);
      const tentative = curG + step;
      if (tentative < gScore[nflat]) {
        gScore[nflat] = tentative;
        parent[nflat] = cur;
        const hx = localEndX - nx;
        const hy = localEndY - ny;
        const h = Math.sqrt(hx * hx + hy * hy);
        heap.push(tentative + h, nflat);
      }
    }
  }

  if (!found) return null;

  const path: [number, number][] = [];
  let c = endFlat;
  for (let guard = 0; guard < NN; guard++) {
    const x = c % bw;
    const y = (c - x) / bw;
    path.push([x + bboxMinX, y + bboxMinY]);
    if (c === startFlat) break;
    const p = parent[c];
    if (p < 0) break;
    c = p;
  }
  path.reverse();
  return path.length >= 2 ? path : null;
}

// Multi-cue classical road probability map. Combines three complementary
// signals — Frangi vesselness (tubular structure), gradient magnitude
// (edge contrast), and intensity homogeneity — into a single [0..1]
// probability field. Each cue catches what the others miss:
//   vesselness → elongated features (the road itself)
//   gradient   → road/non-road boundary contrast
//   homogeneity → smooth asphalt vs textured surroundings
// The combination is normalized per-pixel as a weighted geometric mean so
// all three must agree for a high probability. Only pixels inside the
// paint mask are processed; the rest stay at 0.
function computeMultiCueRoadMap(
  image: ImageData,
  sigmaMin: number,
  sigmaMax: number,
  sigmaSteps: number,
  paintMask?: { data: Uint8Array; width: number; height: number } | null
): Float32Array {
  const W = image.width;
  const H = image.height;
  const N = W * H;

  // 1. Grayscale
  const gray = new Float32Array(N);
  const d = image.data;
  for (let i = 0; i < N; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
  }

  // 2. Frangi vesselness (reuse the existing implementation)
  const vessel = computeVesselnessMap(
    image,
    sigmaMin,
    sigmaMax,
    sigmaSteps,
    paintMask
  );

  // 3. Gradient magnitude via Sobel (3×3). Normalized to [0..1] by the
  //    maximum observed value inside the mask.
  const gradMag = new Float32Array(N);
  let gMax = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (paintMask && !paintMask.data[y * W + x]) continue;
      const tl = gray[(y - 1) * W + (x - 1)];
      const tc = gray[(y - 1) * W + x];
      const tr = gray[(y - 1) * W + (x + 1)];
      const ml = gray[y * W + (x - 1)];
      const mr = gray[y * W + (x + 1)];
      const bl = gray[(y + 1) * W + (x - 1)];
      const bc = gray[(y + 1) * W + x];
      const br = gray[(y + 1) * W + (x + 1)];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      gradMag[y * W + x] = mag;
      if (mag > gMax) gMax = mag;
    }
  }
  if (gMax > 0) {
    for (let i = 0; i < N; i++) gradMag[i] /= gMax;
  }

  // 4. Local homogeneity: inverse of local standard deviation in a small
  //    window. Roads tend to have low local variance compared to
  //    vegetation or gravel. Computed with a box filter (radius 2).
  const homog = new Float32Array(N);
  const HR = 2;
  const HW = 2 * HR + 1;
  const HA = HW * HW;
  let hMax = 0;
  for (let y = HR; y < H - HR; y++) {
    for (let x = HR; x < W - HR; x++) {
      if (paintMask && !paintMask.data[y * W + x]) continue;
      let sum = 0;
      let sumSq = 0;
      for (let ky = -HR; ky <= HR; ky++) {
        for (let kx = -HR; kx <= HR; kx++) {
          const v = gray[(y + ky) * W + (x + kx)];
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / HA;
      const variance = Math.max(0, sumSq / HA - mean * mean);
      const sd = Math.sqrt(variance);
      // Inverse: high homogeneity = low sd. Use 1/(1+sd/C) so the
      // value sits in (0, 1] without a hard normalization pass.
      homog[y * W + x] = 1 / (1 + sd / 8);
      if (homog[y * W + x] > hMax) hMax = homog[y * W + x];
    }
  }
  if (hMax > 0) {
    for (let i = 0; i < N; i++) homog[i] /= hMax;
  }

  // 5. Combine: weighted geometric mean. Vesselness dominates (it's the
  //    most specific signal); gradient and homogeneity act as soft
  //    modifiers. The exponents control relative weight.
  //      road_prob = vessel^0.5 * (1 - grad)^0.2 * homog^0.3
  //    Using (1-grad) because roads have low gradient in their interior;
  //    edges are at the boundary. But this penalizes the road edges. A
  //    better approach: use a small dilation of (1-grad) so the low-
  //    gradient interior bleeds into the boundary pixels. For simplicity,
  //    just use the raw cues and let A* handle the rest.
  //
  //    Simpler alternative that works better in practice: additive blend
  //    with weights, clamped to [0,1]. This avoids the geometric mean's
  //    tendency to collapse to 0 when any cue is near 0.
  const prob = new Float32Array(N);
  const wV = 0.55; // vesselness weight
  const wG = 0.15; // inverted gradient weight (smooth interior)
  const wH = 0.30; // homogeneity weight
  for (let i = 0; i < N; i++) {
    if (paintMask && !paintMask.data[i]) continue;
    const v = vessel[i];
    const g = 1 - gradMag[i]; // invert: smooth = high
    const h = homog[i];
    prob[i] = Math.min(1, wV * v + wG * g + wH * h);
  }

  return prob;
}

// BFS flood fill from `seed` accepting any pixel whose RGB distance from the
// signature mean is within `toleranceMul * (baseline + combined per-channel
// stddev)`. Writes a compact mask covering only the pixels actually visited.
function regionGrowFromSeed(
  image: ImageData,
  seedX: number,
  seedY: number,
  signature: AutoPolySignature,
  toleranceMul: number,
  maxPixels: number,
  forbidden?: Uint8Array | null
): AutoPolyMask | null {
  const { width, height, data } = image;
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return null;
  // If the seed itself is forbidden (inside an existing polygon), bail.
  if (forbidden && forbidden[seedY * width + seedX]) return null;

  // Build an acceptance threshold. The baseline keeps it from collapsing to
  // zero on perfectly uniform references; the std term relaxes it for noisy
  // textures. Compared in squared RGB distance to save a sqrt per pixel.
  const baseline = 18;
  const stdTerm = Math.hypot(signature.stdR, signature.stdG, signature.stdB);
  const threshold = toleranceMul * (baseline + stdTerm);
  const thresholdSq = threshold * threshold;

  const visited = new Uint8Array(width * height);
  // Ring-buffer queue of pixel indices. 32-bit is plenty for any realistic
  // canvas (max ~16M pixels).
  const queueCap = Math.min(width * height, maxPixels * 4 + 1024);
  const queue = new Int32Array(queueCap);
  let qHead = 0;
  let qTail = 0;

  const pushPixel = (px: number, py: number): void => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const flat = py * width + px;
    if (visited[flat]) return;
    // Skip pixels that belong to an existing polygon on the active layer.
    if (forbidden && forbidden[flat]) return;
    visited[flat] = 1;
    queue[qTail++] = flat;
    if (qTail >= queueCap) qTail = 0;
  };

  const accepted = new Uint8Array(width * height);
  let minX = seedX;
  let maxX = seedX;
  let minY = seedY;
  let maxY = seedY;
  let count = 0;

  pushPixel(seedX, seedY);

  while (qHead !== qTail) {
    const flat = queue[qHead++];
    if (qHead >= queueCap) qHead = 0;
    const px = flat % width;
    const py = (flat - px) / width;

    const idx = flat * 4;
    const dr = data[idx] - signature.meanR;
    const dg = data[idx + 1] - signature.meanG;
    const db = data[idx + 2] - signature.meanB;
    if (dr * dr + dg * dg + db * db > thresholdSq) continue;

    accepted[flat] = 1;
    count++;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;

    if (count >= maxPixels) break;

    pushPixel(px + 1, py);
    pushPixel(px - 1, py);
    pushPixel(px, py + 1);
    pushPixel(px, py - 1);
  }

  if (count < 32) return null;

  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const mask = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      if (accepted[(y + minY) * width + (x + minX)]) {
        mask[y * outW + x] = 1;
      }
    }
  }
  return { mask, minX, minY, maxX, maxY, count, width: outW, height: outH };
}

// Moore-neighborhood boundary trace. Walks the outer contour of the largest
// connected component reachable from the first boundary pixel found by a
// row-major scan. Returns a closed ring in absolute canvas pixel coords.
function traceMaskContour(result: AutoPolyMask): [number, number][] | null {
  const { mask, width, height, minX, minY } = result;

  const at = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return mask[y * width + x] === 1;
  };

  // Find the first boundary pixel (row-major). A filled pixel touching a
  // non-filled 4-neighbor (or image edge) is a boundary pixel.
  let startX = -1;
  let startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return null;

  // 8-connected neighbors in clockwise order starting east.
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contour: [number, number][] = [];
  let cx = startX;
  let cy = startY;
  // Initial "previous" direction: came from the west.
  let dir = 7; // so the next check starts at east
  const MAX_STEPS = width * height * 4;
  for (let step = 0; step < MAX_STEPS; step++) {
    contour.push([cx + minX, cy + minY]);
    let found = false;
    // Moore-neighbor tracing: start the search one step clockwise from the
    // incoming direction (dir + 6 = dir - 2 mod 8).
    const start = (dir + 6) % 8;
    for (let i = 0; i < 8; i++) {
      const nd = (start + i) % 8;
      const nx = cx + dx[nd];
      const ny = cy + dy[nd];
      if (at(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = nd;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    if (cx === startX && cy === startY) break;
  }

  if (contour.length < 4) return null;
  // Close the ring explicitly.
  contour.push([contour[0][0], contour[0][1]]);
  return contour;
}

// Rasterize every polygon and multipolygon in `fc` into a flat Uint8Array
// mask at device-pixel resolution. Pixels covered by any feature get value 1.
// Used by the auto-trace tool so the BFS region grow stops at the boundaries
// of already-digitized shapes.
function buildForbiddenMask(
  map: MLMap,
  fc: GeoJSON.FeatureCollection | null,
  imgWidth: number,
  imgHeight: number,
  dpr: number
): Uint8Array {
  const mask = new Uint8Array(imgWidth * imgHeight);
  if (!fc) return mask;
  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    let rings: GeoJSON.Position[][] = [];
    if (geom.type === "Polygon") {
      rings = geom.coordinates;
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        for (const ring of poly) rings.push(ring);
      }
    } else {
      continue;
    }
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const pixRing: [number, number][] = ring.map(([lng, lat]) => {
        const p = map.project([lng, lat] as [number, number]);
        return [p.x * dpr, p.y * dpr];
      });
      const { minX, minY, maxX, maxY } = ringPixelBounds(
        pixRing,
        imgWidth,
        imgHeight
      );
      // Quick cull: skip features entirely outside the visible canvas.
      if (maxX <= 0 || maxY <= 0 || minX >= imgWidth || minY >= imgHeight)
        continue;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (mask[y * imgWidth + x]) continue;
          if (canvasPointInRing(x + 0.5, y + 0.5, pixRing)) {
            mask[y * imgWidth + x] = 1;
          }
        }
      }
    }
  }
  return mask;
}

// Rasterize geographic paint-mask strokes into a device-pixel Uint8Array
// for the current map viewport. Each stroke's coordinates are projected
// to canvas pixels via map.project(), then stamped with a disk of the
// stroke's brush radius (in device pixels).
function rasterizePaintMaskStrokes(
  map: MLMap,
  strokes: ReadonlyArray<{
    coords: [number, number][];
    brushCss: number;
    zoom: number;
  }>,
  imgWidth: number,
  imgHeight: number,
  dpr: number
): { data: Uint8Array; width: number; height: number } | null {
  if (strokes.length === 0) return null;
  const currentZoom = map.getZoom();
  const mask = new Uint8Array(imgWidth * imgHeight);
  for (const stroke of strokes) {
    if (stroke.coords.length === 0) continue;
    // Scale the brush radius to account for the zoom difference between
    // paint time and the current viewport, keeping geographic width fixed.
    const zoomScale = Math.pow(2, currentZoom - stroke.zoom);
    const radius = Math.round((stroke.brushCss * zoomScale * dpr) / 2);
    const rSq = radius * radius;
    const projected: [number, number][] = stroke.coords.map(([lng, lat]) => {
      const p = map.project([lng, lat] as [number, number]);
      return [Math.round(p.x * dpr), Math.round(p.y * dpr)];
    });
    const stamp = (cx: number, cy: number) => {
      const x0 = Math.max(0, cx - radius);
      const y0 = Math.max(0, cy - radius);
      const x1 = Math.min(imgWidth - 1, cx + radius);
      const y1 = Math.min(imgHeight - 1, cy + radius);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= rSq) mask[y * imgWidth + x] = 1;
        }
      }
    };
    for (let i = 0; i < projected.length - 1; i++) {
      const [ax, ay] = projected[i];
      const [bx, by] = projected[i + 1];
      const dist = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(dist));
      for (let t = 0; t <= steps; t++) {
        const frac = t / steps;
        stamp(
          Math.round(ax + (bx - ax) * frac),
          Math.round(ay + (by - ay) * frac)
        );
      }
    }
    if (projected.length === 1) stamp(projected[0][0], projected[0][1]);
  }
  return { data: mask, width: imgWidth, height: imgHeight };
}

function geomBboxDiagonal(geom: GeoJSON.Geometry): number {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      for (const cc of c) visit(cc);
    }
  };
  visit((geom as { coordinates: unknown }).coordinates);
  if (!isFinite(minX)) return 0;
  return Math.hypot(maxX - minX, maxY - minY);
}

function geomVertexFC(geom: GeoJSON.Geometry): GeoJSON.FeatureCollection {
  const positions: GeoJSON.Position[] = [];
  const pushRing = (ring: GeoJSON.Position[]) => {
    const last = ring.length - 1;
    const closed =
      ring.length > 1 &&
      ring[0][0] === ring[last][0] &&
      ring[0][1] === ring[last][1];
    const stop = closed ? last : ring.length;
    for (let i = 0; i < stop; i++) positions.push(ring[i]);
  };
  switch (geom.type) {
    case "Point":
      positions.push(geom.coordinates);
      break;
    case "MultiPoint":
      for (const c of geom.coordinates) positions.push(c);
      break;
    case "LineString":
      for (const c of geom.coordinates) positions.push(c);
      break;
    case "MultiLineString":
      for (const line of geom.coordinates)
        for (const c of line) positions.push(c);
      break;
    case "Polygon":
      for (const ring of geom.coordinates) pushRing(ring);
      break;
    case "MultiPolygon":
      for (const poly of geom.coordinates)
        for (const ring of poly) pushRing(ring);
      break;
  }
  return {
    type: "FeatureCollection",
    features: positions.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: p },
    })),
  };
}

function countGeomVertices(geom: GeoJSON.Geometry): number {
  let n = 0;
  const visit = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      n++;
    } else {
      for (const cc of c) visit(cc);
    }
  };
  visit((geom as { coordinates: unknown }).coordinates);
  return n;
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
  .glb-btn--dirty-outline {
    border-color: #f59e0b !important;
    box-shadow: 0 0 0 1px #f59e0b inset;
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
  /* Force readable colors on the native dropdown list. Options inherit the
     select's color by default, which in dark mode gives light text on the
     browser's light popup background. */
  .glb-tile-select option {
    background-color: #fff;
    color: #1e293b;
  }
  [data-theme="dark"] .glb-tile-select option {
    background-color: #0f172a;
    color: #e2e8f0;
  }
  .glb-tile-select option.glb-tile-select__header {
    background-color: #f1f5f9;
    color: #64748b;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  [data-theme="dark"] .glb-tile-select option.glb-tile-select__header {
    background-color: #1e293b;
    color: #94a3b8;
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
    min-width: 54px;
    text-align: center;
    white-space: nowrap;
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

  /* Segmented zoom control: [+][ Z 1.2 ][-] styled as one unit. The group
     itself draws the pill background + border; its children (the two
     ToolbarButtons and the zoom badge) go flat and share a hairline divider. */
  .glb-zoom-group {
    display: inline-flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: stretch;
    flex-shrink: 0;
    height: 34px;
    border-radius: 8px;
    overflow: hidden;
    background-color: rgba(15, 23, 42, 0.05);
    border: 1px solid rgba(15, 23, 42, 0.12);
  }
  [data-theme="dark"] .glb-zoom-group {
    background-color: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .glb-zoom-group > * {
    flex: 0 0 auto;
    height: 100%;
    border: 0 !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    box-shadow: none !important;
  }
  .glb-zoom-group > * + * {
    border-left: 1px solid rgba(15, 23, 42, 0.12) !important;
  }
  [data-theme="dark"] .glb-zoom-group > * + * {
    border-left-color: rgba(255, 255, 255, 0.14) !important;
  }
  .glb-zoom-group .glb-btn {
    width: 32px;
  }
  .glb-zoom-group .glb-btn:hover:not(:disabled) {
    background-color: rgba(15, 23, 42, 0.08) !important;
  }
  [data-theme="dark"] .glb-zoom-group .glb-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.12) !important;
  }
  .glb-zoom-group .glb-zoom-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    min-width: 58px;
    color: #0f172a;
  }
  [data-theme="dark"] .glb-zoom-group .glb-zoom-badge {
    color: #e2e8f0;
  }

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

  /* Small follow-on slider pill, positioned below the toolbar and
     centered on the 3D Terrain button. Lives inside the toolbar so it
     drags with it. The left offset is set inline from the button. */
  .glb-terrain-slider-wrap {
    position: absolute;
    top: 100%;
    margin-top: 8px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
    font-size: 11px;
    color: #1e293b;
    cursor: default;
    white-space: nowrap;
  }
  [data-theme="dark"] .glb-terrain-slider-wrap {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }
  .glb-terrain-slider-wrap__label {
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
  }
  [data-theme="dark"] .glb-terrain-slider-wrap__label { color: #94a3b8; }
  .glb-terrain-slider-wrap input[type="range"] {
    width: 110px;
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .glb-terrain-slider-wrap__value {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    min-width: 26px;
    text-align: right;
  }
  .glb-terrain-slider-wrap__clear-btn {
    padding: 0 6px;
    border: 1px solid rgba(15, 23, 42, 0.15);
    border-radius: 3px;
    background: transparent;
    color: inherit;
    font-family: system-ui, sans-serif;
    font-size: 10px;
    font-weight: 600;
    line-height: 16px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    white-space: nowrap;
  }
  .glb-terrain-slider-wrap__clear-btn:hover {
    background-color: rgba(15, 23, 42, 0.07);
  }
  [data-theme="dark"] .glb-terrain-slider-wrap__clear-btn {
    border-color: rgba(255, 255, 255, 0.15);
  }
  [data-theme="dark"] .glb-terrain-slider-wrap__clear-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  .glb-autotrace-divider {
    width: 1px;
    height: 16px;
    background-color: rgba(15, 23, 42, 0.15);
    flex-shrink: 0;
  }
  [data-theme="dark"] .glb-autotrace-divider {
    background-color: rgba(255, 255, 255, 0.15);
  }
  .glb-paint-mask-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
  }
  .glb-magnifier {
    position: absolute;
    pointer-events: none;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
    z-index: 20;
    display: none;
  }
  .glb-magnifier canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .glb-magnifier__crosshair {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .glb-ramp-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .glb-ramp-picker__trigger {
    width: 36px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(15, 23, 42, 0.25);
    cursor: pointer;
    padding: 0;
    background-clip: padding-box;
  }
  [data-theme="dark"] .glb-ramp-picker__trigger {
    border-color: rgba(255, 255, 255, 0.25);
  }
  .glb-ramp-picker__trigger:hover { filter: brightness(1.05); }
  .glb-ramp-picker__popover {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    padding: 6px;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(15, 23, 42, 0.14);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.25);
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
  }
  [data-theme="dark"] .glb-ramp-picker__popover {
    background-color: rgba(15, 23, 42, 0.94);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  }
  .glb-ramp-picker__option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    color: inherit;
    text-align: left;
  }
  .glb-ramp-picker__option:hover {
    background-color: rgba(15, 23, 42, 0.07);
  }
  [data-theme="dark"] .glb-ramp-picker__option:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
  .glb-ramp-picker__option--active {
    background-color: rgba(59, 130, 246, 0.18) !important;
    font-weight: 600;
  }
  .glb-ramp-picker__swatch {
    width: 36px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid rgba(15, 23, 42, 0.2);
    flex-shrink: 0;
  }
  [data-theme="dark"] .glb-ramp-picker__swatch {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .glb-context-menu {
    position: absolute;
    z-index: 4;
    min-width: 140px;
    padding: 4px;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(15, 23, 42, 0.14);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #1e293b;
    user-select: none;
  }
  [data-theme="dark"] .glb-context-menu {
    background-color: rgba(15, 23, 42, 0.94);
    border-color: rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .glb-context-menu button {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
    font: inherit;
  }
  .glb-context-menu button:hover {
    background-color: rgba(15, 23, 42, 0.08);
  }
  [data-theme="dark"] .glb-context-menu button:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }

  .glb-fs-divider {
    width: 1px;
    height: 22px;
    background-color: rgba(15, 23, 42, 0.14);
    flex-shrink: 0;
  }
  [data-theme="dark"] .glb-fs-divider {
    background-color: rgba(255, 255, 255, 0.22);
  }

  .glb-toolbar-group {
    position: relative;
    display: flex;
    align-items: center;
  }
  .glb-toolbar-group__popover {
    position: absolute;
    bottom: calc(100% + 14px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    z-index: 10;
  }
  .glb-toolbar-group__popover .glb-btn {
    background-color: rgba(255, 255, 255, 0.92);
    border-color: rgba(15, 23, 42, 0.14);
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  }
  .glb-toolbar-group__popover .glb-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 1);
  }
  [data-theme="dark"] .glb-toolbar-group__popover .glb-btn {
    background-color: rgba(30, 41, 59, 0.92);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  [data-theme="dark"] .glb-toolbar-group__popover .glb-btn:hover:not(:disabled) {
    background-color: rgba(30, 41, 59, 1);
  }

  .glb-simplify-panel {
    position: absolute;
    top: 100%;
    margin-top: 8px;
    transform: translateX(-50%);
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-radius: 999px;
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #1e293b;
    user-select: none;
    white-space: nowrap;
  }
  [data-theme="dark"] .glb-simplify-panel {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .glb-simplify-panel--idle {
    color: #64748b;
  }
  [data-theme="dark"] .glb-simplify-panel--idle {
    color: #94a3b8;
  }
  .glb-simplify-label {
    font-weight: 600;
  }
  .glb-simplify-slider {
    width: 200px;
    cursor: pointer;
    accent-color: #3b82f6;
  }
  .glb-simplify-count {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    font-weight: 600;
    min-width: 78px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .glb-dem-modal {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 5;
    width: 320px;
    padding: 16px 18px;
    border-radius: 12px;
    background-color: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(15, 23, 42, 0.14);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #1e293b;
    display: flex;
    flex-direction: column;
    gap: 12px;
    user-select: none;
  }
  [data-theme="dark"] .glb-dem-modal {
    background-color: rgba(15, 23, 42, 0.94);
    border-color: rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  }
  .glb-dem-modal__title {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
  }
  .glb-dem-modal__row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .glb-dem-modal__label {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  [data-theme="dark"] .glb-dem-modal__label { color: #94a3b8; }
  .glb-dem-modal__value {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
  }
  .glb-dem-modal__input,
  .glb-dem-modal__select {
    height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background-color: rgba(255, 255, 255, 0.9);
    color: inherit;
    font-size: 12px;
    font-family: inherit;
  }
  [data-theme="dark"] .glb-dem-modal__input,
  [data-theme="dark"] .glb-dem-modal__select {
    background-color: rgba(30, 41, 59, 0.9);
    border-color: rgba(255, 255, 255, 0.16);
  }
  .glb-dem-modal__slider {
    width: 100%;
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .glb-dem-modal__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;
  }
  .glb-dem-modal__btn {
    height: 28px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background-color: rgba(255, 255, 255, 0.9);
    color: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .glb-dem-modal__btn--primary {
    background-color: #3b82f6;
    border-color: #2563eb;
    color: #ffffff;
  }
  .glb-dem-modal__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  [data-theme="dark"] .glb-dem-modal__btn {
    background-color: rgba(30, 41, 59, 0.9);
    border-color: rgba(255, 255, 255, 0.16);
  }
  [data-theme="dark"] .glb-dem-modal__btn--primary {
    background-color: #3b82f6;
    border-color: #1d4ed8;
  }

  .glb-cursor-readout {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 4;
    pointer-events: none;
    padding: 6px 10px;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(6px);
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    line-height: 1.45;
    color: #1e293b;
    user-select: none;
    white-space: nowrap;
  }
  [data-theme="dark"] .glb-cursor-readout {
    background-color: rgba(15, 23, 42, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  }
  .glb-cursor-readout__label {
    color: #64748b;
    margin-right: 4px;
  }
  [data-theme="dark"] .glb-cursor-readout__label { color: #94a3b8; }

  .glb-info-popup {
    position: absolute;
    z-index: 5;
    min-width: 200px;
    max-width: 320px;
    max-height: 320px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(15, 23, 42, 0.16);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22);
    backdrop-filter: blur(8px);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11px;
    color: #1e293b;
    user-select: text;
  }
  [data-theme="dark"] .glb-info-popup {
    background-color: rgba(15, 23, 42, 0.94);
    border-color: rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  }
  .glb-info-popup__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    font-weight: 600;
    font-size: 11px;
    color: #334155;
    background-color: rgba(15, 23, 42, 0.04);
  }
  [data-theme="dark"] .glb-info-popup__header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    background-color: rgba(255, 255, 255, 0.04);
  }
  .glb-info-popup__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .glb-info-popup__close {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    border-radius: 3px;
    line-height: 1;
    font-size: 14px;
  }
  .glb-info-popup__close:hover {
    background-color: rgba(15, 23, 42, 0.08);
    color: #1e293b;
  }
  [data-theme="dark"] .glb-info-popup__close:hover {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }
  .glb-info-popup__body {
    overflow-y: auto;
    padding: 4px 0;
  }
  .glb-info-popup__row {
    display: flex;
    gap: 8px;
    padding: 3px 8px;
    line-height: 1.4;
  }
  .glb-info-popup__row:nth-child(odd) {
    background-color: rgba(15, 23, 42, 0.03);
  }
  [data-theme="dark"] .glb-info-popup__row:nth-child(odd) {
    background-color: rgba(255, 255, 255, 0.03);
  }
  .glb-info-popup__key {
    flex-shrink: 0;
    min-width: 80px;
    color: #64748b;
    font-weight: 500;
  }
  [data-theme="dark"] .glb-info-popup__key { color: #94a3b8; }
  .glb-info-popup__value {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    color: #0f172a;
  }
  [data-theme="dark"] .glb-info-popup__value { color: #f1f5f9; }
  .glb-info-popup__empty {
    padding: 8px;
    color: #64748b;
    font-style: italic;
  }

  .glb-legend {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 4;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px 8px 8px;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(6px);
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: #1e293b;
    max-width: 280px;
    max-height: calc(100% - 20px);
    overflow-y: auto;
    user-select: none;
  }
  [data-theme="dark"] .glb-legend {
    background-color: rgba(15, 23, 42, 0.85);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
  }
  .glb-legend__title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin: 0 0 2px 2px;
  }
  [data-theme="dark"] .glb-legend__title { color: #94a3b8; }
  .glb-legend__group {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin: 5px 0 1px 2px;
  }
  .glb-legend__group:first-child { margin-top: 0; }
  [data-theme="dark"] .glb-legend__group { color: #94a3b8; }
  .glb-legend__row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
  }
  .glb-legend__row:hover {
    background-color: rgba(15, 23, 42, 0.06);
  }
  [data-theme="dark"] .glb-legend__row:hover {
    background-color: rgba(255, 255, 255, 0.06);
  }
  .glb-legend__checkbox {
    margin: 0;
    cursor: pointer;
    flex-shrink: 0;
  }
  .glb-legend__swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(15, 23, 42, 0.25);
    flex-shrink: 0;
    transition: opacity 120ms;
  }
  [data-theme="dark"] .glb-legend__swatch {
    border-color: rgba(255, 255, 255, 0.25);
  }
  .glb-legend__row--hidden .glb-legend__swatch {
    opacity: 0.3;
  }
  .glb-legend__row--dem {
    align-items: flex-start;
  }
  .glb-legend__swatch--dem {
    margin-top: 2px;
  }
  .glb-legend__dem-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }
  .glb-legend__dem-range {
    color: #64748b;
    font-size: 11px;
  }
  [data-theme="dark"] .glb-legend__dem-range {
    color: #94a3b8;
  }
  .glb-legend__row--hidden .glb-legend__name {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .glb-legend__name-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .glb-legend__name-btn:hover .glb-legend__name {
    text-decoration: underline;
  }
  .glb-legend__row--hidden .glb-legend__name-btn:hover .glb-legend__name {
    text-decoration: line-through underline;
  }
  .glb-legend__caret {
    display: inline-block;
    width: 10px;
    font-size: 10px;
    line-height: 1;
    color: #64748b;
    transition: transform 120ms;
    flex-shrink: 0;
  }
  [data-theme="dark"] .glb-legend__caret { color: #94a3b8; }
  .glb-legend__caret--collapsed {
    transform: rotate(-90deg);
  }
  .glb-legend__fclasses {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 2px 16px;
    padding-left: 8px;
    border-left: 1px solid rgba(15, 23, 42, 0.12);
  }
  [data-theme="dark"] .glb-legend__fclasses {
    border-left-color: rgba(255, 255, 255, 0.12);
  }
  .glb-legend__row--fclass {
    font-size: 11px;
  }
  .glb-legend__row--fclass .glb-legend__swatch {
    width: 11px;
    height: 11px;
  }
  .glb-legend__fclass-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }
  .glb-legend__edit-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border-radius: 3px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    background-color: rgba(255, 255, 255, 0.6);
    color: #64748b;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 120ms, background-color 120ms, border-color 120ms;
  }
  .glb-legend__edit-btn:hover {
    color: #1e293b;
    border-color: rgba(15, 23, 42, 0.4);
  }
  [data-theme="dark"] .glb-legend__edit-btn {
    background-color: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.18);
    color: #94a3b8;
  }
  [data-theme="dark"] .glb-legend__edit-btn:hover {
    color: #e2e8f0;
    border-color: rgba(255, 255, 255, 0.4);
  }
  .glb-legend__edit-btn--active {
    background-color: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }
  .glb-legend__edit-btn--active:hover {
    background-color: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }
  [data-theme="dark"] .glb-legend__edit-btn--active,
  [data-theme="dark"] .glb-legend__edit-btn--active:hover {
    background-color: #3b82f6;
    border-color: #3b82f6;
    color: #fff;
  }
  .glb-legend__row--active {
    background-color: rgba(59, 130, 246, 0.12);
  }
  [data-theme="dark"] .glb-legend__row--active {
    background-color: rgba(59, 130, 246, 0.2);
  }
  .glb-legend__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
    font-variant-numeric: tabular-nums;
  }
`;

const GLOBE_CSS_ID = "glb-globe-viewport-css";
function injectCss() {
  let style = document.getElementById(GLOBE_CSS_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = GLOBE_CSS_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== GLOBE_CSS) style.textContent = GLOBE_CSS;
}

// Group icon: minimalist pencil
const EDIT_GROUP_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4L7 21H3v-4z"/></svg>';
// Edit vertices: node on a line with move arrows — drag to reposition
const EDIT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l8-8 8-8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="currentColor"/><path d="M12 7v-3m0 16v-3m-5-5H4m16 0h-3" stroke-width="1.5"/><path d="M12 4l-1.5 2h3zM12 20l-1.5-2h3zM4 12l2-1.5v3zM20 12l-2-1.5v3z" fill="currentColor" stroke="none"/></svg>';
const ADD_GROUP_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
// Per-vertex click-to-place: polyline with vertex dots
const ADD_VERTEX_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 18 10 8 16 14 20 6"/><circle cx="4" cy="18" r="2" fill="currentColor"/><circle cx="10" cy="8" r="2" fill="currentColor"/><circle cx="16" cy="14" r="2" fill="currentColor"/><circle cx="20" cy="6" r="2" fill="currentColor"/></svg>';
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
const FREEHAND_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c2-3 4-8 7-9s3 4 5 3 2-5 6-7"/></svg>';
// Group icon: wand with sparkles — automatic digitization
const DIGITIZE_GROUP_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2m0 2v2m0-2h2m-2 0h-2"/><path d="M20 9v-1m0 1v1m0-1h1m-1 0h-1"/><path d="M3 21l10-10"/><path d="M13 11l-1-1 1-1 1 1z"/></svg>';
// Auto-trace: eyedropper sampling color + dashed path
const AUTO_POLY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-1.5 1.5M17 7l-3 3"/><circle cx="12" cy="12" r="2"/><path d="M10 14l-6 6" stroke-dasharray="3 2"/></svg>';
// Vesselness: parallel road edges with centerline — tubular detection
const VESSEL_TRACE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8c4-2 8 2 12 0s4-2 4-2"/><path d="M4 16c4-2 8 2 12 0s4-2 4-2"/><path d="M4 12c4-2 8 2 12 0s4-2 4-2" stroke-dasharray="3 2" stroke-width="1.5"/></svg>';
// Multi-cue: three overlapping signal layers funneling into a path
const ML_TRACE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h6"/><path d="M4 10h6"/><path d="M4 14h6"/><path d="M10 6l4 4-4 4"/><path d="M14 10h6" stroke-width="2.5"/></svg>';
// Simplify: jagged path above a clean straight line — reduce vertices
const SIMPLIFY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3-3 3 4 3-5 3 4 3-3 3 2"/><path d="M3 17h18"/></svg>';
// Smooth: angular path becoming a curve
const SMOOTH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-5 4 3 4-5 6 4" opacity="0.35"/><path d="M3 17q5-7 9-2t9-6"/></svg>';
const TILT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L21 9 L12 15 L3 9 Z"/><path d="M3 9 L3 14 L12 20 L21 14 L21 9"/></svg>';
const DEM_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19 L9 9 L13 15 L16 11 L21 19 Z"/><circle cx="17" cy="6" r="1.5" fill="currentColor"/></svg>';
const TERRAIN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 L8 8 L12 14 L15 9 L22 20 Z"/><path d="M8 8 L10 11 M15 9 L17 12"/></svg>';
const DELETE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>';
const RECLASSIFY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.41 20.59a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>';
// Info / Identify: lowercase i in a circle
const INFO_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="11" x2="12" y2="17"/><circle cx="12" cy="7.5" r="0.5" fill="currentColor"/></svg>';
// Discard: X mark — cancel/reject changes
const DISCARD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

// Contextual cursors used when the pointer is over a selectable feature in
// the corresponding mode. Each is a 28×28 SVG with a white halo so the glyph
// stays visible on satellite imagery; falls back to `pointer` on browsers
// that ignore SVG cursors.
const SIMPLIFY_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><path d='M5 21 L11 13 L17 16 L23 7'/><circle cx='5' cy='21' r='2.6' fill='%23ffffff'/><circle cx='11' cy='13' r='2.6' fill='%23ffffff'/><circle cx='17' cy='16' r='2.6' fill='%23ffffff'/><circle cx='23' cy='7' r='2.6' fill='%23ffffff'/><path d='M5 21 L11 13 L17 16 L23 7' stroke='%233b82f6' stroke-width='2'/><circle cx='5' cy='21' r='1.8' fill='%233b82f6'/><circle cx='11' cy='13' r='1.8' fill='%233b82f6'/><circle cx='17' cy='16' r='1.8' fill='%233b82f6'/><circle cx='23' cy='7' r='1.8' fill='%233b82f6'/></svg>\") 14 14, pointer";

const SMOOTH_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><path d='M5 21 q7-11 11-3 t7-9'/><path d='M5 21 q7-11 11-3 t7-9' stroke='%233b82f6' stroke-width='2'/></svg>\") 14 14, pointer";

const EDIT_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><path d='M14 5 l4 4 -9 9 H5 v-4 z'/><path d='M19.5 4.5 a2.12 2.12 0 0 1 3 3 L9 21 l-4 1 1 -4 z'/><path d='M14 5 l4 4 -9 9 H5 v-4 z' stroke='%233b82f6' stroke-width='2'/><path d='M19.5 4.5 a2.12 2.12 0 0 1 3 3 L9 21 l-4 1 1 -4 z' stroke='%233b82f6' stroke-width='2'/></svg>\") 14 14, pointer";

const DEM_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><path d='M5 21 L11 11 L15 17 L18 13 L23 21 Z'/><circle cx='19' cy='8' r='2.6' fill='%23ffffff'/><path d='M5 21 L11 11 L15 17 L18 13 L23 21 Z' stroke='%233b82f6' stroke-width='2'/><circle cx='19' cy='8' r='1.6' fill='%233b82f6' stroke='%233b82f6' stroke-width='1'/></svg>\") 14 14, pointer";

const INFO_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><circle cx='14' cy='14' r='10'/><line x1='14' y1='13' x2='14' y2='19'/><circle cx='14' cy='9' r='0.5' fill='%23ffffff'/><circle cx='14' cy='14' r='10' stroke='%233b82f6' stroke-width='2'/><line x1='14' y1='13' x2='14' y2='19' stroke='%233b82f6' stroke-width='2'/><circle cx='14' cy='9' r='1' fill='%233b82f6' stroke='%233b82f6'/></svg>\") 14 14, pointer";

const DELETE_HOVER_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28' fill='none' stroke='%23ffffff' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><polyline points='5 8 7 8 23 8'/><path d='M21 8 l-1 14 a2 2 0 0 1 -2 2 H10 a2 2 0 0 1 -2 -2 L7 8'/><path d='M12 13 v6'/><path d='M16 13 v6'/><path d='M11 8 V6 a2 2 0 0 1 2 -2 h2 a2 2 0 0 1 2 2 v2'/><polyline points='5 8 7 8 23 8' stroke='%23ef4444' stroke-width='2'/><path d='M21 8 l-1 14 a2 2 0 0 1 -2 2 H10 a2 2 0 0 1 -2 -2 L7 8' stroke='%23ef4444' stroke-width='2'/><path d='M12 13 v6' stroke='%23ef4444' stroke-width='2'/><path d='M16 13 v6' stroke='%23ef4444' stroke-width='2'/><path d='M11 8 V6 a2 2 0 0 1 2 -2 h2 a2 2 0 0 1 2 2 v2' stroke='%23ef4444' stroke-width='2'/></svg>\") 14 14, pointer";

export type LayerFclass = {
  value: string;
  color: string;
  visible: boolean;
};

export type LayerStyle = {
  id: string;
  color: string;
  visible: boolean;
  fclasses?: ReadonlyArray<LayerFclass>;
  /** Display name shown in the legend (defaults to id). */
  displayName?: string;
  /** Optional group label — layers with the same group are rendered under
   *  a shared heading in the legend. */
  group?: string;
};

export function GisGlobeViewport({
  data,
  layers,
  onToggleLayerVisibility,
  onToggleFclassVisibility,
  dataKey,
  discardKey,
  editing,
  adding,
  freehand,
  autoPoly,
  autoVessel,
  autoSegment,
  simplifying,
  smoothing,
  importingDem,
  deleting,
  reclassifying,
  demFile,
  demOpacity,
  demColorRamp,
  terrainOn,
  terrainExaggeration,
  dirty,
  saving,
  canEdit,
  geometryType,
  onToggleEdit,
  onToggleAdd,
  onToggleFreehand,
  onToggleAutoPoly,
  onToggleAutoVessel,
  onToggleAutoSegment,
  onToggleSimplify,
  onToggleSmooth,
  onToggleImportDem,
  onToggleDelete,
  onToggleReclassify,
  onToggleTerrain,
  onSetTerrainExaggeration,
  onSetDemOpacity,
  onSetDemColorRamp,
  demNameSuggestion,
  onConfirmDemDownload,
  onSave,
  onDiscard,
  onEdited,
  onAdded,
  onDeleted,
  onReclassify,
  demFileUrl,
  demTileUrlTemplate,
  demManifestUrl,
}: {
  data: GeoJSONFeatureCollection | null;
  layers?: ReadonlyArray<LayerStyle>;
  onToggleLayerVisibility?: (id: string) => void;
  onToggleFclassVisibility?: (id: string, fclass: string) => void;
  dataKey: string;
  discardKey: number;
  editing: boolean;
  adding: boolean;
  freehand: boolean;
  autoPoly: boolean;
  autoVessel: boolean;
  autoSegment: boolean;
  simplifying: boolean;
  smoothing: boolean;
  importingDem: boolean;
  deleting: boolean;
  reclassifying: boolean;
  demFile: string;
  demOpacity: number;
  demColorRamp: RampName;
  terrainOn: boolean;
  terrainExaggeration: number;
  dirty: boolean;
  saving: boolean;
  canEdit?: boolean;
  geometryType: string;
  onToggleEdit: () => void;
  onToggleAdd: () => void;
  onToggleFreehand: () => void;
  onToggleAutoPoly: () => void;
  onToggleAutoVessel: () => void;
  onToggleAutoSegment: () => void;
  onToggleSimplify: () => void;
  onToggleSmooth: () => void;
  onToggleImportDem: () => void;
  onToggleDelete: () => void;
  onToggleReclassify: () => void;
  onToggleTerrain: () => void;
  onSetTerrainExaggeration: (value: number) => void;
  onSetDemOpacity: (value: number) => void;
  onSetDemColorRamp: (value: RampName) => void;
  demNameSuggestion: string;
  onConfirmDemDownload: (params: {
    bbox: [number, number, number, number];
    name: string;
    maxZoom: number;
  }) => void;
  onSave: () => void;
  onDiscard: () => void;
  onEdited: (features: GeoJSON.Feature[]) => void;
  onAdded: (feature: GeoJSON.Feature) => void;
  onDeleted: (feature: GeoJSON.Feature) => void;
  onReclassify: (feature: GeoJSON.Feature, newFclass: string) => void;
  /** Override URL for fetching the raw DEM .tif (default: /api/gis/${demFile}) */
  demFileUrl?: string;
  /** Override URL template for DEM tile PNG (use {z},{x},{y} placeholders) */
  demTileUrlTemplate?: string;
  /** Override URL for the DEM tile pyramid manifest */
  demManifestUrl?: string;
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [tileIndex, setTileIndex] = React.useState(0);
  const [styleReady, setStyleReady] = React.useState(false);
  const [zoomDisplay, setZoomDisplay] = React.useState(DEFAULT_ZOOM);
  const [pitchDisplay, setPitchDisplay] = React.useState(0);
  // Origin of the project backend — any map-internal request (raster-dem
  // tiles, image sources) to this origin needs the session cookie, which
  // MapLibre doesn't send by default. Derived from ``demManifestUrl`` or
  // ``demTileUrlTemplate`` at mount; updated via ref so the map's
  // ``transformRequest`` (set once at construction) stays in sync.
  const backendOriginRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const src = demManifestUrl || demTileUrlTemplate || demFileUrl || "";
    if (src.startsWith("http://") || src.startsWith("https://")) {
      try {
        backendOriginRef.current = new URL(src).origin;
      } catch {
        backendOriginRef.current = null;
      }
    } else {
      backendOriginRef.current = null;
    }
  }, [demManifestUrl, demTileUrlTemplate, demFileUrl]);
  // When non-null, new features committed by add/freehand are stamped with
  // `properties.fclass = activeFclass`. Only one can be active at a time;
  // the pencil button next to each fclass in the legend toggles it.
  const [collapsedLayers, setCollapsedLayers] = React.useState<Set<string>>(
    () => new Set()
  );
  const [activeFclass, setActiveFclass] = React.useState<string | null>(null);
  // Hover popover for fclass legend rows — shows the OSM wiki definition
  // card (same visual as app/(workspace)/demo/osm-info). Data is fetched
  // lazily via the module-level cache in lib/osm/fclass-info.ts.
  const [hoverCard, setHoverCard] = React.useState<{
    layerId: string;
    fclass: string;
    top: number;
    left: number;
    state: FclassCardState;
  } | null>(null);
  const hoverHideTimerRef = React.useRef<number | null>(null);
  const clearHoverHide = React.useCallback(() => {
    if (hoverHideTimerRef.current != null) {
      window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
  }, []);
  const handleFclassHover = React.useCallback(
    (layerId: string, fclass: string, rect: DOMRect) => {
      clearHoverHide();
      const theme = themeFromLayerId(layerId);
      const cached = theme ? getCachedFclassInfo(theme, fclass) : undefined;
      const cardWidth = 280;
      const estHeight = 320;
      const gap = 12;
      const placeRight = rect.right + gap + cardWidth <= window.innerWidth - 8;
      const left = placeRight
        ? rect.right + gap
        : Math.max(8, rect.left - gap - cardWidth);
      const top = Math.max(
        8,
        Math.min(window.innerHeight - estHeight - 8, rect.top),
      );
      const state: FclassCardState =
        cached !== undefined
          ? { status: "ready", info: cached }
          : { status: "loading" };
      setHoverCard({ layerId, fclass, top, left, state });
      if (cached !== undefined || !theme) return;
      loadFclassInfo(theme, fclass)
        .then((info) => {
          setHoverCard((prev) =>
            prev && prev.layerId === layerId && prev.fclass === fclass
              ? { ...prev, state: { status: "ready", info } }
              : prev,
          );
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Failed to load";
          setHoverCard((prev) =>
            prev && prev.layerId === layerId && prev.fclass === fclass
              ? { ...prev, state: { status: "error", message } }
              : prev,
          );
        });
    },
    [clearHoverHide],
  );
  const handleFclassLeave = React.useCallback(() => {
    clearHoverHide();
    hoverHideTimerRef.current = window.setTimeout(
      () => setHoverCard(null),
      140,
    );
  }, [clearHoverHide]);
  React.useEffect(() => () => clearHoverHide(), [clearHoverHide]);
  const activeFclassRef = React.useRef(activeFclass);
  React.useEffect(() => {
    activeFclassRef.current = activeFclass;
  }, [activeFclass]);
  React.useEffect(() => {
    if (activeFclass == null) return;
    const stillExists = (layers ?? []).some((l) =>
      (l.fclasses ?? []).some((fc) => fc.value === activeFclass)
    );
    if (!stillExists) setActiveFclass(null);
  }, [layers, activeFclass]);
  const [pendingDem, setPendingDem] = React.useState<{
    rawBbox: [number, number, number, number];
    padding: number; // 0..0.5 fractional padding per side
    maxZoom: number;
    name: string;
  } | null>(null);
  const [cursorReadout, setCursorReadout] = React.useState<{
    lng: number;
    lat: number;
    alt: number | null;
  } | null>(null);
  // Info / Identify tool state
  const [infoMode, setInfoMode] = React.useState(false);
  const [infoPopup, setInfoPopup] = React.useState<{
    x: number;
    y: number;
    layer: string;
    properties: Record<string, unknown>;
  } | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const terrainBtnRef = React.useRef<HTMLButtonElement>(null);
  const demBtnRef = React.useRef<HTMLButtonElement>(null);
  const editGroupRef = React.useRef<HTMLDivElement>(null);
  const digitizeGroupRef = React.useRef<HTMLDivElement>(null);
  const simplifyBtnRef = React.useRef<HTMLButtonElement>(null);
  const smoothBtnRef = React.useRef<HTMLButtonElement>(null);
  const autoPolyBtnRef = React.useRef<HTMLButtonElement>(null);
  const [terrainSliderLeft, setTerrainSliderLeft] = React.useState<number | null>(null);
  const [demSliderLeft, setDemSliderLeft] = React.useState<number | null>(null);
  const [simplifySliderLeft, setSimplifySliderLeft] = React.useState<number | null>(null);
  const [smoothSliderLeft, setSmoothSliderLeft] = React.useState<number | null>(null);
  const [autoPolySliderLeft, setAutoPolySliderLeft] = React.useState<number | null>(null);
  const [autoPolyTolerance, setAutoPolyTolerance] = React.useState(1.0);
  const autoPolyToleranceRef = React.useRef(autoPolyTolerance);
  React.useEffect(() => {
    autoPolyToleranceRef.current = autoPolyTolerance;
  }, [autoPolyTolerance]);
  const [autoPolyMaxSurface, setAutoPolyMaxSurface] = React.useState(3.0);
  const [autoPolyCorridor, setAutoPolyCorridor] = React.useState(3);
  const autoPolyCorridorRef = React.useRef(autoPolyCorridor);
  React.useEffect(() => {
    autoPolyCorridorRef.current = autoPolyCorridor;
  }, [autoPolyCorridor]);
  // Counter bumped by the click handler when a new seed is picked; the
  // secondary live-preview effect watches it to trigger the initial grow.
  const [autoPolyGrowSeq, setAutoPolyGrowSeq] = React.useState(0);
  // Heavy data (ImageData + forbidden mask) stored in a ref so slider-
  // driven re-renders don't deep-copy megapixel buffers.
  const autoPolyGrowParamsRef = React.useRef<{
    seedX: number;
    seedY: number;
    imageData: ImageData;
    signature: AutoPolySignature;
    refArea: number; // pixel count inside the reference polygon
    forbidden: Uint8Array;
    dpr: number;
  } | null>(null);
  // Same pattern for line-mode A* path: heavy data in a ref, secondary
  // effect re-runs the path on tolerance changes.
  const autoPolyLineParamsRef = React.useRef<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    imageData: ImageData;
    signature: AutoPolySignature;
    // Stored so the signature can be re-sampled when the corridor slider
    // changes without re-picking the reference.
    refLinePix: [number, number][];
    refImageData: ImageData;
    dpr: number;
  } | null>(null);
  // The geometry produced by the last grow/path, held here so the click
  // handler and teardown can commit it.
  const autoPolyDraftGeomRef = React.useRef<GeoJSON.Geometry | null>(null);
  // Vesselness trace state — separate from autoPoly.
  const autoVesselBtnRef = React.useRef<HTMLButtonElement>(null);
  const [autoVesselSliderLeft, setAutoVesselSliderLeft] = React.useState<
    number | null
  >(null);
  const [vesselScaleMax, setVesselScaleMax] = React.useState(1.0);
  const [autoVesselSeq, setAutoVesselSeq] = React.useState(0);
  const autoVesselParamsRef = React.useRef<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    imageData: ImageData;
    dpr: number;
    cachedVesselness?: Float32Array;
    cachedScaleMax?: number;
  } | null>(null);
  const autoVesselDraftGeomRef = React.useRef<GeoJSON.Geometry | null>(null);
  // ONNX-based road segmentation trace state — separate from autoVessel.
  const autoSegmentBtnRef = React.useRef<HTMLButtonElement>(null);
  const [autoSegmentSliderLeft, setAutoSegmentSliderLeft] = React.useState<
    number | null
  >(null);
  const [autoSegmentSeq, setAutoSegmentSeq] = React.useState(0);
  const autoSegmentParamsRef = React.useRef<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    imageData: ImageData;
    dpr: number;
    cachedProb?: Float32Array;
  } | null>(null);
  const autoSegmentDraftGeomRef = React.useRef<GeoJSON.Geometry | null>(null);
  // Paint mask strokes stored as geographic coordinates so they survive
  // pan/zoom and can be rasterized to the current viewport on demand.
  // Each stroke records its brush width (CSS px) and the zoom level at
  // paint time so the geographic width stays fixed across zoom changes.
  const paintMaskStrokesRef = React.useRef<
    Array<{ coords: [number, number][]; brushCss: number; zoom: number }>
  >([]);
  const [paintMaskStrokeWidth, setPaintMaskStrokeWidth] = React.useState(30);
  const paintMaskStrokeWidthRef = React.useRef(paintMaskStrokeWidth);
  React.useEffect(() => {
    paintMaskStrokeWidthRef.current = paintMaskStrokeWidth;
  }, [paintMaskStrokeWidth]);
  const [rampPickerOpen, setRampPickerOpen] = React.useState(false);
  const rampPickerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const fittedKeyRef = React.useRef<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<
    { x: number; y: number; lng: number; lat: number } | null
  >(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);

  // Track fullscreen state at the viewport level so we can swap the chrome.
  React.useEffect(() => {
    const update = () => {
      const el = wrapperRef.current;
      setIsFullscreen(!!el && document.fullscreenElement === el);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  // Right-click on the map → open a custom context menu. maplibregl's
  // `contextmenu` event preventDefaults the native menu for us.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || freehand || autoPoly || autoVessel || autoSegment)
      return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      setContextMenu({
        x: e.point.x,
        y: e.point.y,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
    };
    map.on("contextmenu", handler);
    return () => {
      map.off("contextmenu", handler);
    };
  }, [styleReady, freehand, autoPoly, autoVessel, autoSegment]);

  // Position the context menu imperatively — repo lint forbids JSX style props,
  // and the click coordinates are pure runtime data so a CSS class won't do.
  React.useEffect(() => {
    const menu = contextMenuRef.current;
    if (!menu || !contextMenu) return;
    menu.style.left = `${contextMenu.x}px`;
    menu.style.top = `${contextMenu.y}px`;
  }, [contextMenu]);

  // Dismiss the context menu on outside click, escape, or camera move.
  React.useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const menu = contextMenuRef.current;
      if (menu && menu.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const onMove = () => setContextMenu(null);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    const map = mapRef.current;
    map?.on("movestart", onMove);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      map?.off("movestart", onMove);
    };
  }, [contextMenu]);

  const handleViewAll = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !data) {
      setContextMenu(null);
      return;
    }
    const bounds = geojsonBounds(data);
    if (bounds) {
      map.fitBounds(bounds as LngLatBoundsLike, {
        padding: 48,
        duration: 800,
      });
    }
    setContextMenu(null);
  }, [data]);

  const handleZoomTo = React.useCallback(
    (zoom: number) => {
      const map = mapRef.current;
      if (!map || !contextMenu) return;
      map.easeTo({
        center: [contextMenu.lng, contextMenu.lat],
        zoom,
        duration: 800,
      });
      setContextMenu(null);
    },
    [contextMenu]
  );

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
  const onDiscardRef = React.useRef(onDiscard);
  const onEditedRef = React.useRef(onEdited);
  const onAddedRef = React.useRef(onAdded);
  const onDeletedRef = React.useRef(onDeleted);
  const onReclassifyRef = React.useRef(onReclassify);
  const onToggleEditRef = React.useRef(onToggleEdit);
  const onToggleAddRef = React.useRef(onToggleAdd);
  const onToggleFreehandRef = React.useRef(onToggleFreehand);
  const onToggleAutoPolyRef = React.useRef(onToggleAutoPoly);
  const onToggleAutoVesselRef = React.useRef(onToggleAutoVessel);
  const onToggleAutoSegmentRef = React.useRef(onToggleAutoSegment);
  const onToggleSimplifyRef = React.useRef(onToggleSimplify);
  const onToggleSmoothRef = React.useRef(onToggleSmooth);
  const onToggleImportDemRef = React.useRef(onToggleImportDem);
  const onToggleDeleteRef = React.useRef(onToggleDelete);
  const onToggleReclassifyRef = React.useRef(onToggleReclassify);
  const onToggleTerrainRef = React.useRef(onToggleTerrain);
  const onToggleLayerVisibilityRef = React.useRef(onToggleLayerVisibility);
  const onToggleFclassVisibilityRef = React.useRef(onToggleFclassVisibility);
  const onConfirmDemDownloadRef = React.useRef(onConfirmDemDownload);
  const demNameSuggestionRef = React.useRef(demNameSuggestion);
  const demOpacityRef = React.useRef(demOpacity);
  // Min/max elevation actually present in the loaded DEM (drives the
  // legend entry). Null when no DEM is loaded.
  const [demRange, setDemRange] = React.useState<{
    min: number;
    max: number;
  } | null>(null);
  // Legend checkbox — independent of ``demFile`` so the user can flip the
  // overlay off without losing their selection.
  const [demVisible, setDemVisible] = React.useState(true);
  React.useEffect(() => {
    // Whenever a new DEM is selected, default back to visible.
    setDemVisible(true);
  }, [demFile]);
  const onSetTerrainExaggerationRef = React.useRef(onSetTerrainExaggeration);
  const onSetDemOpacityRef = React.useRef(onSetDemOpacity);
  const onSetDemColorRampRef = React.useRef(onSetDemColorRamp);
  React.useEffect(() => {
    onSaveRef.current = onSave;
    onDiscardRef.current = onDiscard;
    onEditedRef.current = onEdited;
    onAddedRef.current = onAdded;
    onDeletedRef.current = onDeleted;
    onReclassifyRef.current = onReclassify;
    onToggleEditRef.current = onToggleEdit;
    onToggleAddRef.current = onToggleAdd;
    onToggleFreehandRef.current = onToggleFreehand;
    onToggleAutoPolyRef.current = onToggleAutoPoly;
    onToggleAutoVesselRef.current = onToggleAutoVessel;
    onToggleAutoSegmentRef.current = onToggleAutoSegment;
    onToggleSimplifyRef.current = onToggleSimplify;
    onToggleSmoothRef.current = onToggleSmooth;
    onToggleImportDemRef.current = onToggleImportDem;
    onToggleDeleteRef.current = onToggleDelete;
    onToggleReclassifyRef.current = onToggleReclassify;
    onToggleTerrainRef.current = onToggleTerrain;
    onToggleLayerVisibilityRef.current = onToggleLayerVisibility;
    onToggleFclassVisibilityRef.current = onToggleFclassVisibility;
    onConfirmDemDownloadRef.current = onConfirmDemDownload;
    demNameSuggestionRef.current = demNameSuggestion;
    onSetTerrainExaggerationRef.current = onSetTerrainExaggeration;
    onSetDemOpacityRef.current = onSetDemOpacity;
    onSetDemColorRampRef.current = onSetDemColorRamp;
  });

  // Mutable working copy of the feature collection for in-session edits.
  // Kept in sync with upstream `data` whenever the file changes.
  const workingRef = React.useRef<GeoJSON.FeatureCollection | null>(null);
  React.useEffect(() => {
    workingRef.current = data
      ? (JSON.parse(JSON.stringify(data)) as GeoJSON.FeatureCollection)
      : null;
  }, [data, dataKey, discardKey]);

  // Simplify-mode selection. The slider is bound to `slider` (0–100), which
  // is mapped through a cubic curve onto an absolute tolerance scaled by the
  // feature's bbox diagonal — that gives fine control near zero and aggressive
  // reduction at the top of the slider regardless of the feature's size.
  const [simplifyState, setSimplifyState] = React.useState<{
    id: number;
    originalGeom: GeoJSON.Geometry;
    diagonal: number;
    baseVertices: number;
    slider: number;
  } | null>(null);

  const simplifiedPreview = React.useMemo<GeoJSON.Geometry | null>(() => {
    if (!simplifyState) return null;
    const tol =
      Math.pow(simplifyState.slider / 100, 3) * (simplifyState.diagonal / 4);
    return simplifyGeometry(simplifyState.originalGeom, tol);
  }, [simplifyState]);

  const simplifyStateRef = React.useRef(simplifyState);
  const simplifiedPreviewRef = React.useRef(simplifiedPreview);
  React.useEffect(() => {
    simplifyStateRef.current = simplifyState;
    simplifiedPreviewRef.current = simplifiedPreview;
  });

  // Smooth-mode selection. The slider (0–100) maps linearly to 0–6 Chaikin
  // iterations, producing progressively smoother curves.
  const [smoothState, setSmoothState] = React.useState<{
    id: number;
    originalGeom: GeoJSON.Geometry;
    baseVertices: number;
    slider: number;
  } | null>(null);

  const smoothedPreview = React.useMemo<GeoJSON.Geometry | null>(() => {
    if (!smoothState) return null;
    // Cubic mapping: fine control near 0, aggressive at the top.
    // 0 → 0 iterations, 50 → ~16, 100 → 200.
    const t = smoothState.slider / 100;
    const iterations = Math.round(t * t * t * 200);
    return smoothGeometry(smoothState.originalGeom, iterations);
  }, [smoothState]);

  const smoothStateRef = React.useRef(smoothState);
  const smoothedPreviewRef = React.useRef(smoothedPreview);
  React.useEffect(() => {
    smoothStateRef.current = smoothState;
    smoothedPreviewRef.current = smoothedPreview;
  }, [smoothState, smoothedPreview]);

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
      attributionControl: false,
      // MapLibre fetches raster-dem tiles, image sources, etc. through its
      // own pipeline, which doesn't carry cookies. Our backend-hosted DEM
      // tiles sit behind a session cookie, so anything pointed at the
      // project API origin needs credentials explicitly.
      transformRequest: (url) => {
        const origin = backendOriginRef.current;
        if (origin && url.startsWith(origin)) {
          return { url, credentials: "include" };
        }
        return { url };
      },
      // Required so the auto-polygon tool can read back the rendered
      // satellite tiles via canvas.drawImage after a frame has been drawn.
      // Option exists in maplibre-gl but isn't exposed in the current typings.
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
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
      setPitchDisplay(map.getPitch());
    });
    map.on("zoom", () => setZoomDisplay(map.getZoom()));
    map.on("pitch", () => setPitchDisplay(map.getPitch()));

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
    // Insert base below any existing overlay: DEM first (always lowest
    // overlay), then vector features, otherwise top of stack. Without the
    // DEM-overlay check, switching tiles while a DEM is displayed dropped
    // the new base on top of the stack and hid the DEM.
    const baseBeforeId = map.getLayer(DEM_OVERLAY_LAYER)
      ? DEM_OVERLAY_LAYER
      : map.getLayer(FEATURES_FILL_LAYER)
        ? FEATURES_FILL_LAYER
        : undefined;
    map.addLayer(
      {
        id: BASE_LAYER_ID,
        type: "raster",
        source: BASE_SOURCE_ID,
      },
      baseBeforeId
    );

    if (showLabels) {
      map.addSource(LABELS_SOURCE_ID, {
        type: "raster",
        tiles: [LABELS_URL],
        tileSize: 256,
      });
      // Labels stay below feature layers but above the DEM overlay so text
      // (roads, place names) remains legible over raster relief.
      const labelsBeforeId = map.getLayer(FEATURES_FILL_LAYER)
        ? FEATURES_FILL_LAYER
        : undefined;
      map.addLayer(
        {
          id: LABELS_LAYER_ID,
          type: "raster",
          source: LABELS_SOURCE_ID,
        },
        labelsBeforeId
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
      const dirtyExpr = buildLayerColorExpression(layers);
      map.addLayer({
        id: FEATURES_FILL_LAYER,
        type: "fill",
        source: FEATURES_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": dirtyExpr,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            ["==", ["coalesce", ["get", "__dirty"], 0], 1],
            0.3,
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
          "line-color": dirtyExpr,
          "line-width": [
            "case",
            ["==", ["coalesce", ["get", "__dirty"], 0], 1],
            3,
            2,
          ],
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
          "circle-radius": [
            "case",
            ["==", ["coalesce", ["get", "__dirty"], 0], 1],
            6,
            5,
          ],
          "circle-color": dirtyExpr,
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.85,
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["coalesce", ["get", "__dirty"], 0], 1],
            "#7c2d12",
            "#78350f",
          ],
          "circle-stroke-width": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            ["==", ["coalesce", ["get", "__dirty"], 0], 1],
            2,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dataKey, styleReady]);

  // Re-color and re-filter the feature layers whenever the layers list
  // changes (selection, visibility, palette). This runs independently of
  // the data-sync effect so toggling visibility never re-fits the map or
  // touches the GeoJSON source.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!map.getLayer(FEATURES_FILL_LAYER)) return;

    const colorExpr = buildLayerColorExpression(layers);
    map.setPaintProperty(FEATURES_FILL_LAYER, "fill-color", colorExpr);
    map.setPaintProperty(FEATURES_LINE_LAYER, "line-color", colorExpr);
    map.setPaintProperty(FEATURES_CIRCLE_LAYER, "circle-color", colorExpr);

    const hasLayers = layers && layers.length > 0;
    const visibleIds = hasLayers
      ? layers!.filter((l) => l.visible).map((l) => l.id)
      : [];
    const visibleLayersFilter = hasLayers
      ? ([
          "in",
          ["coalesce", ["get", "__layer"], "__none__"],
          ["literal", visibleIds],
        ] as unknown as maplibregl.FilterSpecification)
      : null;

    // Exclude any (layer, fclass) pair that the user has toggled off in the
    // legend. Matching on both __layer and fclass means hiding "forest" in
    // layer A does not hide "forest" in layer B.
    const hiddenFclassClauses: unknown[] = [];
    for (const l of layers ?? []) {
      for (const fc of l.fclasses ?? []) {
        if (fc.visible) continue;
        hiddenFclassClauses.push([
          "all",
          ["==", ["coalesce", ["get", "__layer"], "__none__"], l.id],
          ["==", ["to-string", ["coalesce", ["get", "fclass"], "__none__"]], fc.value],
        ]);
      }
    }
    const hiddenFclassFilter =
      hiddenFclassClauses.length > 0
        ? (["!", ["any", ...hiddenFclassClauses]] as unknown as maplibregl.FilterSpecification)
        : null;

    const combinedVisibility =
      visibleLayersFilter && hiddenFclassFilter
        ? (["all", visibleLayersFilter, hiddenFclassFilter] as unknown as maplibregl.FilterSpecification)
        : visibleLayersFilter ?? hiddenFclassFilter;
    const visibleFilter = combinedVisibility;

    const fillBase: maplibregl.FilterSpecification = [
      "==",
      ["geometry-type"],
      "Polygon",
    ] as unknown as maplibregl.FilterSpecification;
    const lineBase: maplibregl.FilterSpecification = [
      "any",
      ["==", ["geometry-type"], "LineString"],
      ["==", ["geometry-type"], "Polygon"],
    ] as unknown as maplibregl.FilterSpecification;
    const circleBase: maplibregl.FilterSpecification = [
      "==",
      ["geometry-type"],
      "Point",
    ] as unknown as maplibregl.FilterSpecification;

    map.setFilter(
      FEATURES_FILL_LAYER,
      visibleFilter
        ? (["all", fillBase, visibleFilter] as unknown as maplibregl.FilterSpecification)
        : fillBase
    );
    map.setFilter(
      FEATURES_LINE_LAYER,
      visibleFilter
        ? (["all", lineBase, visibleFilter] as unknown as maplibregl.FilterSpecification)
        : lineBase
    );
    map.setFilter(
      FEATURES_CIRCLE_LAYER,
      visibleFilter
        ? (["all", circleBase, visibleFilter] as unknown as maplibregl.FilterSpecification)
        : circleBase
    );
  }, [layers, styleReady, data]);

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
    // Depth counter avoids flicker between overlapping fill+outline layers
    // firing mouseenter/mouseleave for the same feature.
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = EDIT_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
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

      const fc = activeFclassRef.current;
      const feature: GeoJSON.Feature = {
        type: "Feature",
        properties: fc ? { fclass: fc } : {},
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

    // Pop the last vertex — used on dblclick to discard the duplicate
    // click that preceded the dblclick event.
    const popVertex = () => {
      if (coords.length === 0) return;
      coords.pop();
      const last = vertexMarkers.pop();
      last?.remove();
      updateDraftSource();
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      placeVertex(e.lngLat);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      // MapLibre fires click→click→dblclick for a double click, so the
      // second click has already added a duplicate vertex. Drop it before
      // committing so the user's double click is "finish", not "finish
      // with two overlapping vertices".
      popVertex();
      commit();
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    return () => {
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

  // --------------------------------------------------------------------
  // Freehand mode — hold the right mouse button to trace a polygon. Points
  // are sampled at a fixed pixel distance for a moderately dense outline.
  // Releasing the button pauses the stroke; the draft stays on screen so the
  // user can pan/zoom and continue with another right-button drag. Toggling
  // the freehand button off commits the shape.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !freehand) return;

    const SAMPLE_DIST = 10; // px between sampled vertices
    const shape = gpkgTypeToDrawShape(geometryType);
    const closed = shape === "Polygon";
    const coords: [number, number][] = [];
    let drawing = false;
    let lastPoint: { x: number; y: number } | null = null;

    // Right-button drag rotates by default — disable while freehand is active.
    const rotateWasEnabled = map.dragRotate.isEnabled();
    map.dragRotate.disable();

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
      },
    });

    const updateDraft = () => {
      const src = map.getSource(DRAFT_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      const geom = buildDraftGeometry(shape, coords);
      src.setData(
        geom
          ? {
              type: "FeatureCollection",
              features: [{ type: "Feature", properties: {}, geometry: geom }],
            }
          : draftEmpty
      );
    };

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    const localPoint = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const pushPoint = (pt: { x: number; y: number }) => {
      const ll = map.unproject([pt.x, pt.y]);
      coords.push([ll.lng, ll.lat]);
      updateDraft();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      drawing = true;
      const pt = localPoint(e);
      lastPoint = pt;
      pushPoint(pt);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!drawing) return;
      const pt = localPoint(e);
      if (lastPoint) {
        const dx = pt.x - lastPoint.x;
        const dy = pt.y - lastPoint.y;
        if (Math.hypot(dx, dy) < SAMPLE_DIST) return;
      }
      lastPoint = pt;
      pushPoint(pt);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !drawing) return;
      drawing = false;
      lastPoint = null;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.style.cursor = "";
      if (rotateWasEnabled) map.dragRotate.enable();

      const minCount = closed ? 3 : 2;
      if (coords.length >= minCount) {
        let geom: GeoJSON.Geometry = closed
          ? { type: "Polygon", coordinates: [[...coords, coords[0]]] }
          : { type: "LineString", coordinates: coords };
        geom = wrapGeomToType(geom, geometryType);
        const fc = activeFclassRef.current;
        onAddedRef.current({
          type: "Feature",
          properties: fc ? { fclass: fc } : {},
          geometry: geom,
        });
      }

      for (const layerId of [DRAFT_LINE_LAYER, DRAFT_FILL_LAYER]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(DRAFT_SOURCE_ID)) map.removeSource(DRAFT_SOURCE_ID);
    };
  }, [freehand, geometryType, styleReady]);

  // --------------------------------------------------------------------
  // Auto-trace mode. The tool adapts its click semantics to the active
  // layer's geometry type:
  //   Polygon layers — two-click workflow: pick a reference polygon, then
  //     click inside similar regions to region-grow a matching mask.
  //   Line layers — three-click workflow: pick a reference polyline, then
  //     click the start and end of a new road/track; an A* least-cost path
  //     through the satellite imagery is traced along the matching signature.
  // In both cases the signature persists until the tool is toggled off so
  // the user can trace several features in a row without reactivating.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !autoPoly) return;
    const shape = gpkgTypeToDrawShape(geometryType);
    if (shape !== "Polygon" && shape !== "LineString") return;

    const SIG_SOURCE_ID = "auto-poly-sig";
    const SIG_LINE_LAYER = "auto-poly-sig-line";
    const START_SOURCE_ID = "auto-poly-start";
    const START_CIRCLE_LAYER = "auto-poly-start-circle";

    if (!map.getSource(SIG_SOURCE_ID)) {
      map.addSource(SIG_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: SIG_LINE_LAYER,
        type: "line",
        source: SIG_SOURCE_ID,
        paint: {
          "line-color": "#22d3ee",
          "line-width": 3,
          "line-dasharray": [2, 2],
          "line-opacity": 0.9,
        },
      });
    }
    if (!map.getSource(START_SOURCE_ID)) {
      map.addSource(START_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: START_CIRCLE_LAYER,
        type: "circle",
        source: START_SOURCE_ID,
        paint: {
          "circle-radius": 6,
          "circle-color": "#22d3ee",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 2,
        },
      });
    }

    const setSigPreview = (coords: GeoJSON.Position[] | null) => {
      const src = map.getSource(SIG_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData(
        coords
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: coords },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] }
      );
    };

    const setStartPreview = (lngLat: [number, number] | null) => {
      const src = map.getSource(START_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData(
        lngLat
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: lngLat },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] }
      );
    };

    let signature: AutoPolySignature | null = null;
    let refPixelArea = 0;
    // Kept so the corridor slider can re-sample the signature without
    // re-picking the reference line.
    let refLinePix: [number, number][] | null = null;
    let refImageData: ImageData | null = null;
    let pendingStart: { lng: number; lat: number } | null = null;
    let sampling = false;
    let cancelled = false;

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    // ---- Magnifier lens for line-mode start/end point picking ----
    const LENS_CSS = 140; // px
    const MAG = 4;
    const SAMPLE_CSS = LENS_CSS / MAG; // CSS pixels sampled around the cursor
    let magnifierEl: HTMLDivElement | null = null;
    let lensCanvas: HTMLCanvasElement | null = null;
    let lensCtx: CanvasRenderingContext2D | null = null;
    // Offscreen 2D copy of the WebGL canvas, updated on every MapLibre
    // render event. Reading directly from the WebGL canvas outside the
    // render pass returns a blank buffer when preserveDrawingBuffer fails;
    // this offscreen copy is always readable.
    let frameCanvas: HTMLCanvasElement | null = null;
    let frameCtx: CanvasRenderingContext2D | null = null;

    const captureFrame = () => {
      if (!frameCanvas || !frameCtx) return;
      const w = canvas.width;
      const h = canvas.height;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w;
        frameCanvas.height = h;
      }
      frameCtx.drawImage(canvas, 0, 0);
    };

    if (shape === "LineString") {
      const dpr = window.devicePixelRatio || 1;

      // Offscreen frame buffer
      frameCanvas = document.createElement("canvas");
      frameCanvas.width = canvas.width;
      frameCanvas.height = canvas.height;
      frameCtx = frameCanvas.getContext("2d");
      // Capture the current frame immediately so the magnifier has content
      // even before the next render event fires.
      captureFrame();
      map.on("render", captureFrame);

      magnifierEl = document.createElement("div");
      magnifierEl.className = "glb-magnifier";

      lensCanvas = document.createElement("canvas");
      lensCanvas.width = Math.round(LENS_CSS * dpr);
      lensCanvas.height = Math.round(LENS_CSS * dpr);
      magnifierEl.appendChild(lensCanvas);
      lensCtx = lensCanvas.getContext("2d");

      // SVG crosshair overlay
      const crossSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      crossSvg.setAttribute("class", "glb-magnifier__crosshair");
      crossSvg.setAttribute("viewBox", "0 0 140 140");
      crossSvg.innerHTML = [
        '<line x1="70" y1="0" x2="70" y2="60" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="70" y1="80" x2="70" y2="140" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="0" y1="70" x2="60" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="80" y1="70" x2="140" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<circle cx="70" cy="70" r="3" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>',
      ].join("");
      magnifierEl.appendChild(crossSvg);

      wrapperRef.current?.appendChild(magnifierEl);
    }

    const showMagnifier = (show: boolean) => {
      if (magnifierEl) {
        magnifierEl.style.display = show ? "block" : "none";
      }
    };

    const updateMagnifier = (cssX: number, cssY: number) => {
      if (!magnifierEl || !lensCanvas || !lensCtx || !frameCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const srcSize = Math.round(SAMPLE_CSS * dpr);
      const sx = Math.round(cssX * dpr - srcSize / 2);
      const sy = Math.round(cssY * dpr - srcSize / 2);
      const lw = lensCanvas.width;
      const lh = lensCanvas.height;
      lensCtx.clearRect(0, 0, lw, lh);
      lensCtx.imageSmoothingEnabled = false;
      // Read from the offscreen 2D copy, not the WebGL canvas directly.
      lensCtx.drawImage(frameCanvas, sx, sy, srcSize, srcSize, 0, 0, lw, lh);

      // Center the lens on the cursor. pointer-events: none ensures clicks
      // pass through to the map canvas underneath.
      magnifierEl.style.left = `${cssX - LENS_CSS / 2}px`;
      magnifierEl.style.top = `${cssY - LENS_CSS / 2}px`;
    };

    const onMagMouseMove = (e: maplibregl.MapMouseEvent) => {
      // Only show the magnifier when picking start/end points,
      // and hide it while right-drag painting is active.
      if (!signature || maskDrawing) {
        showMagnifier(false);
        return;
      }
      showMagnifier(true);
      updateMagnifier(e.point.x, e.point.y);
    };

    const onMagMouseLeave = () => showMagnifier(false);

    if (shape === "LineString") {
      map.on("mousemove", onMagMouseMove);
      map.on("mouseout", onMagMouseLeave);
    }

    // ---- Mask painting (line mode only) — right-drag paints corridor ---
    let maskOverlay: HTMLCanvasElement | null = null;
    let maskOCtx: CanvasRenderingContext2D | null = null;
    let maskOffscreen: HTMLCanvasElement | null = null;
    let maskOffCtx: CanvasRenderingContext2D | null = null;
    let maskDrawing = false;
    let maskCurrentStroke: {
      coords: [number, number][];
      brushCss: number;
      zoom: number;
    } | null = null;
    let maskLastPt: { x: number; y: number } | null = null;
    const MASK_SAMPLE_DIST = 6;

    const redrawMaskOverlay = () => {
      if (!maskOCtx || !maskOffCtx || !maskOverlay || !maskOffscreen) return;
      const w = canvas.width;
      const h = canvas.height;
      if (maskOverlay.width !== w || maskOverlay.height !== h) {
        maskOverlay.width = w;
        maskOverlay.height = h;
      }
      if (maskOffscreen.width !== w || maskOffscreen.height !== h) {
        maskOffscreen.width = w;
        maskOffscreen.height = h;
      }
      maskOCtx.clearRect(0, 0, w, h);
      const strokes = paintMaskStrokesRef.current;
      if (strokes.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const curZoom = map.getZoom();
      maskOffCtx.clearRect(0, 0, w, h);
      maskOffCtx.strokeStyle = "#3b82f6";
      maskOffCtx.lineCap = "round";
      maskOffCtx.lineJoin = "round";
      for (const stroke of strokes) {
        if (stroke.coords.length < 2) continue;
        const scale = Math.pow(2, curZoom - stroke.zoom);
        maskOffCtx.lineWidth = stroke.brushCss * scale * dpr;
        maskOffCtx.beginPath();
        for (let i = 0; i < stroke.coords.length; i++) {
          const p = map.project(stroke.coords[i] as [number, number]);
          const px = p.x * dpr;
          const py = p.y * dpr;
          if (i === 0) maskOffCtx.moveTo(px, py);
          else maskOffCtx.lineTo(px, py);
        }
        maskOffCtx.stroke();
      }
      maskOCtx.globalAlpha = 0.35;
      maskOCtx.drawImage(maskOffscreen, 0, 0);
      maskOCtx.globalAlpha = 1;
    };

    const onMaskMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      maskDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke = {
        coords: [
          [ll.lng, ll.lat],
          [ll.lng, ll.lat],
        ],
        brushCss: paintMaskStrokeWidthRef.current,
        zoom: map.getZoom(),
      };
      paintMaskStrokesRef.current.push(maskCurrentStroke);
      redrawMaskOverlay();
    };

    const onMaskMouseMove = (e: MouseEvent) => {
      if (!maskDrawing || !maskCurrentStroke || !maskLastPt) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const dx = sx - maskLastPt.x;
      const dy = sy - maskLastPt.y;
      if (Math.hypot(dx, dy) < MASK_SAMPLE_DIST) return;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke.coords.push([ll.lng, ll.lat]);
      redrawMaskOverlay();
    };

    const onMaskMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !maskDrawing) return;
      maskDrawing = false;
      maskCurrentStroke = null;
      maskLastPt = null;
    };

    const onMaskContextMenu = (e: Event) => e.preventDefault();

    if (shape === "LineString") {
      // Clear strokes when the tool activates.
      paintMaskStrokesRef.current = [];

      // Disable right-button rotation so right-drag paints.
      map.dragRotate.disable();

      maskOverlay = document.createElement("canvas");
      maskOverlay.className = "glb-paint-mask-canvas";
      maskOverlay.width = canvas.width;
      maskOverlay.height = canvas.height;
      wrapperRef.current?.appendChild(maskOverlay);
      maskOCtx = maskOverlay.getContext("2d");
      maskOffscreen = document.createElement("canvas");
      maskOffscreen.width = canvas.width;
      maskOffscreen.height = canvas.height;
      maskOffCtx = maskOffscreen.getContext("2d");

      map.on("render", redrawMaskOverlay);
      canvas.addEventListener("mousedown", onMaskMouseDown);
      window.addEventListener("mousemove", onMaskMouseMove);
      window.addEventListener("mouseup", onMaskMouseUp);
      canvas.addEventListener("contextmenu", onMaskContextMenu);
    }

    // Hide any non-basemap layer so the sampled pixels are the raw satellite
    // tiles. Raster, raster-dem, background and hillshade layers stay on so
    // the satellite imagery (and DEM overlay, if any) remains visible and
    // readable.
    const collectOverlayLayers = (): string[] => {
      const style = map.getStyle();
      const ids: string[] = [];
      for (const layer of style.layers ?? []) {
        const t = layer.type as string;
        if (
          t === "raster" ||
          t === "background" ||
          t === "hillshade" ||
          t === "color-relief"
        )
          continue;
        ids.push(layer.id);
      }
      return ids;
    };

    const captureSatelliteImageData = async (): Promise<ImageData | null> => {
      const ids = collectOverlayLayers();
      const prev: Array<{ id: string; vis: string }> = [];
      for (const id of ids) {
        const v =
          (map.getLayoutProperty(id, "visibility") as string | undefined) ??
          "visible";
        prev.push({ id, vis: v });
        map.setLayoutProperty(id, "visibility", "none");
      }
      try {
        map.triggerRepaint();
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          map.once("idle", done);
        });
        if (cancelled) return null;
        const gl = map.getCanvas();
        const w = gl.width;
        const h = gl.height;
        const temp = document.createElement("canvas");
        temp.width = w;
        temp.height = h;
        const ctx = temp.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(gl, 0, 0);
        try {
          return ctx.getImageData(0, 0, w, h);
        } catch {
          // Canvas is tainted — a tile source didn't serve CORS headers.
          return null;
        }
      } finally {
        for (const { id, vis } of prev) {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", vis);
          }
        }
      }
    };

    const extractOuterRing = (
      geom: GeoJSON.Geometry | undefined
    ): GeoJSON.Position[] | null => {
      if (!geom) return null;
      if (geom.type === "Polygon") return geom.coordinates[0] ?? null;
      if (geom.type === "MultiPolygon") {
        let best: GeoJSON.Position[] | null = null;
        for (const poly of geom.coordinates) {
          const ring = poly[0];
          if (!ring) continue;
          if (!best || ring.length > best.length) best = ring;
        }
        return best;
      }
      return null;
    };

    const extractLineCoords = (
      geom: GeoJSON.Geometry | undefined
    ): GeoJSON.Position[] | null => {
      if (!geom) return null;
      if (geom.type === "LineString") return geom.coordinates;
      if (geom.type === "MultiLineString") {
        // Pick the longest constituent line by vertex count.
        let best: GeoJSON.Position[] | null = null;
        for (const line of geom.coordinates) {
          if (!best || line.length > best.length) best = line;
        }
        return best;
      }
      return null;
    };

    const projectToPixels = (
      coords: GeoJSON.Position[],
      dpr: number
    ): [number, number][] =>
      coords.map(([lng, lat]) => {
        const p = map.project([lng, lat] as [number, number]);
        return [p.x * dpr, p.y * dpr];
      });

    const AP_DRAFT_SOURCE = "auto-poly-draft";
    const AP_DRAFT_FILL = "auto-poly-draft-fill";
    const AP_DRAFT_LINE = "auto-poly-draft-line";

    if (!map.getSource(AP_DRAFT_SOURCE)) {
      map.addSource(AP_DRAFT_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: AP_DRAFT_FILL,
        type: "fill",
        source: AP_DRAFT_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": SELECTED_COLOR, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: AP_DRAFT_LINE,
        type: "line",
        source: AP_DRAFT_SOURCE,
        paint: { "line-color": SELECTED_COLOR, "line-width": 2 },
      });
    }

    // Commit the current draft (polygon or line) and clear preview.
    const commitDraft = (): void => {
      const geom = autoPolyDraftGeomRef.current;
      if (!geom) return;
      autoPolyDraftGeomRef.current = null;
      autoPolyGrowParamsRef.current = null;
      autoPolyLineParamsRef.current = null;
      const wrapped = wrapGeomToType(geom, geometryType);
      const fc = activeFclassRef.current;
      onAddedRef.current({
        type: "Feature",
        properties: fc ? { fclass: fc } : {},
        geometry: wrapped,
      });
      const src = map.getSource(AP_DRAFT_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    };

    const onPolygonClick = async (
      e: maplibregl.MapMouseEvent,
      dpr: number
    ): Promise<void> => {
      if (!signature) {
        const layerIds = [FEATURES_FILL_LAYER, EDIT_FILL_LAYER].filter(
          (id) => !!map.getLayer(id)
        );
        if (layerIds.length === 0) return;
        const hits = map.queryRenderedFeatures(
          [
            [e.point.x - 4, e.point.y - 4],
            [e.point.x + 4, e.point.y + 4],
          ],
          { layers: layerIds }
        );
        let refRing: GeoJSON.Position[] | null = null;
        for (const h of hits) {
          refRing = extractOuterRing(
            h.geometry as GeoJSON.Geometry | undefined
          );
          if (refRing && refRing.length >= 3) break;
        }
        if (!refRing) return;

        const img = await captureSatelliteImageData();
        if (!img || cancelled) return;
        const ringPix = projectToPixels(refRing, dpr);
        const sig = sampleSignatureInsideRing(img, ringPix);
        if (!sig) return;
        signature = sig;
        // Store the reference area (pixel count) for the max-surface cap.
        refPixelArea = sig.samples;
        setSigPreview(refRing);
        return;
      }

      // Commit the previous draft (if any) before starting a new grow.
      commitDraft();

      const seedX = Math.round(e.point.x * dpr);
      const seedY = Math.round(e.point.y * dpr);
      const img = await captureSatelliteImageData();
      if (!img || cancelled) return;
      // Build forbidden mask from all existing polygons so the grow respects
      // already-digitized boundaries.
      const forbidden = buildForbiddenMask(
        map,
        workingRef.current,
        img.width,
        img.height,
        dpr
      );
      autoPolyGrowParamsRef.current = {
        seedX,
        seedY,
        imageData: img,
        signature,
        refArea: refPixelArea,
        forbidden,
        dpr,
      };
      // Bump the sequence counter so the secondary live-preview effect fires.
      setAutoPolyGrowSeq((n) => n + 1);
    };

    const onLineClick = async (
      e: maplibregl.MapMouseEvent,
      dpr: number
    ): Promise<void> => {
      if (!signature) {
        // Step 1: pick a reference polyline under the click.
        const layerIds = [FEATURES_LINE_LAYER, EDIT_LINE_LAYER].filter(
          (id) => !!map.getLayer(id)
        );
        if (layerIds.length === 0) return;
        const hits = map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: layerIds }
        );
        let refLine: GeoJSON.Position[] | null = null;
        for (const h of hits) {
          refLine = extractLineCoords(
            h.geometry as GeoJSON.Geometry | undefined
          );
          if (refLine && refLine.length >= 2) break;
        }
        if (!refLine) return;

        const img = await captureSatelliteImageData();
        if (!img || cancelled) return;
        const linePix = projectToPixels(refLine, dpr);
        const sig = sampleSignatureAlongLine(
          img,
          linePix,
          autoPolyCorridorRef.current
        );
        if (!sig) return;
        signature = sig;
        refLinePix = linePix;
        refImageData = img;
        setSigPreview(refLine);
        return;
      }

      if (!pendingStart) {
        // Step 2: record the start of the new road.
        pendingStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        setStartPreview([e.lngLat.lng, e.lngLat.lat]);
        return;
      }

      // Step 3: end click — commit previous draft, then store A* params
      // so the secondary live-preview effect runs the path. The draft stays
      // on-screen as a preview that reacts to the Tol slider; next start
      // click (or toggling off) commits it.
      commitDraft();

      const img = await captureSatelliteImageData();
      if (!img || cancelled) return;
      const startPt = map.project([pendingStart.lng, pendingStart.lat]);
      const sx = Math.round(startPt.x * dpr);
      const sy = Math.round(startPt.y * dpr);
      const ex = Math.round(e.point.x * dpr);
      const ey = Math.round(e.point.y * dpr);
      pendingStart = null;
      setStartPreview(null);
      autoPolyLineParamsRef.current = {
        startX: sx,
        startY: sy,
        endX: ex,
        endY: ey,
        imageData: img,
        signature,
        refLinePix: refLinePix ?? [],
        refImageData: refImageData ?? img,
        dpr,
      };
      setAutoPolyGrowSeq((n) => n + 1);
    };

    const onMapClick = async (e: maplibregl.MapMouseEvent) => {
      if (sampling) return;
      sampling = true;
      try {
        const dpr = window.devicePixelRatio || 1;
        if (shape === "Polygon") {
          await onPolygonClick(e, dpr);
        } else {
          await onLineClick(e, dpr);
        }
      } finally {
        sampling = false;
      }
    };

    map.on("click", onMapClick);

    return () => {
      cancelled = true;
      // Commit the current draft when the tool is toggled off.
      commitDraft();
      map.off("click", onMapClick);
      canvas.style.cursor = "";
      autoPolyGrowParamsRef.current = null;
      autoPolyLineParamsRef.current = null;
      autoPolyDraftGeomRef.current = null;

      // Magnifier + mask painting cleanup
      if (shape === "LineString") {
        map.off("render", captureFrame);
        map.off("mousemove", onMagMouseMove);
        map.off("mouseout", onMagMouseLeave);
        map.off("render", redrawMaskOverlay);
        canvas.removeEventListener("mousedown", onMaskMouseDown);
        window.removeEventListener("mousemove", onMaskMouseMove);
        window.removeEventListener("mouseup", onMaskMouseUp);
        canvas.removeEventListener("contextmenu", onMaskContextMenu);
        map.dragRotate.enable();
      }
      if (magnifierEl && magnifierEl.parentNode) {
        magnifierEl.parentNode.removeChild(magnifierEl);
      }
      if (maskOverlay && maskOverlay.parentNode) {
        maskOverlay.parentNode.removeChild(maskOverlay);
      }
      frameCanvas = null;
      frameCtx = null;

      for (const layerId of [
        AP_DRAFT_LINE,
        AP_DRAFT_FILL,
        START_CIRCLE_LAYER,
        SIG_LINE_LAYER,
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const srcId of [
        AP_DRAFT_SOURCE,
        START_SOURCE_ID,
        SIG_SOURCE_ID,
        "paint-mask-strokes",
      ]) {
        if (map.getSource(srcId)) map.removeSource(srcId);
      }
      paintMaskStrokesRef.current = [];
    };
  }, [autoPoly, geometryType, styleReady]);

  // Secondary auto-trace effect: re-runs the polygon region grow or line
  // A* path whenever the tolerance or max-surface sliders change, or a new
  // seed/endpoint is clicked. Debounced at 80 ms so rapid slider scrubbing
  // doesn't queue up expensive path operations.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoPoly) return;
    const polyParams = autoPolyGrowParamsRef.current;
    const lineParams = autoPolyLineParamsRef.current;
    const src = map.getSource("auto-poly-draft") as
      | maplibregl.GeoJSONSource
      | undefined;
    if ((!polyParams && !lineParams) || !src) {
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      autoPolyDraftGeomRef.current = null;
      return;
    }

    const tol = autoPolyTolerance;
    const maxSurf = autoPolyMaxSurface;
    const timer = window.setTimeout(() => {
      const clearDraft = () => {
        src.setData({ type: "FeatureCollection", features: [] });
        autoPolyDraftGeomRef.current = null;
      };

      if (polyParams) {
        // --- Polygon mode: region grow ---
        const maxPx = Math.round(polyParams.refArea * maxSurf);
        const result = regionGrowFromSeed(
          polyParams.imageData,
          polyParams.seedX,
          polyParams.seedY,
          polyParams.signature,
          tol,
          maxPx,
          polyParams.forbidden
        );
        if (!result) {
          clearDraft();
          return;
        }
        const contour = traceMaskContour(result);
        if (!contour || contour.length < 4) {
          clearDraft();
          return;
        }
        const dpr = polyParams.dpr;
        const ring: GeoJSON.Position[] = contour.map(([px, py]) => {
          const ll = map.unproject([px / dpr, py / dpr]);
          return [ll.lng, ll.lat];
        });
        let geom: GeoJSON.Geometry = {
          type: "Polygon",
          coordinates: [ring],
        };
        const diag = geomBboxDiagonal(geom);
        geom = simplifyGeometry(geom, diag / 400);
        autoPolyDraftGeomRef.current = geom;
        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: geom }],
        });
      } else if (lineParams) {
        // --- Line mode: A* least-cost path ---
        // Re-sample the signature from the reference line with the current
        // corridor width so changing the slider updates the cost map live.
        const corridor = autoPolyCorridor;
        const liveSig =
          lineParams.refLinePix.length >= 2
            ? sampleSignatureAlongLine(
                lineParams.refImageData,
                lineParams.refLinePix,
                corridor
              ) ?? lineParams.signature
            : lineParams.signature;
        // Rasterize the paint mask from geographic strokes into the
        // current viewport's pixel space before each A* run.
        const rasterizedMask =
          paintMaskStrokesRef.current.length > 0
            ? rasterizePaintMaskStrokes(
                map,
                paintMaskStrokesRef.current,
                lineParams.imageData.width,
                lineParams.imageData.height,
                lineParams.dpr
              )
            : null;
        const path = astarLeastCostPath(
          lineParams.imageData,
          liveSig,
          tol,
          lineParams.startX,
          lineParams.startY,
          lineParams.endX,
          lineParams.endY,
          rasterizedMask
        );
        if (!path) {
          clearDraft();
          return;
        }
        const dpr = lineParams.dpr;
        const lineLL: GeoJSON.Position[] = path.map(([px, py]) => {
          const ll = map.unproject([px / dpr, py / dpr]);
          return [ll.lng, ll.lat];
        });
        let geom: GeoJSON.Geometry = {
          type: "LineString",
          coordinates: lineLL,
        };
        const diag = geomBboxDiagonal(geom);
        geom = simplifyGeometry(geom, diag / 400);
        autoPolyDraftGeomRef.current = geom;
        src.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: geom }],
        });
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [autoPoly, autoPolyTolerance, autoPolyMaxSurface, autoPolyCorridor, autoPolyGrowSeq]);

  // --------------------------------------------------------------------
  // Vesselness trace mode. Two-click workflow: click start, click end.
  // The Frangi vesselness filter detects road-like features in the
  // satellite imagery; A* paths through the vesselness cost field.
  // Mask painting (right-drag) is available, same as autoPoly line mode.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !autoVessel) return;
    if (gpkgTypeToDrawShape(geometryType) !== "LineString") return;

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    const VD_SOURCE = "auto-vessel-draft";
    const VD_LINE = "auto-vessel-draft-line";
    const VS_SOURCE = "auto-vessel-start";
    const VS_CIRCLE = "auto-vessel-start-circle";

    if (!map.getSource(VD_SOURCE)) {
      map.addSource(VD_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: VD_LINE,
        type: "line",
        source: VD_SOURCE,
        paint: { "line-color": SELECTED_COLOR, "line-width": 2 },
      });
    }
    if (!map.getSource(VS_SOURCE)) {
      map.addSource(VS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: VS_CIRCLE,
        type: "circle",
        source: VS_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": "#22d3ee",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 2,
        },
      });
    }

    const setStartPreview = (lngLat: [number, number] | null) => {
      const src = map.getSource(VS_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData(
        lngLat
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: lngLat },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] }
      );
    };

    const commitDraft = (): void => {
      const geom = autoVesselDraftGeomRef.current;
      if (!geom) return;
      autoVesselDraftGeomRef.current = null;
      autoVesselParamsRef.current = null;
      const wrapped = wrapGeomToType(geom, geometryType);
      const fc = activeFclassRef.current;
      onAddedRef.current({
        type: "Feature",
        properties: fc ? { fclass: fc } : {},
        geometry: wrapped,
      });
      const src = map.getSource(VD_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    };

    let pendingStart: { lng: number; lat: number } | null = null;
    let sampling = false;
    let cancelled = false;

    // ---- Magnifier (same as autoPoly line mode) ----
    const LENS_CSS = 140;
    const MAG = 4;
    const SAMPLE_CSS = LENS_CSS / MAG;
    let magnifierEl: HTMLDivElement | null = null;
    let lensCanvas: HTMLCanvasElement | null = null;
    let lensCtx: CanvasRenderingContext2D | null = null;
    let frameCanvas: HTMLCanvasElement | null = null;
    let frameCtx: CanvasRenderingContext2D | null = null;

    const captureFrame = () => {
      if (!frameCanvas || !frameCtx) return;
      const w = canvas.width;
      const h = canvas.height;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w;
        frameCanvas.height = h;
      }
      frameCtx.drawImage(canvas, 0, 0);
    };

    {
      const dpr = window.devicePixelRatio || 1;
      frameCanvas = document.createElement("canvas");
      frameCanvas.width = canvas.width;
      frameCanvas.height = canvas.height;
      frameCtx = frameCanvas.getContext("2d");
      captureFrame();
      map.on("render", captureFrame);

      magnifierEl = document.createElement("div");
      magnifierEl.className = "glb-magnifier";
      lensCanvas = document.createElement("canvas");
      lensCanvas.width = Math.round(LENS_CSS * dpr);
      lensCanvas.height = Math.round(LENS_CSS * dpr);
      magnifierEl.appendChild(lensCanvas);
      lensCtx = lensCanvas.getContext("2d");
      const crossSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      crossSvg.setAttribute("class", "glb-magnifier__crosshair");
      crossSvg.setAttribute("viewBox", "0 0 140 140");
      crossSvg.innerHTML = [
        '<line x1="70" y1="0" x2="70" y2="60" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="70" y1="80" x2="70" y2="140" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="0" y1="70" x2="60" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="80" y1="70" x2="140" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<circle cx="70" cy="70" r="3" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>',
      ].join("");
      magnifierEl.appendChild(crossSvg);
      wrapperRef.current?.appendChild(magnifierEl);
    }

    const showMagnifier = (show: boolean) => {
      if (magnifierEl) magnifierEl.style.display = show ? "block" : "none";
    };
    const updateMagnifier = (cssX: number, cssY: number) => {
      if (!magnifierEl || !lensCanvas || !lensCtx || !frameCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const srcSize = Math.round(SAMPLE_CSS * dpr);
      const sx = Math.round(cssX * dpr - srcSize / 2);
      const sy = Math.round(cssY * dpr - srcSize / 2);
      const lw = lensCanvas.width;
      const lh = lensCanvas.height;
      lensCtx.clearRect(0, 0, lw, lh);
      lensCtx.imageSmoothingEnabled = false;
      lensCtx.drawImage(frameCanvas, sx, sy, srcSize, srcSize, 0, 0, lw, lh);
      magnifierEl.style.left = `${cssX - LENS_CSS / 2}px`;
      magnifierEl.style.top = `${cssY - LENS_CSS / 2}px`;
    };
    const onMagMouseMove = (e: maplibregl.MapMouseEvent) => {
      // Hide the magnifier while right-drag painting is active.
      if (maskDrawing) {
        showMagnifier(false);
        return;
      }
      showMagnifier(true);
      updateMagnifier(e.point.x, e.point.y);
    };
    const onMagMouseLeave = () => showMagnifier(false);
    map.on("mousemove", onMagMouseMove);
    map.on("mouseout", onMagMouseLeave);

    // ---- Mask painting (same as autoPoly line mode) ----
    let maskOverlay: HTMLCanvasElement | null = null;
    let maskOCtx: CanvasRenderingContext2D | null = null;
    let maskOffscreen: HTMLCanvasElement | null = null;
    let maskOffCtx: CanvasRenderingContext2D | null = null;
    let maskDrawing = false;
    let maskCurrentStroke: {
      coords: [number, number][];
      brushCss: number;
      zoom: number;
    } | null = null;
    let maskLastPt: { x: number; y: number } | null = null;
    const MASK_SAMPLE_DIST = 6;

    const redrawMaskOverlay = () => {
      if (!maskOCtx || !maskOffCtx || !maskOverlay || !maskOffscreen) return;
      const w = canvas.width;
      const h = canvas.height;
      if (maskOverlay.width !== w || maskOverlay.height !== h) {
        maskOverlay.width = w;
        maskOverlay.height = h;
      }
      if (maskOffscreen.width !== w || maskOffscreen.height !== h) {
        maskOffscreen.width = w;
        maskOffscreen.height = h;
      }
      maskOCtx.clearRect(0, 0, w, h);
      const strokes = paintMaskStrokesRef.current;
      if (strokes.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const curZoom = map.getZoom();
      maskOffCtx.clearRect(0, 0, w, h);
      maskOffCtx.strokeStyle = "#3b82f6";
      maskOffCtx.lineCap = "round";
      maskOffCtx.lineJoin = "round";
      for (const stroke of strokes) {
        if (stroke.coords.length < 2) continue;
        const scale = Math.pow(2, curZoom - stroke.zoom);
        maskOffCtx.lineWidth = stroke.brushCss * scale * dpr;
        maskOffCtx.beginPath();
        for (let i = 0; i < stroke.coords.length; i++) {
          const p = map.project(stroke.coords[i] as [number, number]);
          const px = p.x * dpr;
          const py = p.y * dpr;
          if (i === 0) maskOffCtx.moveTo(px, py);
          else maskOffCtx.lineTo(px, py);
        }
        maskOffCtx.stroke();
      }
      maskOCtx.globalAlpha = 0.35;
      maskOCtx.drawImage(maskOffscreen, 0, 0);
      maskOCtx.globalAlpha = 1;
    };

    const onMaskMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      maskDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke = {
        coords: [
          [ll.lng, ll.lat],
          [ll.lng, ll.lat],
        ],
        brushCss: paintMaskStrokeWidthRef.current,
        zoom: map.getZoom(),
      };
      paintMaskStrokesRef.current.push(maskCurrentStroke);
      redrawMaskOverlay();
    };
    const onMaskMouseMove = (e: MouseEvent) => {
      if (!maskDrawing || !maskCurrentStroke || !maskLastPt) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (Math.hypot(sx - maskLastPt.x, sy - maskLastPt.y) < MASK_SAMPLE_DIST)
        return;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke.coords.push([ll.lng, ll.lat]);
      redrawMaskOverlay();
    };
    const onMaskMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !maskDrawing) return;
      maskDrawing = false;
      maskCurrentStroke = null;
      maskLastPt = null;
    };
    const onMaskContextMenu = (e: Event) => e.preventDefault();

    paintMaskStrokesRef.current = [];
    map.dragRotate.disable();
    maskOverlay = document.createElement("canvas");
    maskOverlay.className = "glb-paint-mask-canvas";
    maskOverlay.width = canvas.width;
    maskOverlay.height = canvas.height;
    wrapperRef.current?.appendChild(maskOverlay);
    maskOCtx = maskOverlay.getContext("2d");
    maskOffscreen = document.createElement("canvas");
    maskOffscreen.width = canvas.width;
    maskOffscreen.height = canvas.height;
    maskOffCtx = maskOffscreen.getContext("2d");
    map.on("render", redrawMaskOverlay);
    canvas.addEventListener("mousedown", onMaskMouseDown);
    window.addEventListener("mousemove", onMaskMouseMove);
    window.addEventListener("mouseup", onMaskMouseUp);
    canvas.addEventListener("contextmenu", onMaskContextMenu);

    // ---- Overlay-hiding helper for satellite capture ----
    const collectOverlayLayers = (): string[] => {
      const style = map.getStyle();
      const ids: string[] = [];
      for (const layer of style.layers ?? []) {
        const t = layer.type as string;
        if (
          t === "raster" ||
          t === "background" ||
          t === "hillshade" ||
          t === "color-relief"
        )
          continue;
        ids.push(layer.id);
      }
      return ids;
    };

    const captureSatelliteImageData = async (): Promise<ImageData | null> => {
      const ids = collectOverlayLayers();
      const prev: Array<{ id: string; vis: string }> = [];
      for (const id of ids) {
        const v =
          (map.getLayoutProperty(id, "visibility") as string | undefined) ??
          "visible";
        prev.push({ id, vis: v });
        map.setLayoutProperty(id, "visibility", "none");
      }
      try {
        map.triggerRepaint();
        await new Promise<void>((resolve) => {
          map.once("idle", () => resolve());
        });
        if (cancelled) return null;
        const gl = map.getCanvas();
        const w = gl.width;
        const h = gl.height;
        const temp = document.createElement("canvas");
        temp.width = w;
        temp.height = h;
        const ctx = temp.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(gl, 0, 0);
        try {
          return ctx.getImageData(0, 0, w, h);
        } catch {
          return null;
        }
      } finally {
        for (const { id, vis } of prev) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
        }
      }
    };

    // ---- Click handler: 2-click workflow ----
    const onMapClick = async (e: maplibregl.MapMouseEvent) => {
      if (sampling) return;
      sampling = true;
      try {
        const dpr = window.devicePixelRatio || 1;
        if (!pendingStart) {
          // Click 1: record start.
          commitDraft();
          pendingStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
          setStartPreview([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        // Click 2: capture image, store params, bump sequence.
        const img = await captureSatelliteImageData();
        if (!img || cancelled) return;
        const startPt = map.project([pendingStart.lng, pendingStart.lat]);
        const sx = Math.round(startPt.x * dpr);
        const sy = Math.round(startPt.y * dpr);
        const ex = Math.round(e.point.x * dpr);
        const ey = Math.round(e.point.y * dpr);
        pendingStart = null;
        setStartPreview(null);
        autoVesselParamsRef.current = {
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          imageData: img,
          dpr,
        };
        setAutoVesselSeq((n) => n + 1);
      } finally {
        sampling = false;
      }
    };

    map.on("click", onMapClick);

    return () => {
      cancelled = true;
      commitDraft();
      map.off("click", onMapClick);
      canvas.style.cursor = "";
      autoVesselParamsRef.current = null;
      autoVesselDraftGeomRef.current = null;

      // Magnifier cleanup
      map.off("render", captureFrame);
      map.off("mousemove", onMagMouseMove);
      map.off("mouseout", onMagMouseLeave);
      if (magnifierEl?.parentNode) magnifierEl.parentNode.removeChild(magnifierEl);
      frameCanvas = null;
      frameCtx = null;

      // Mask painting cleanup
      map.off("render", redrawMaskOverlay);
      canvas.removeEventListener("mousedown", onMaskMouseDown);
      window.removeEventListener("mousemove", onMaskMouseMove);
      window.removeEventListener("mouseup", onMaskMouseUp);
      canvas.removeEventListener("contextmenu", onMaskContextMenu);
      map.dragRotate.enable();
      if (maskOverlay?.parentNode) maskOverlay.parentNode.removeChild(maskOverlay);
      paintMaskStrokesRef.current = [];

      for (const layerId of [VD_LINE, VS_CIRCLE]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const srcId of [VD_SOURCE, VS_SOURCE]) {
        if (map.getSource(srcId)) map.removeSource(srcId);
      }
    };
  }, [autoVessel, geometryType, styleReady]);

  // Secondary vesselness effect: computes the Frangi filter and A* path
  // whenever the scale slider changes or new endpoints are clicked.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoVessel) return;
    const params = autoVesselParamsRef.current;
    const src = map.getSource("auto-vessel-draft") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!params || !src) {
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      autoVesselDraftGeomRef.current = null;
      return;
    }

    const scaleMax = vesselScaleMax;
    const timer = window.setTimeout(() => {
      const clearDraft = () => {
        src.setData({ type: "FeatureCollection", features: [] });
        autoVesselDraftGeomRef.current = null;
      };

      const dpr = params.dpr;
      const rasterizedMask =
        paintMaskStrokesRef.current.length > 0
          ? rasterizePaintMaskStrokes(
              map,
              paintMaskStrokesRef.current,
              params.imageData.width,
              params.imageData.height,
              dpr
            )
          : null;

      // Re-use cached vesselness if the scale hasn't changed.
      let vMap: Float32Array;
      if (
        params.cachedVesselness &&
        params.cachedScaleMax === scaleMax
      ) {
        vMap = params.cachedVesselness;
      } else {
        vMap = computeVesselnessMap(
          params.imageData,
          1.0,
          scaleMax,
          5,
          rasterizedMask
        );
        params.cachedVesselness = vMap;
        params.cachedScaleMax = scaleMax;
      }

      const path = astarVesselnessPath(
        vMap,
        params.imageData.width,
        params.imageData.height,
        params.startX,
        params.startY,
        params.endX,
        params.endY,
        rasterizedMask
      );
      if (!path) {
        clearDraft();
        return;
      }
      const lineLL: GeoJSON.Position[] = path.map(([px, py]) => {
        const ll = map.unproject([px / dpr, py / dpr]);
        return [ll.lng, ll.lat];
      });
      let geom: GeoJSON.Geometry = {
        type: "LineString",
        coordinates: lineLL,
      };
      const diag = geomBboxDiagonal(geom);
      geom = simplifyGeometry(geom, diag / 400);
      autoVesselDraftGeomRef.current = geom;
      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: geom }],
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [autoVessel, vesselScaleMax, autoVesselSeq]);

  // --------------------------------------------------------------------
  // ONNX-based road segmentation trace — same 2-click workflow as
  // autoVessel but uses an ONNX model for the probability map.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !autoSegment) return;
    if (gpkgTypeToDrawShape(geometryType) !== "LineString") return;

    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";

    const SD_SOURCE = "auto-segment-draft";
    const SD_LINE = "auto-segment-draft-line";
    const SS_SOURCE = "auto-segment-start";
    const SS_CIRCLE = "auto-segment-start-circle";

    if (!map.getSource(SD_SOURCE)) {
      map.addSource(SD_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: SD_LINE,
        type: "line",
        source: SD_SOURCE,
        paint: { "line-color": SELECTED_COLOR, "line-width": 2 },
      });
    }
    if (!map.getSource(SS_SOURCE)) {
      map.addSource(SS_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: SS_CIRCLE,
        type: "circle",
        source: SS_SOURCE,
        paint: {
          "circle-radius": 6,
          "circle-color": "#a78bfa",
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 2,
        },
      });
    }

    const setStartPreview = (lngLat: [number, number] | null) => {
      const src = map.getSource(SS_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;
      src.setData(
        lngLat
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: lngLat },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] }
      );
    };

    const commitDraft = (): void => {
      const geom = autoSegmentDraftGeomRef.current;
      if (!geom) return;
      autoSegmentDraftGeomRef.current = null;
      autoSegmentParamsRef.current = null;
      const wrapped = wrapGeomToType(geom, geometryType);
      const fc = activeFclassRef.current;
      onAddedRef.current({
        type: "Feature",
        properties: fc ? { fclass: fc } : {},
        geometry: wrapped,
      });
      const src = map.getSource(SD_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({ type: "FeatureCollection", features: [] });
    };

    let pendingStart: { lng: number; lat: number } | null = null;
    let sampling = false;
    let cancelled = false;

    // ---- Magnifier (same as autoVessel) ----
    const LENS_CSS = 140;
    const MAG = 4;
    const SAMPLE_CSS = LENS_CSS / MAG;
    let magnifierEl: HTMLDivElement | null = null;
    let lensCanvas: HTMLCanvasElement | null = null;
    let lensCtx: CanvasRenderingContext2D | null = null;
    let frameCanvas: HTMLCanvasElement | null = null;
    let frameCtx: CanvasRenderingContext2D | null = null;

    const captureFrame = () => {
      if (!frameCanvas || !frameCtx) return;
      const w = canvas.width;
      const h = canvas.height;
      if (frameCanvas.width !== w || frameCanvas.height !== h) {
        frameCanvas.width = w;
        frameCanvas.height = h;
      }
      frameCtx.drawImage(canvas, 0, 0);
    };

    {
      const dpr = window.devicePixelRatio || 1;
      frameCanvas = document.createElement("canvas");
      frameCanvas.width = canvas.width;
      frameCanvas.height = canvas.height;
      frameCtx = frameCanvas.getContext("2d");
      captureFrame();
      map.on("render", captureFrame);

      magnifierEl = document.createElement("div");
      magnifierEl.className = "glb-magnifier";
      lensCanvas = document.createElement("canvas");
      lensCanvas.width = Math.round(LENS_CSS * dpr);
      lensCanvas.height = Math.round(LENS_CSS * dpr);
      magnifierEl.appendChild(lensCanvas);
      lensCtx = lensCanvas.getContext("2d");
      const crossSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      crossSvg.setAttribute("class", "glb-magnifier__crosshair");
      crossSvg.setAttribute("viewBox", "0 0 140 140");
      crossSvg.innerHTML = [
        '<line x1="70" y1="0" x2="70" y2="60" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="70" y1="80" x2="70" y2="140" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="0" y1="70" x2="60" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<line x1="80" y1="70" x2="140" y2="70" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>',
        '<circle cx="70" cy="70" r="3" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>',
      ].join("");
      magnifierEl.appendChild(crossSvg);
      wrapperRef.current?.appendChild(magnifierEl);
    }

    const showMagnifier = (show: boolean) => {
      if (magnifierEl) magnifierEl.style.display = show ? "block" : "none";
    };
    const updateMagnifier = (cssX: number, cssY: number) => {
      if (!magnifierEl || !lensCanvas || !lensCtx || !frameCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const srcSize = Math.round(SAMPLE_CSS * dpr);
      const sx = Math.round(cssX * dpr - srcSize / 2);
      const sy = Math.round(cssY * dpr - srcSize / 2);
      const lw = lensCanvas.width;
      const lh = lensCanvas.height;
      lensCtx.clearRect(0, 0, lw, lh);
      lensCtx.imageSmoothingEnabled = false;
      lensCtx.drawImage(frameCanvas, sx, sy, srcSize, srcSize, 0, 0, lw, lh);
      magnifierEl.style.left = `${cssX - LENS_CSS / 2}px`;
      magnifierEl.style.top = `${cssY - LENS_CSS / 2}px`;
    };
    const onMagMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (maskDrawing) {
        showMagnifier(false);
        return;
      }
      showMagnifier(true);
      updateMagnifier(e.point.x, e.point.y);
    };
    const onMagMouseLeave = () => showMagnifier(false);
    map.on("mousemove", onMagMouseMove);
    map.on("mouseout", onMagMouseLeave);

    // ---- Mask painting (same as autoVessel) ----
    let maskOverlay: HTMLCanvasElement | null = null;
    let maskOCtx: CanvasRenderingContext2D | null = null;
    let maskOffscreen: HTMLCanvasElement | null = null;
    let maskOffCtx: CanvasRenderingContext2D | null = null;
    let maskDrawing = false;
    let maskCurrentStroke: {
      coords: [number, number][];
      brushCss: number;
      zoom: number;
    } | null = null;
    let maskLastPt: { x: number; y: number } | null = null;
    const MASK_SAMPLE_DIST = 6;

    const redrawMaskOverlay = () => {
      if (!maskOCtx || !maskOffCtx || !maskOverlay || !maskOffscreen) return;
      const w = canvas.width;
      const h = canvas.height;
      if (maskOverlay.width !== w || maskOverlay.height !== h) {
        maskOverlay.width = w;
        maskOverlay.height = h;
      }
      if (maskOffscreen.width !== w || maskOffscreen.height !== h) {
        maskOffscreen.width = w;
        maskOffscreen.height = h;
      }
      maskOCtx.clearRect(0, 0, w, h);
      const strokes = paintMaskStrokesRef.current;
      if (strokes.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const curZoom = map.getZoom();
      maskOffCtx.clearRect(0, 0, w, h);
      maskOffCtx.strokeStyle = "#a78bfa";
      maskOffCtx.lineCap = "round";
      maskOffCtx.lineJoin = "round";
      for (const stroke of strokes) {
        if (stroke.coords.length < 2) continue;
        const scale = Math.pow(2, curZoom - stroke.zoom);
        maskOffCtx.lineWidth = stroke.brushCss * scale * dpr;
        maskOffCtx.beginPath();
        for (let i = 0; i < stroke.coords.length; i++) {
          const p = map.project(stroke.coords[i] as [number, number]);
          const px = p.x * dpr;
          const py = p.y * dpr;
          if (i === 0) maskOffCtx.moveTo(px, py);
          else maskOffCtx.lineTo(px, py);
        }
        maskOffCtx.stroke();
      }
      maskOCtx.globalAlpha = 0.35;
      maskOCtx.drawImage(maskOffscreen, 0, 0);
      maskOCtx.globalAlpha = 1;
    };

    const onMaskMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      maskDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke = {
        coords: [
          [ll.lng, ll.lat],
          [ll.lng, ll.lat],
        ],
        brushCss: paintMaskStrokeWidthRef.current,
        zoom: map.getZoom(),
      };
      paintMaskStrokesRef.current.push(maskCurrentStroke);
      redrawMaskOverlay();
    };
    const onMaskMouseMove = (e: MouseEvent) => {
      if (!maskDrawing || !maskCurrentStroke || !maskLastPt) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (Math.hypot(sx - maskLastPt.x, sy - maskLastPt.y) < MASK_SAMPLE_DIST)
        return;
      maskLastPt = { x: sx, y: sy };
      const ll = map.unproject([sx, sy]);
      maskCurrentStroke.coords.push([ll.lng, ll.lat]);
      redrawMaskOverlay();
    };
    const onMaskMouseUp = (e: MouseEvent) => {
      if (e.button !== 2 || !maskDrawing) return;
      maskDrawing = false;
      maskCurrentStroke = null;
      maskLastPt = null;
    };
    const onMaskContextMenu = (e: Event) => e.preventDefault();

    paintMaskStrokesRef.current = [];
    map.dragRotate.disable();
    maskOverlay = document.createElement("canvas");
    maskOverlay.className = "glb-paint-mask-canvas";
    maskOverlay.width = canvas.width;
    maskOverlay.height = canvas.height;
    wrapperRef.current?.appendChild(maskOverlay);
    maskOCtx = maskOverlay.getContext("2d");
    maskOffscreen = document.createElement("canvas");
    maskOffscreen.width = canvas.width;
    maskOffscreen.height = canvas.height;
    maskOffCtx = maskOffscreen.getContext("2d");
    map.on("render", redrawMaskOverlay);
    canvas.addEventListener("mousedown", onMaskMouseDown);
    window.addEventListener("mousemove", onMaskMouseMove);
    window.addEventListener("mouseup", onMaskMouseUp);
    canvas.addEventListener("contextmenu", onMaskContextMenu);

    // ---- Overlay-hiding helper for satellite capture ----
    const collectOverlayLayers = (): string[] => {
      const style = map.getStyle();
      const ids: string[] = [];
      for (const layer of style.layers ?? []) {
        const t = layer.type as string;
        if (
          t === "raster" ||
          t === "background" ||
          t === "hillshade" ||
          t === "color-relief"
        )
          continue;
        ids.push(layer.id);
      }
      return ids;
    };

    const captureSatelliteImageData = async (): Promise<ImageData | null> => {
      const ids = collectOverlayLayers();
      const prev: Array<{ id: string; vis: string }> = [];
      for (const id of ids) {
        const v =
          (map.getLayoutProperty(id, "visibility") as string | undefined) ??
          "visible";
        prev.push({ id, vis: v });
        map.setLayoutProperty(id, "visibility", "none");
      }
      try {
        map.triggerRepaint();
        await new Promise<void>((resolve) => {
          map.once("idle", () => resolve());
        });
        if (cancelled) return null;
        const gl = map.getCanvas();
        const w = gl.width;
        const h = gl.height;
        const temp = document.createElement("canvas");
        temp.width = w;
        temp.height = h;
        const ctx = temp.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(gl, 0, 0);
        try {
          return ctx.getImageData(0, 0, w, h);
        } catch {
          return null;
        }
      } finally {
        for (const { id, vis } of prev) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
        }
      }
    };

    // ---- Click handler: 2-click workflow ----
    const onMapClick = async (e: maplibregl.MapMouseEvent) => {
      if (sampling) return;
      sampling = true;
      try {
        const dpr = window.devicePixelRatio || 1;
        if (!pendingStart) {
          // Click 1: record start.
          commitDraft();
          pendingStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
          setStartPreview([e.lngLat.lng, e.lngLat.lat]);
          return;
        }
        // Click 2: capture image, store params, bump sequence.
        const img = await captureSatelliteImageData();
        if (!img || cancelled) return;
        const startPt = map.project([pendingStart.lng, pendingStart.lat]);
        const sx = Math.round(startPt.x * dpr);
        const sy = Math.round(startPt.y * dpr);
        const ex = Math.round(e.point.x * dpr);
        const ey = Math.round(e.point.y * dpr);
        pendingStart = null;
        setStartPreview(null);
        autoSegmentParamsRef.current = {
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          imageData: img,
          dpr,
        };
        setAutoSegmentSeq((n) => n + 1);
      } finally {
        sampling = false;
      }
    };

    map.on("click", onMapClick);

    return () => {
      cancelled = true;
      commitDraft();
      map.off("click", onMapClick);
      canvas.style.cursor = "";
      autoSegmentParamsRef.current = null;
      autoSegmentDraftGeomRef.current = null;

      // Magnifier cleanup
      map.off("render", captureFrame);
      map.off("mousemove", onMagMouseMove);
      map.off("mouseout", onMagMouseLeave);
      if (magnifierEl?.parentNode)
        magnifierEl.parentNode.removeChild(magnifierEl);
      frameCanvas = null;
      frameCtx = null;

      // Mask painting cleanup
      map.off("render", redrawMaskOverlay);
      canvas.removeEventListener("mousedown", onMaskMouseDown);
      window.removeEventListener("mousemove", onMaskMouseMove);
      window.removeEventListener("mouseup", onMaskMouseUp);
      canvas.removeEventListener("contextmenu", onMaskContextMenu);
      map.dragRotate.enable();
      if (maskOverlay?.parentNode)
        maskOverlay.parentNode.removeChild(maskOverlay);
      paintMaskStrokesRef.current = [];

      for (const layerId of [SD_LINE, SS_CIRCLE]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const srcId of [SD_SOURCE, SS_SOURCE]) {
        if (map.getSource(srcId)) map.removeSource(srcId);
      }
    };
  }, [autoSegment, geometryType, styleReady]);

  // Secondary ONNX segmentation effect: runs inference and A* path
  // whenever new endpoints are clicked.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoSegment) return;
    const params = autoSegmentParamsRef.current;
    const src = map.getSource("auto-segment-draft") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!params || !src) {
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      autoSegmentDraftGeomRef.current = null;
      return;
    }

    const scaleMax = vesselScaleMax;
    const timer = window.setTimeout(() => {
      const clearDraft = () => {
        src.setData({ type: "FeatureCollection", features: [] });
        autoSegmentDraftGeomRef.current = null;
      };

      const dpr = params.dpr;
      const rasterizedMask =
        paintMaskStrokesRef.current.length > 0
          ? rasterizePaintMaskStrokes(
              map,
              paintMaskStrokesRef.current,
              params.imageData.width,
              params.imageData.height,
              dpr
            )
          : null;

      // Compute multi-cue road probability map (synchronous).
      const probMap = computeMultiCueRoadMap(
        params.imageData,
        1.0,
        scaleMax,
        5,
        rasterizedMask
      );
      params.cachedProb = probMap;

      const path = astarVesselnessPath(
        probMap,
        params.imageData.width,
        params.imageData.height,
        params.startX,
        params.startY,
        params.endX,
        params.endY,
        rasterizedMask
      );
      if (!path) {
        clearDraft();
        return;
      }
      const lineLL: GeoJSON.Position[] = path.map(([px, py]) => {
        const ll = map.unproject([px / dpr, py / dpr]);
        return [ll.lng, ll.lat];
      });
      let geom: GeoJSON.Geometry = {
        type: "LineString",
        coordinates: lineLL,
      };
      const diag = geomBboxDiagonal(geom);
      geom = simplifyGeometry(geom, diag / 400);
      autoSegmentDraftGeomRef.current = geom;
      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: geom }],
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [autoSegment, vesselScaleMax, autoSegmentSeq]);

  // --------------------------------------------------------------------
  // Simplify mode — click a feature to load it into the edit-source as a
  // preview. The slider drives RDP tolerance; moving it always restarts
  // from the original (cloned) geometry, so the user can scrub back and
  // forth without ever losing detail. Switching feature or toggling the
  // mode off commits the current preview through onEdited.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !simplifying) return;

    if (!map.getSource(EDIT_SOURCE_ID)) {
      map.addSource(EDIT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
    }

    if (!map.getSource(SIMPLIFY_VERTS_SOURCE_ID)) {
      map.addSource(SIMPLIFY_VERTS_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: SIMPLIFY_VERTS_LAYER,
        type: "circle",
        source: SIMPLIFY_VERTS_SOURCE_ID,
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-color": SELECTED_COLOR,
          "circle-stroke-width": 2,
        },
      });
    }

    const commitCurrent = (): boolean => {
      const state = simplifyStateRef.current;
      const preview = simplifiedPreviewRef.current;
      if (!state || !preview || !workingRef.current) return false;
      const previewVerts = countGeomVertices(preview);
      if (previewVerts === state.baseVertices) return false;
      const feature = workingRef.current.features[state.id];
      if (!feature) return false;
      const next = { ...feature, geometry: preview };
      workingRef.current.features[state.id] = next;
      onEditedRef.current([next]);
      const mainSrc = map.getSource(FEATURES_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      mainSrc?.setData(workingRef.current);
      return true;
    };

    const clearSelection = (clearReactState = true) => {
      const state = simplifyStateRef.current;
      if (state) {
        map.setFeatureState(
          { source: FEATURES_SOURCE_ID, id: state.id },
          { editing: false }
        );
      }
      const editSrc = map.getSource(EDIT_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      editSrc?.setData({ type: "FeatureCollection", features: [] });
      const vertsSrc = map.getSource(SIMPLIFY_VERTS_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      vertsSrc?.setData({ type: "FeatureCollection", features: [] });
      if (clearReactState) setSimplifyState(null);
    };

    const select = (id: number) => {
      const working = workingRef.current;
      if (!working) return;
      const feature = working.features[id];
      if (!feature?.geometry) return;
      // Commit the previous selection (if any) before switching.
      commitCurrent();
      clearSelection(false);
      map.setFeatureState(
        { source: FEATURES_SOURCE_ID, id },
        { editing: true }
      );
      setSimplifyState({
        id,
        originalGeom: cloneGeometry(feature.geometry),
        diagonal: geomBboxDiagonal(feature.geometry),
        baseVertices: countGeomVertices(feature.geometry),
        slider: 0,
      });
    };

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
        EDIT_FILL_LAYER,
        EDIT_LINE_LAYER,
        EDIT_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) {
        commitCurrent();
        clearSelection();
        return;
      }
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) {
        commitCurrent();
        clearSelection();
        return;
      }
      const first = hits[0];
      // Click on the currently-previewed feature → keep it selected.
      if (first.source === EDIT_SOURCE_ID) return;
      const rawId = first.id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      select(id);
    };

    const canvas = map.getCanvas();
    // Track depth so the cursor only resets after leaving every overlapping
    // hover layer (e.g. polygon fill + outline both fire mouseenter for the
    // same feature; counting prevents flicker between them).
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = SIMPLIFY_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    // Hover both the main features (selectable) and the edit-source preview
    // (already-selected) so the contextual cursor stays visible the entire
    // time the pointer is over a shape.
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
      EDIT_FILL_LAYER,
      EDIT_LINE_LAYER,
      EDIT_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      // Final commit on teardown
      commitCurrent();
      clearSelection();

      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";

      if (map.getLayer(SIMPLIFY_VERTS_LAYER))
        map.removeLayer(SIMPLIFY_VERTS_LAYER);
      if (map.getSource(SIMPLIFY_VERTS_SOURCE_ID))
        map.removeSource(SIMPLIFY_VERTS_SOURCE_ID);

      for (const layerId of [
        EDIT_CIRCLE_LAYER,
        EDIT_LINE_LAYER,
        EDIT_FILL_LAYER,
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(EDIT_SOURCE_ID)) map.removeSource(EDIT_SOURCE_ID);
    };
  }, [simplifying, styleReady]);

  // Push the live simplified preview into the edit-source whenever the slider
  // moves (or a new feature is selected). Lives in its own effect so that the
  // main simplify effect doesn't re-run on every slider tick.
  React.useEffect(() => {
    if (!simplifying || !simplifyState || !simplifiedPreview) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(EDIT_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src || !workingRef.current) return;
    const feature = workingRef.current.features[simplifyState.id];
    if (!feature) return;
    src.setData({
      type: "FeatureCollection",
      features: [{ ...feature, geometry: simplifiedPreview }],
    });
    const vertsSrc = map.getSource(SIMPLIFY_VERTS_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    vertsSrc?.setData(geomVertexFC(simplifiedPreview));
  }, [simplifying, simplifyState, simplifiedPreview]);

  // --------------------------------------------------------------------
  // Smooth mode: Chaikin corner-cutting. Like simplify but uses
  // subdivision iterations instead of RDP tolerance, and doesn't need
  // vertex-dot layers since smoothing adds rather than removes vertices.
  // --------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !smoothing) return;

    if (!map.getSource(EDIT_SOURCE_ID)) {
      map.addSource(EDIT_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
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
    }

    const commitCurrent = (): boolean => {
      const state = smoothStateRef.current;
      const preview = smoothedPreviewRef.current;
      if (!state || !preview || !workingRef.current) return false;
      // Smoothing preserves vertex count, so check slider instead.
      if (state.slider === 0) return false;
      const feature = workingRef.current.features[state.id];
      if (!feature) return false;
      const next = { ...feature, geometry: preview };
      // Let the data flow (onEdited → handleEdited → data prop → sync
      // effect) update the MapLibre source rather than mutating workingRef
      // directly, which can cause both the original and the smoothed shape
      // to appear simultaneously.
      onEditedRef.current([next]);
      return true;
    };

    const clearSelection = (clearReactState = true) => {
      const state = smoothStateRef.current;
      if (state) {
        map.setFeatureState(
          { source: FEATURES_SOURCE_ID, id: state.id },
          { editing: false }
        );
      }
      const editSrc = map.getSource(EDIT_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      editSrc?.setData({ type: "FeatureCollection", features: [] });
      if (clearReactState) setSmoothState(null);
    };

    const select = (id: number) => {
      const working = workingRef.current;
      if (!working) return;
      const feature = working.features[id];
      if (!feature?.geometry) return;
      // Commit the previous selection (if any) before switching.
      commitCurrent();
      clearSelection(false);
      map.setFeatureState(
        { source: FEATURES_SOURCE_ID, id },
        { editing: true }
      );
      setSmoothState({
        id,
        originalGeom: cloneGeometry(feature.geometry),
        baseVertices: countGeomVertices(feature.geometry),
        slider: 0,
      });
    };

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
        EDIT_FILL_LAYER,
        EDIT_LINE_LAYER,
        EDIT_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) {
        commitCurrent();
        clearSelection();
        return;
      }
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) {
        commitCurrent();
        clearSelection();
        return;
      }
      const first = hits[0];
      // Click on the currently-previewed feature → keep it selected.
      if (first.source === EDIT_SOURCE_ID) return;
      const rawId = first.id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      select(id);
    };

    const canvas = map.getCanvas();
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = SMOOTH_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
      EDIT_FILL_LAYER,
      EDIT_LINE_LAYER,
      EDIT_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      // Final commit on teardown
      commitCurrent();
      clearSelection();

      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";

      for (const layerId of [
        EDIT_CIRCLE_LAYER,
        EDIT_LINE_LAYER,
        EDIT_FILL_LAYER,
      ]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(EDIT_SOURCE_ID)) map.removeSource(EDIT_SOURCE_ID);
    };
  }, [smoothing, styleReady]);

  // Push the live smoothed preview into the edit-source whenever the slider
  // moves (or a new feature is selected).
  React.useEffect(() => {
    if (!smoothing || !smoothState || !smoothedPreview) return;
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(EDIT_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src || !workingRef.current) return;
    const feature = workingRef.current.features[smoothState.id];
    if (!feature) return;
    src.setData({
      type: "FeatureCollection",
      features: [{ ...feature, geometry: smoothedPreview }],
    });
  }, [smoothing, smoothState, smoothedPreview]);

  // ------------------------------------------------------------------
  // DEM-import mode: click a feature → compute its lng/lat bbox and
  // hand it back to the page, which POSTs to /api/gis/dem.
  // ------------------------------------------------------------------
  React.useEffect(() => {
    if (!importingDem) setPendingDem(null);
  }, [importingDem]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !importingDem) return;

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) return;
      const rawId = hits[0].id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      const feature = workingRef.current?.features[id];
      if (!feature?.geometry) return;
      let minLng = Infinity,
        minLat = Infinity,
        maxLng = -Infinity,
        maxLat = -Infinity;
      const visit = (coords: unknown) => {
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
      };
      visit(
        (feature.geometry as GeoJSON.Geometry & { coordinates: unknown })
          .coordinates
      );
      if (!isFinite(minLng)) return;
      setPendingDem({
        rawBbox: [minLng, minLat, maxLng, maxLat],
        padding: 0.1,
        maxZoom: 14,
        name: demNameSuggestionRef.current,
      });
    };

    const canvas = map.getCanvas();
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = DEM_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";
    };
  }, [importingDem, styleReady]);

  // ------------------------------------------------------------------
  // Reclassify mode — click a feature, prompt for a new fclass, and
  // forward the (feature, newFclass) to the parent. The page-level
  // handler performs the actual move into the matching edit file.
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !reclassifying) return;

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) return;
      const rawId = hits[0].id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      const working = workingRef.current;
      if (!working) return;
      const feature = working.features[id];
      if (!feature) return;

      const current =
        (feature.properties?.fclass as string | null | undefined) ?? "";
      const next = window.prompt(
        "Class name for this feature (fclass):",
        current
      );
      if (next === null) return;
      const trimmed = next.trim();
      if (trimmed === current) return;
      onReclassifyRef.current(feature, trimmed);
    };

    const canvas = map.getCanvas();
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = "crosshair";
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";
    };
  }, [reclassifying, styleReady]);

  // ------------------------------------------------------------------
  // Delete mode — click a feature to remove it. The feature is pulled
  // from workingRef, reported to the parent via onDeleted, and the main
  // source is immediately refreshed so the shape vanishes without a
  // round-trip through the data prop.
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !deleting) return;

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) return;
      const rawId = hits[0].id;
      if (rawId == null) return;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return;
      const working = workingRef.current;
      if (!working) return;
      const feature = working.features[id];
      if (!feature) return;
      working.features.splice(id, 1);
      const src = map.getSource(FEATURES_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData(working);
      onDeletedRef.current(feature);
    };

    const canvas = map.getCanvas();
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = DELETE_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";
    };
  }, [deleting, styleReady]);

  // ------------------------------------------------------------------
  // Info / Identify mode — click a feature to show its attributes
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !infoMode) {
      setInfoPopup(null);
      return;
    }

    const HIT_TOLERANCE = 6;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const layers = [
        FEATURES_FILL_LAYER,
        FEATURES_LINE_LAYER,
        FEATURES_CIRCLE_LAYER,
      ].filter((id) => !!map.getLayer(id));
      if (layers.length === 0) return;
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - HIT_TOLERANCE, e.point.y - HIT_TOLERANCE],
        [e.point.x + HIT_TOLERANCE, e.point.y + HIT_TOLERANCE],
      ];
      const hits = map.queryRenderedFeatures(bbox, { layers });
      if (hits.length === 0) {
        setInfoPopup(null);
        return;
      }
      const top = hits[0];
      const props = { ...(top.properties ?? {}) } as Record<string, unknown>;
      const layerKey = (props.__layer as string | undefined) ?? "";
      delete props.__layer;
      setInfoPopup({
        x: e.point.x,
        y: e.point.y,
        layer: layerKey,
        properties: props,
      });
    };

    const canvas = map.getCanvas();
    let hoverDepth = 0;
    const setHoverCursor = () => {
      hoverDepth += 1;
      canvas.style.cursor = INFO_HOVER_CURSOR;
    };
    const clearHoverCursor = () => {
      hoverDepth = Math.max(0, hoverDepth - 1);
      if (hoverDepth === 0) canvas.style.cursor = "";
    };
    const hoverLayers = [
      FEATURES_FILL_LAYER,
      FEATURES_LINE_LAYER,
      FEATURES_CIRCLE_LAYER,
    ].filter((id) => !!map.getLayer(id));
    for (const layerId of hoverLayers) {
      map.on("mouseenter", layerId, setHoverCursor);
      map.on("mouseleave", layerId, clearHoverCursor);
    }
    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
      for (const layerId of hoverLayers) {
        map.off("mouseenter", layerId, setHoverCursor);
        map.off("mouseleave", layerId, clearHoverCursor);
      }
      canvas.style.cursor = "";
    };
  }, [infoMode, styleReady]);

  // ------------------------------------------------------------------
  // DEM overlay: read the selected .tif client-side, render it as a
  // hypsometric-tinted PNG and add it as an `image` source covering the
  // file's actual bbox. The .tif is in EPSG:3857 (Web Mercator) so we
  // unproject the corners back to lng/lat for MapLibre.
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    // Tear down any previous overlay first; an empty demFile means
    // "show nothing".
    const cleanup = () => {
      if (map.getLayer(DEM_OVERLAY_LAYER)) map.removeLayer(DEM_OVERLAY_LAYER);
      if (map.getSource(DEM_OVERLAY_SOURCE_ID))
        map.removeSource(DEM_OVERLAY_SOURCE_ID);
    };
    cleanup();
    if (!demFile) {
      setDemRange(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const fetchUrl = demFileUrl ?? `/api/gis/${encodeURIComponent(demFile)}`;
      const res = await fetch(fetchUrl, demFileUrl ? { credentials: "include" } : undefined);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (cancelled) return;
      const tiff = await fromArrayBuffer(buf);
      const img = await tiff.getImage();
      const w = img.getWidth();
      const h = img.getHeight();
      const [originX, originY] = img.getOrigin();
      const [resX, resY] = img.getResolution();
      const left = originX;
      const top = originY;
      const right = originX + resX * w;
      const bottom = originY + resY * h;
      const rasters = await img.readRasters();
      if (cancelled) return;
      const elev = rasters[0] as ArrayLike<number>;

      // Scan only real elevations — the backend writes NaN (plus a NODATA
      // tag) for mosaic cells with no upstream tile, so those never bias
      // the color stretch. Legitimate sea-level 0s still count.
      let mn = Infinity;
      let mx = -Infinity;
      for (let i = 0; i < elev.length; i++) {
        const v = elev[i];
        if (!Number.isFinite(v)) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
        // Whole raster is nodata — nothing to draw.
        setDemRange((prev) => (prev === null ? prev : null));
        return;
      }
      // Preserve identity when the range hasn't changed so the clamp-sync
      // effect doesn't fire and trigger a rebake loop.
      setDemRange((prev) =>
        prev && prev.min === mn && prev.max === mx
          ? prev
          : { min: mn, max: mx },
      );

      // Most DEMs have skewed elevation distributions (e.g. 95 % of pixels
      // clustered in a narrow coastal band), so a naive linear stretch
      // min→max leaves large parts of the ramp invisible. Instead we
      // compute a 256-bin histogram → CDF, derive the 2nd and 98th
      // percentile from it (no re-sort), and linear-stretch between those.
      // Outliers outside [p2, p98] pin to the ramp ends.
      const NBINS = 256;
      const span = mx - mn || 1;
      const hist = new Uint32Array(NBINS);
      let finiteCount = 0;
      for (let i = 0; i < elev.length; i++) {
        const v = elev[i];
        if (!Number.isFinite(v)) continue;
        let b = Math.floor(((v - mn) / span) * NBINS);
        if (b < 0) b = 0;
        else if (b >= NBINS) b = NBINS - 1;
        hist[b]++;
        finiteCount++;
      }
      let acc = 0;
      const invTotal = 1 / (finiteCount || 1);
      let p2Bin = 0;
      let p98Bin = NBINS - 1;
      let p2Found = false;
      for (let b = 0; b < NBINS; b++) {
        acc += hist[b];
        const c = acc * invTotal;
        if (!p2Found && c >= 0.02) {
          p2Bin = b;
          p2Found = true;
        }
        if (c >= 0.98) {
          p98Bin = b;
          break;
        }
      }
      const pctLo = mn + (p2Bin / NBINS) * span;
      const pctHi = mn + ((p98Bin + 1) / NBINS) * span;
      const pctRange = Math.max(1e-6, pctHi - pctLo);

      // Hypsometric ramp + Lambertian-ish hillshade combined into one RGBA
      // canvas. Hillshade adds the visual relief that flat coloring lacks.
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imgData = ctx.createImageData(w, h);
      const px = imgData.data;
      const sample = (col: number, row: number) =>
        elev[
          Math.max(0, Math.min(h - 1, row)) * w +
            Math.max(0, Math.min(w - 1, col))
        ];
      // Treat resolution as meters per pixel (true for EPSG:3857).
      const cellSize = Math.abs(resX) || 1;
      const sunAz = (315 * Math.PI) / 180;
      const sunAlt = (45 * Math.PI) / 180;
      const cosAlt = Math.cos(sunAlt);
      const sinAlt = Math.sin(sunAlt);
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const v = elev[row * w + col];
          if (!Number.isFinite(v)) {
            // Missing data — leave transparent instead of painting 0.
            const idx = (row * w + col) * 4;
            px[idx] = 0;
            px[idx + 1] = 0;
            px[idx + 2] = 0;
            px[idx + 3] = 0;
            continue;
          }
          // 2-98 percentile linear stretch; outliers pin to ramp ends.
          const cv = v <= pctLo ? pctLo : v >= pctHi ? pctHi : v;
          const t = (cv - pctLo) / pctRange;
          const [rr, gg, bb] = ramp(t, demColorRamp);

          // Horn's slope/aspect, scaled so the relief shows even for
          // flat mosaics; clamped to avoid black pits.
          const dzdx =
            (sample(col + 1, row - 1) +
              2 * sample(col + 1, row) +
              sample(col + 1, row + 1) -
              sample(col - 1, row - 1) -
              2 * sample(col - 1, row) -
              sample(col - 1, row + 1)) /
            (8 * cellSize);
          const dzdy =
            (sample(col - 1, row + 1) +
              2 * sample(col, row + 1) +
              sample(col + 1, row + 1) -
              sample(col - 1, row - 1) -
              2 * sample(col, row - 1) -
              sample(col + 1, row - 1)) /
            (8 * cellSize);
          const slope = Math.atan(2 * Math.hypot(dzdx, dzdy));
          const aspect = Math.atan2(dzdy, -dzdx);
          const lit =
            cosAlt * Math.cos(slope) +
            sinAlt * Math.sin(slope) * Math.cos(sunAz - aspect);
          const shade = Math.max(0.4, Math.min(1.15, isFinite(lit) ? lit : 1));

          const idx = (row * w + col) * 4;
          px[idx] = Math.max(0, Math.min(255, rr * shade));
          px[idx + 1] = Math.max(0, Math.min(255, gg * shade));
          px[idx + 2] = Math.max(0, Math.min(255, bb * shade));
          px[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);

      const [tlLng, tlLat] = mercToLngLat(left, top);
      const [trLng, trLat] = mercToLngLat(right, top);
      const [brLng, brLat] = mercToLngLat(right, bottom);
      const [blLng, blLat] = mercToLngLat(left, bottom);

      // Replace any overlay added during the await window.
      if (map.getLayer(DEM_OVERLAY_LAYER)) map.removeLayer(DEM_OVERLAY_LAYER);
      if (map.getSource(DEM_OVERLAY_SOURCE_ID))
        map.removeSource(DEM_OVERLAY_SOURCE_ID);

      map.addSource(DEM_OVERLAY_SOURCE_ID, {
        type: "image",
        url,
        coordinates: [
          [tlLng, tlLat],
          [trLng, trLat],
          [brLng, brLat],
          [blLng, blLat],
        ],
      });
      const beforeId = map.getLayer(FEATURES_FILL_LAYER)
        ? FEATURES_FILL_LAYER
        : undefined;
      map.addLayer(
        {
          id: DEM_OVERLAY_LAYER,
          type: "raster",
          source: DEM_OVERLAY_SOURCE_ID,
          paint: {
            "raster-opacity": demOpacityRef.current,
            "raster-fade-duration": 0,
          },
        },
        beforeId
      );
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [demFile, demFileUrl, demColorRamp, styleReady]);

  // Light effect: opacity-only updates avoid the expensive re-render of
  // the canvas / image source — just push the new value to the layer.
  // Hidden via the legend checkbox collapses to full transparency.
  React.useEffect(() => {
    demOpacityRef.current = demOpacity;
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (!map.getLayer(DEM_OVERLAY_LAYER)) return;
    map.setPaintProperty(
      DEM_OVERLAY_LAYER,
      "raster-opacity",
      demVisible ? demOpacity : 0,
    );
  }, [demOpacity, demVisible, styleReady]);

  // Compute the padded bbox once per pendingDem change. Memoised so the
  // preview rectangle, modal display, and the eventual download payload all
  // see the same numbers.
  const paddedDemBbox = React.useMemo<
    [number, number, number, number] | null
  >(() => {
    if (!pendingDem) return null;
    const [w, s, e, n] = pendingDem.rawBbox;
    const dx = (e - w) * pendingDem.padding;
    const dy = (n - s) * pendingDem.padding;
    return [w - dx, s - dy, e + dx, n + dy];
  }, [pendingDem]);

  // Draw the live preview rectangle on the map. The rectangle uses the
  // padded bbox so the user sees the actual download extent as they drag
  // the padding slider.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const cleanup = () => {
      if (map.getLayer(DEM_PREVIEW_LINE_LAYER))
        map.removeLayer(DEM_PREVIEW_LINE_LAYER);
      if (map.getLayer(DEM_PREVIEW_FILL_LAYER))
        map.removeLayer(DEM_PREVIEW_FILL_LAYER);
      if (map.getSource(DEM_PREVIEW_SOURCE_ID))
        map.removeSource(DEM_PREVIEW_SOURCE_ID);
    };

    if (!paddedDemBbox) {
      cleanup();
      return;
    }

    const [w, s, e, n] = paddedDemBbox;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      ],
    };

    const src = map.getSource(DEM_PREVIEW_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) {
      src.setData(fc);
    } else {
      map.addSource(DEM_PREVIEW_SOURCE_ID, { type: "geojson", data: fc });
      map.addLayer({
        id: DEM_PREVIEW_FILL_LAYER,
        type: "fill",
        source: DEM_PREVIEW_SOURCE_ID,
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: DEM_PREVIEW_LINE_LAYER,
        type: "line",
        source: DEM_PREVIEW_SOURCE_ID,
        paint: {
          "line-color": "#f97316",
          "line-width": 2.5,
          "line-dasharray": [2, 2],
        },
      });
    }

    return cleanup;
  }, [paddedDemBbox, styleReady]);

  // ------------------------------------------------------------------
  // Live AWS Terrarium 3D terrain (option 3 from the docs example).
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    let cancelled = false;

    const removeBoth = () => {
      try {
        map.setTerrain(null);
      } catch {
        // map may already be torn down
      }
      if (map.getSource(AWS_TERRAIN_SOURCE_ID))
        map.removeSource(AWS_TERRAIN_SOURCE_ID);
      if (map.getSource(LOCAL_TERRAIN_SOURCE_ID))
        map.removeSource(LOCAL_TERRAIN_SOURCE_ID);
    };

    if (!terrainOn) {
      removeBoth();
      return;
    }

    (async () => {
      // Default fallback: AWS-only.
      let sourceId = AWS_TERRAIN_SOURCE_ID;
      let tilesUrl = AWS_TERRAIN_TILES;
      let maxzoom = 15;

      // If a local DEM is selected, prefer its pyramid (which falls back
      // to AWS server-side for tiles outside the file's bounds).
      if (demFile) {
        const baseName = demFile.replace(/\.tif$/i, "");
        const manifestUrl = demManifestUrl ?? `/api/gis/dem-tiles/${encodeURIComponent(baseName)}/manifest`;
        const tileUrl = demTileUrlTemplate ?? `/api/gis/dem-tiles/${encodeURIComponent(baseName)}/{z}/{x}/{y}`;
        try {
          const res = await fetch(
            manifestUrl,
            demManifestUrl ? { credentials: "include" } : undefined
          );
          if (res.ok) {
            const manifest = (await res.json()) as { maxZoom?: number };
            sourceId = LOCAL_TERRAIN_SOURCE_ID;
            tilesUrl = tileUrl;
            maxzoom = Math.max(15, manifest.maxZoom ?? 15);
          }
        } catch {
          // Manifest fetch failed — silently fall through to AWS.
        }
      }
      if (cancelled) return;

      // Replace any prior source so a switch (AWS↔local) is clean.
      removeBoth();

      map.addSource(sourceId, {
        type: "raster-dem",
        tiles: [tilesUrl],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom,
      });
      map.setTerrain({
        source: sourceId,
        exaggeration: terrainExaggeration,
      });
    })();

    return () => {
      cancelled = true;
      removeBoth();
    };
  }, [terrainOn, terrainExaggeration, demFile, demManifestUrl, demTileUrlTemplate, styleReady]);

  // Cursor readout: lng/lat under the pointer plus a queryTerrainElevation
  // sample when 3D terrain is active. Throttled to one update per animation
  // frame so a fast mouse drag doesn't flood React with state churn.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    let frame: number | null = null;
    let pending: { lng: number; lat: number } | null = null;

    const flush = () => {
      frame = null;
      if (!pending) return;
      const { lng, lat } = pending;
      let alt: number | null = null;
      if (terrainOn) {
        try {
          const v = map.queryTerrainElevation([lng, lat]);
          alt = typeof v === "number" ? v : null;
        } catch {
          alt = null;
        }
      }
      setCursorReadout({ lng, lat, alt });
    };

    const onMove = (e: maplibregl.MapMouseEvent) => {
      pending = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending = null;
      setCursorReadout(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [styleReady, terrainOn]);

  // Cache the horizontal centre of the terrain and DEM toolbar buttons
  // (relative to the toolbar's content box) so the follow-on slider pills
  // can anchor under them. Recomputed whenever the toolbar resizes — e.g.
  // a fullscreen toggle that changes its layout — but not on every render.
  React.useLayoutEffect(() => {
    const tb = toolbarRef.current;
    if (!tb) return;
    const recompute = () => {
      const t = terrainBtnRef.current;
      const d = demBtnRef.current;
      const s = editGroupRef.current;
      const dg = digitizeGroupRef.current;
      if (t && t.offsetWidth > 0)
        setTerrainSliderLeft(t.offsetLeft + t.offsetWidth / 2);
      if (d && d.offsetWidth > 0)
        setDemSliderLeft(d.offsetLeft + d.offsetWidth / 2);
      if (s && s.offsetWidth > 0)
        setSimplifySliderLeft(s.offsetLeft + s.offsetWidth / 2);
      if (s && s.offsetWidth > 0)
        setSmoothSliderLeft(s.offsetLeft + s.offsetWidth / 2);
      // All auto-trace sliders anchored to the digitize group trigger
      if (dg && dg.offsetWidth > 0) {
        const center = dg.offsetLeft + dg.offsetWidth / 2;
        setAutoPolySliderLeft(center);
        setAutoVesselSliderLeft(center);
        setAutoSegmentSliderLeft(center);
      }
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(tb);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // Outside-click + Escape to dismiss the inline ramp picker popover.
  React.useEffect(() => {
    if (!rampPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const root = rampPickerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setRampPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRampPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [rampPickerOpen]);

  return (
    <div
      ref={wrapperRef}
      className="glb-wrapper relative h-full w-full overflow-hidden rounded-[var(--radius-md)]"
    >
      <div ref={containerRef} className="h-full w-full" />

      {((layers && layers.length > 0) || (demFile && demRange)) && (() => {
        // Group layers: preserve order, emit group header when group changes.
        const hasGroups = layers?.some((l) => l.group) ?? false;
        let lastGroup: string | undefined;

        const renderLayer = (l: LayerStyle) => {
          const collapsed = collapsedLayers.has(l.id);
          const rowClass =
            "glb-legend__row" +
            (l.visible ? "" : " glb-legend__row--hidden");
          const fclasses = l.fclasses ?? [];
          const canCollapse = fclasses.length > 0;
          const name = l.displayName ?? l.id;
          return (
            <React.Fragment key={l.id}>
              <div className={rowClass}>
                <input
                  type="checkbox"
                  className="glb-legend__checkbox"
                  checked={l.visible}
                  onChange={() =>
                    onToggleLayerVisibilityRef.current?.(l.id)
                  }
                />
                <span
                  className="glb-legend__swatch"
                  // eslint-disable-next-line template/no-jsx-style-prop -- per-layer color is runtime data
                  style={{ backgroundColor: l.color }}
                />
                <button
                  type="button"
                  className="glb-legend__name-btn"
                  title={
                    canCollapse
                      ? collapsed
                        ? `Expand ${name}`
                        : `Collapse ${name}`
                      : name
                  }
                  onClick={() => {
                    if (!canCollapse) return;
                    setCollapsedLayers((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.id)) next.delete(l.id);
                      else next.add(l.id);
                      return next;
                    });
                  }}
                >
                  {canCollapse && (
                    <span
                      className={
                        "glb-legend__caret" +
                        (collapsed ? " glb-legend__caret--collapsed" : "")
                      }
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  )}
                  <span className="glb-legend__name">{name}</span>
                </button>
              </div>
              {fclasses.length > 0 && l.visible && !collapsed && (
                <div className="glb-legend__fclasses">
                  {fclasses.map((fc) => {
                    const isActive = activeFclass === fc.value;
                    const fcRowClass =
                      "glb-legend__row glb-legend__row--fclass" +
                      (fc.visible ? "" : " glb-legend__row--hidden") +
                      (isActive ? " glb-legend__row--active" : "");
                    return (
                      <div key={fc.value} className={fcRowClass}>
                        <button
                          type="button"
                          className={
                            "glb-legend__edit-btn" +
                            (isActive
                              ? " glb-legend__edit-btn--active"
                              : "")
                          }
                          title={
                            isActive
                              ? `Stop adding as "${fc.value}"`
                              : `Add new features as "${fc.value}"`
                          }
                          onClick={() =>
                            setActiveFclass((cur) =>
                              cur === fc.value ? null : fc.value,
                            )
                          }
                          aria-pressed={isActive}
                        >
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                          </svg>
                        </button>
                        <label
                          className="glb-legend__fclass-label"
                          onMouseEnter={(e) =>
                            handleFclassHover(
                              l.id,
                              fc.value,
                              e.currentTarget.getBoundingClientRect(),
                            )
                          }
                          onMouseLeave={handleFclassLeave}
                        >
                          <input
                            type="checkbox"
                            className="glb-legend__checkbox"
                            checked={fc.visible}
                            onChange={() =>
                              onToggleFclassVisibilityRef.current?.(
                                l.id,
                                fc.value,
                              )
                            }
                          />
                          <span
                            className="glb-legend__swatch"
                            // eslint-disable-next-line template/no-jsx-style-prop -- per-fclass color is runtime data
                            style={{ backgroundColor: fc.color }}
                          />
                          <span
                            className="glb-legend__name"
                            title={fc.value}
                          >
                            {fc.value}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </React.Fragment>
          );
        };

        const demName =
          demFile ? demFile.replace(/\.tif$/i, "") : "";
        return (
          <div className="glb-legend">
            <div className="glb-legend__title">Layers</div>
            {demFile && demRange && (
              <>
                <div className="glb-legend__group">DEM</div>
                <div
                  className={
                    "glb-legend__row glb-legend__row--dem" +
                    (demVisible ? "" : " glb-legend__row--hidden")
                  }
                  title={`${demName} — [${formatElev(demRange.min)}; ${formatElev(demRange.max)}] elevation (m)`}
                >
                  <input
                    type="checkbox"
                    className="glb-legend__checkbox"
                    checked={demVisible}
                    onChange={() => setDemVisible((v) => !v)}
                    aria-label={
                      demVisible ? "Hide DEM overlay" : "Show DEM overlay"
                    }
                  />
                  <span
                    className="glb-legend__swatch glb-legend__swatch--dem"
                    // eslint-disable-next-line template/no-jsx-style-prop -- gradient per selected ramp
                    style={{
                      backgroundImage: rampToCssGradient(demColorRamp),
                      backgroundColor: "transparent",
                    }}
                  />
                  <div className="glb-legend__dem-text">
                    <span className="glb-legend__name">{demName}</span>
                    <span className="glb-legend__dem-range">
                      [{formatElev(demRange.min)}; {formatElev(demRange.max)}] elevation (m)
                    </span>
                  </div>
                </div>
              </>
            )}
            {(layers ?? []).map((l) => {
              const items: React.ReactNode[] = [];
              if (hasGroups && l.group !== lastGroup) {
                lastGroup = l.group;
                if (l.group) {
                  items.push(
                    <div key={`grp:${l.group}`} className="glb-legend__group">
                      {l.group}
                    </div>
                  );
                }
              }
              items.push(renderLayer(l));
              return items;
            })}
          </div>
        );
      })()}

      {hoverCard &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime position from anchor rect
            style={{
              position: "fixed",
              top: hoverCard.top,
              left: hoverCard.left,
              width: 280,
              zIndex: 50,
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
            onMouseEnter={clearHoverHide}
            onMouseLeave={handleFclassLeave}
          >
            <FclassInfoCard
              fclass={hoverCard.fclass}
              theme={themeFromLayerId(hoverCard.layerId) ?? undefined}
              state={hoverCard.state}
            />
          </div>,
          document.body,
        )}

      <DraggableToolbar
        wrapperRef={wrapperRef}
        resetKey={isFullscreen}
        toolbarRef={toolbarRef}
      >
        <select
          className="glb-tile-select"
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
        >
          {TILE_GROUP_ORDER.map((group) => (
            <React.Fragment key={group}>
              <option disabled className="glb-tile-select__header">
                {`— ${TILE_GROUP_LABEL[group]} —`}
              </option>
              {TILE_SOURCES.map((src, i) =>
                src.group === group ? (
                  <option key={src.name} value={i}>
                    {src.name}
                  </option>
                ) : null,
              )}
            </React.Fragment>
          ))}
        </select>
        <div className="glb-fs-divider" />
        <ToolbarButton
          title={infoMode ? "Stop identify" : "Identify feature (click a feature to see its attributes)"}
          icon={INFO_ICON}
          active={infoMode}
          onClick={() => setInfoMode((v) => !v)}
        />
        <ToolbarGroup
          icon={ADD_GROUP_ICON}
          title="Add features"
          disabled={
            canEdit === false ||
            saving ||
            editing ||
            autoPoly ||
            autoVessel ||
            autoSegment ||
            simplifying ||
            smoothing ||
            importingDem ||
            deleting
          }
          childActive={adding || freehand}
        >
          <ToolbarButton
            title={adding ? "Cancel add" : "Add by vertices (click to place, double-click to finish)"}
            icon={ADD_VERTEX_ICON}
            active={adding}
            onClick={() => {
              if (freehand) onToggleFreehandRef.current();
              onToggleAddRef.current();
            }}
          />
          <ToolbarButton
            title={freehand ? "Finish freehand" : "Freehand draw (hold right mouse button)"}
            icon={FREEHAND_ICON}
            active={freehand}
            onClick={() => {
              if (adding) onToggleAddRef.current();
              onToggleFreehandRef.current();
            }}
          />
        </ToolbarGroup>
        <ToolbarGroup
          groupRef={editGroupRef}
          icon={EDIT_GROUP_ICON}
          title="Edit features"
          disabled={
            canEdit === false ||
            saving ||
            adding ||
            freehand ||
            autoPoly ||
            autoVessel ||
            autoSegment ||
            importingDem
          }
          childActive={editing || simplifying || smoothing || deleting || reclassifying}
        >
          <ToolbarButton
            title={editing ? "Stop editing" : "Edit vertices"}
            icon={EDIT_ICON}
            active={editing}
            onClick={() => {
              if (simplifying) onToggleSimplifyRef.current();
              if (smoothing) onToggleSmoothRef.current();
              if (deleting) onToggleDeleteRef.current();
              if (reclassifying) onToggleReclassifyRef.current();
              onToggleEditRef.current();
            }}
          />
          <ToolbarButton
            ref={simplifyBtnRef}
            title={simplifying ? "Finish simplify" : "Simplify shape (click a feature)"}
            icon={SIMPLIFY_ICON}
            active={simplifying}
            onClick={() => {
              if (editing) onToggleEditRef.current();
              if (smoothing) onToggleSmoothRef.current();
              if (deleting) onToggleDeleteRef.current();
              if (reclassifying) onToggleReclassifyRef.current();
              onToggleSimplifyRef.current();
            }}
          />
          <ToolbarButton
            ref={smoothBtnRef}
            title={smoothing ? "Finish smooth" : "Smooth shape (click a feature)"}
            icon={SMOOTH_ICON}
            active={smoothing}
            onClick={() => {
              if (editing) onToggleEditRef.current();
              if (simplifying) onToggleSimplifyRef.current();
              if (deleting) onToggleDeleteRef.current();
              if (reclassifying) onToggleReclassifyRef.current();
              onToggleSmoothRef.current();
            }}
          />
          <ToolbarButton
            title={reclassifying ? "Finish reclassify" : "Reclassify feature (click a feature)"}
            icon={RECLASSIFY_ICON}
            active={reclassifying}
            onClick={() => {
              if (editing) onToggleEditRef.current();
              if (simplifying) onToggleSimplifyRef.current();
              if (smoothing) onToggleSmoothRef.current();
              if (deleting) onToggleDeleteRef.current();
              onToggleReclassifyRef.current();
            }}
          />
          <ToolbarButton
            title={deleting ? "Finish delete" : "Delete feature (click a feature)"}
            icon={DELETE_ICON}
            active={deleting}
            onClick={() => {
              if (editing) onToggleEditRef.current();
              if (simplifying) onToggleSimplifyRef.current();
              if (smoothing) onToggleSmoothRef.current();
              if (reclassifying) onToggleReclassifyRef.current();
              onToggleDeleteRef.current();
            }}
          />
        </ToolbarGroup>
        <ToolbarGroup
          groupRef={digitizeGroupRef}
          icon={DIGITIZE_GROUP_ICON}
          title="Auto-digitization tools"
          disabled={
            canEdit === false ||
            gpkgTypeToDrawShape(geometryType) === "Point" ||
            saving ||
            editing ||
            adding ||
            freehand ||
            simplifying ||
            smoothing ||
            importingDem ||
            deleting
          }
          childActive={autoPoly || autoVessel || autoSegment}
        >
          <ToolbarButton
            ref={autoPolyBtnRef}
            title={
              autoPoly
                ? "Finish color trace"
                : "Color trace (pick reference, then click target)"
            }
            icon={AUTO_POLY_ICON}
            disabled={gpkgTypeToDrawShape(geometryType) === "Point"}
            active={autoPoly}
            onClick={() => {
              if (autoVessel) onToggleAutoVesselRef.current();
              if (autoSegment) onToggleAutoSegmentRef.current();
              onToggleAutoPolyRef.current();
            }}
          />
          <ToolbarButton
            ref={autoVesselBtnRef}
            title={
              autoVessel
                ? "Finish vesselness trace"
                : "Vesselness trace (paint road, click start + end)"
            }
            icon={VESSEL_TRACE_ICON}
            disabled={gpkgTypeToDrawShape(geometryType) !== "LineString"}
            active={autoVessel}
            onClick={() => {
              if (autoPoly) onToggleAutoPolyRef.current();
              if (autoSegment) onToggleAutoSegmentRef.current();
              onToggleAutoVesselRef.current();
            }}
          />
          <ToolbarButton
            ref={autoSegmentBtnRef}
            title={
              autoSegment
                ? "Finish multi-cue trace"
                : "Multi-cue trace (paint road, click start + end)"
            }
            icon={ML_TRACE_ICON}
            disabled={gpkgTypeToDrawShape(geometryType) !== "LineString"}
            active={autoSegment}
            onClick={() => {
              if (autoPoly) onToggleAutoPolyRef.current();
              if (autoVessel) onToggleAutoVesselRef.current();
              onToggleAutoSegmentRef.current();
            }}
          />
        </ToolbarGroup>
        <ToolbarButton
          ref={demBtnRef}
          title={
            importingDem
              ? "Cancel DEM import"
              : "Import 3D terrain (click a feature)"
          }
          icon={DEM_ICON}
          disabled={
            saving ||
            adding ||
            freehand ||
            autoPoly ||
            autoVessel ||
            autoSegment ||
            editing ||
            simplifying ||
            smoothing ||
            deleting
          }
          active={importingDem}
          onClick={() => onToggleImportDemRef.current()}
        />
        <div className="glb-fs-divider" />
        <ToolbarButton
          title={dirty ? "Discard changes" : "No unsaved edits"}
          icon={DISCARD_ICON}
          disabled={saving || !dirty}
          dirtyOutline={dirty}
          onClick={() => onDiscardRef.current()}
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
        <div className="glb-zoom-group">
          <ToolbarButton
            icon={ZOOM_IN_ICON}
            title="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
          />
          <span className="glb-zoom-badge">Z {zoomDisplay.toFixed(1)}</span>
          <ToolbarButton
            icon={ZOOM_OUT_ICON}
            title="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
          />
        </div>
        <ToolbarButton
          ref={terrainBtnRef}
          title={terrainOn ? "Disable 3D terrain" : "Enable 3D terrain (live)"}
          icon={TERRAIN_ICON}
          active={terrainOn}
          onClick={() => onToggleTerrainRef.current()}
        />
        <ToolbarButton
          icon={TILT_ICON}
          title={pitchDisplay > 1 ? "Reset tilt" : "Tilt 3D view"}
          active={pitchDisplay > 1}
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            if (map.getPitch() > 1) {
              map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
            } else {
              map.easeTo({ pitch: 60, bearing: -20, duration: 500 });
            }
          }}
        />
        <ToolbarButton
          icon={isFullscreen ? SHRINK_ICON : EXPAND_ICON}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
        />

        {terrainOn && terrainSliderLeft != null && (
          <div
            className="glb-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${terrainSliderLeft}px` }}
          >
            <span className="glb-terrain-slider-wrap__label">3D ×</span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={terrainExaggeration}
              onChange={(e) =>
                onSetTerrainExaggerationRef.current(Number(e.target.value))
              }
            />
            <span className="glb-terrain-slider-wrap__value">
              {terrainExaggeration.toFixed(1)}
            </span>
          </div>
        )}


        {autoPoly && autoPolySliderLeft != null && (
          <div
            className="glb-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${autoPolySliderLeft}px` }}
          >
            <span className="glb-terrain-slider-wrap__label">Tol</span>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={autoPolyTolerance}
              onChange={(e) => setAutoPolyTolerance(Number(e.target.value))}
            />
            <span className="glb-terrain-slider-wrap__value">
              {autoPolyTolerance.toFixed(2)}
            </span>
            {gpkgTypeToDrawShape(geometryType) === "Polygon" && (
              <>
                <span className="glb-autotrace-divider" />
                <span className="glb-terrain-slider-wrap__label">
                  Max ×
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={autoPolyMaxSurface}
                  onChange={(e) =>
                    setAutoPolyMaxSurface(Number(e.target.value))
                  }
                />
                <span className="glb-terrain-slider-wrap__value">
                  {autoPolyMaxSurface.toFixed(1)}
                </span>
              </>
            )}
            {gpkgTypeToDrawShape(geometryType) === "LineString" && (
              <>
                <span className="glb-autotrace-divider" />
                <span className="glb-terrain-slider-wrap__label">
                  Brush
                </span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={1}
                  value={paintMaskStrokeWidth}
                  onChange={(e) =>
                    setPaintMaskStrokeWidth(Number(e.target.value))
                  }
                />
                <span className="glb-terrain-slider-wrap__value">
                  {paintMaskStrokeWidth}px
                </span>
                <button
                  type="button"
                  className="glb-terrain-slider-wrap__clear-btn"
                  title="Clear mask"
                  onClick={() => {
                    paintMaskStrokesRef.current = [];
                    mapRef.current?.triggerRepaint();
                  }}
                >
                  Clear
                </button>
                <span className="glb-autotrace-divider" />
                <span className="glb-terrain-slider-wrap__label">
                  Width
                </span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={autoPolyCorridor}
                  onChange={(e) =>
                    setAutoPolyCorridor(Number(e.target.value))
                  }
                />
                <span className="glb-terrain-slider-wrap__value">
                  {autoPolyCorridor}px
                </span>
              </>
            )}
          </div>
        )}

        {autoVessel && autoVesselSliderLeft != null && (
          <div
            className="glb-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${autoVesselSliderLeft}px` }}
          >
            <span className="glb-terrain-slider-wrap__label">Scale</span>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.25}
              value={vesselScaleMax}
              onChange={(e) => setVesselScaleMax(Number(e.target.value))}
            />
            <span className="glb-terrain-slider-wrap__value">
              {vesselScaleMax.toFixed(1)}
            </span>
            <span className="glb-autotrace-divider" />
            <span className="glb-terrain-slider-wrap__label">Brush</span>
            <input
              type="range"
              min={10}
              max={80}
              step={1}
              value={paintMaskStrokeWidth}
              onChange={(e) => setPaintMaskStrokeWidth(Number(e.target.value))}
            />
            <span className="glb-terrain-slider-wrap__value">
              {paintMaskStrokeWidth}px
            </span>
            <button
              type="button"
              className="glb-terrain-slider-wrap__clear-btn"
              title="Clear mask"
              onClick={() => {
                paintMaskStrokesRef.current = [];
                mapRef.current?.triggerRepaint();
              }}
            >
              Clear
            </button>
          </div>
        )}

        {autoSegment && autoSegmentSliderLeft != null && (
          <div
            className="glb-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${autoSegmentSliderLeft}px` }}
          >
            <span className="glb-terrain-slider-wrap__label">Scale</span>
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.25}
              value={vesselScaleMax}
              onChange={(e) => setVesselScaleMax(Number(e.target.value))}
            />
            <span className="glb-terrain-slider-wrap__value">
              {vesselScaleMax.toFixed(1)}
            </span>
            <span className="glb-autotrace-divider" />
            <span className="glb-terrain-slider-wrap__label">Brush</span>
            <input
              type="range"
              min={10}
              max={80}
              step={1}
              value={paintMaskStrokeWidth}
              onChange={(e) => setPaintMaskStrokeWidth(Number(e.target.value))}
            />
            <span className="glb-terrain-slider-wrap__value">
              {paintMaskStrokeWidth}px
            </span>
            <button
              type="button"
              className="glb-terrain-slider-wrap__clear-btn"
              title="Clear mask"
              onClick={() => {
                paintMaskStrokesRef.current = [];
                mapRef.current?.triggerRepaint();
              }}
            >
              Clear
            </button>
          </div>
        )}

        {simplifying && simplifySliderLeft != null && (
          <div
            className={
              simplifyState
                ? "glb-simplify-panel"
                : "glb-simplify-panel glb-simplify-panel--idle"
            }
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${simplifySliderLeft}px` }}
          >
            <span className="glb-simplify-label">Simplify</span>
            <input
              type="range"
              className="glb-simplify-slider"
              min={0}
              max={100}
              step={1}
              disabled={!simplifyState}
              value={simplifyState?.slider ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSimplifyState((s) => (s ? { ...s, slider: v } : s));
              }}
            />
            <span className="glb-simplify-count">
              {simplifyState
                ? `${
                    simplifiedPreview
                      ? countGeomVertices(simplifiedPreview)
                      : simplifyState.baseVertices
                  } / ${simplifyState.baseVertices} pts`
                : "click a shape"}
            </span>
          </div>
        )}

        {smoothing && smoothSliderLeft != null && (
          <div
            className={
              smoothState
                ? "glb-simplify-panel"
                : "glb-simplify-panel glb-simplify-panel--idle"
            }
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${smoothSliderLeft}px` }}
          >
            <span className="glb-simplify-label">Smooth</span>
            <input
              type="range"
              className="glb-simplify-slider"
              min={0}
              max={100}
              step={1}
              disabled={!smoothState}
              value={smoothState?.slider ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSmoothState((s) => (s ? { ...s, slider: v } : s));
              }}
            />
            <span className="glb-simplify-count">
              {smoothState
                ? `${Math.round(Math.pow(smoothState.slider / 100, 3) * 200)} iter`
                : "click a shape"}
            </span>
          </div>
        )}

        {demFile && demSliderLeft != null && (
          <div
            className="glb-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${demSliderLeft}px` }}
          >
            <span className="glb-terrain-slider-wrap__label">DEM α</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={demOpacity}
              onChange={(e) =>
                onSetDemOpacityRef.current(Number(e.target.value))
              }
            />
            <span className="glb-terrain-slider-wrap__value">
              {Math.round(demOpacity * 100)}
            </span>
            <div className="glb-ramp-picker" ref={rampPickerRef}>
              <button
                type="button"
                title={`Color ramp: ${demColorRamp}`}
                className="glb-ramp-picker__trigger"
                // eslint-disable-next-line template/no-jsx-style-prop -- gradient string varies per ramp
                style={{ backgroundImage: rampToCssGradient(demColorRamp) }}
                onClick={() => setRampPickerOpen((v) => !v)}
              />
              {rampPickerOpen && (
                <div className="glb-ramp-picker__popover">
                  {RAMP_ORDER.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={
                        "glb-ramp-picker__option" +
                        (name === demColorRamp
                          ? " glb-ramp-picker__option--active"
                          : "")
                      }
                      onClick={() => {
                        onSetDemColorRampRef.current(name);
                        setRampPickerOpen(false);
                      }}
                    >
                      <span
                        className="glb-ramp-picker__swatch"
                        // eslint-disable-next-line template/no-jsx-style-prop -- gradient string varies per ramp
                        style={{ backgroundImage: rampToCssGradient(name) }}
                      />
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DraggableToolbar>

      {pendingDem && paddedDemBbox && (
        <div className="glb-dem-modal">
          <h3 className="glb-dem-modal__title">Import 3D Terrain</h3>

          <div className="glb-dem-modal__row">
            <span className="glb-dem-modal__label">
              Bounding box (lng/lat)
            </span>
            <span className="glb-dem-modal__value">
              W {paddedDemBbox[0].toFixed(5)} · S {paddedDemBbox[1].toFixed(5)}
              <br />
              E {paddedDemBbox[2].toFixed(5)} · N {paddedDemBbox[3].toFixed(5)}
            </span>
          </div>

          <div className="glb-dem-modal__row">
            <span className="glb-dem-modal__label">
              Padding · {Math.round(pendingDem.padding * 100)}%
            </span>
            <input
              type="range"
              className="glb-dem-modal__slider"
              min={0}
              max={50}
              step={1}
              value={Math.round(pendingDem.padding * 100)}
              onChange={(e) =>
                setPendingDem((p) =>
                  p ? { ...p, padding: Number(e.target.value) / 100 } : p
                )
              }
            />
          </div>

          <div className="glb-dem-modal__row">
            <span className="glb-dem-modal__label">Resolution</span>
            <select
              className="glb-dem-modal__select"
              value={pendingDem.maxZoom}
              onChange={(e) =>
                setPendingDem((p) =>
                  p ? { ...p, maxZoom: Number(e.target.value) } : p
                )
              }
            >
              <option value={10}>Coarse (z10)</option>
              <option value={12}>Medium (z12)</option>
              <option value={14}>Fine (z14)</option>
            </select>
          </div>

          <div className="glb-dem-modal__row">
            <span className="glb-dem-modal__label">Filename</span>
            <input
              type="text"
              className="glb-dem-modal__input"
              value={pendingDem.name}
              onChange={(e) =>
                setPendingDem((p) =>
                  p ? { ...p, name: e.target.value } : p
                )
              }
            />
          </div>

          <div className="glb-dem-modal__actions">
            <button
              type="button"
              className="glb-dem-modal__btn"
              onClick={() => setPendingDem(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="glb-dem-modal__btn glb-dem-modal__btn--primary"
              disabled={!pendingDem.name.trim()}
              onClick={() => {
                onConfirmDemDownloadRef.current({
                  bbox: paddedDemBbox,
                  name: pendingDem.name.trim(),
                  maxZoom: pendingDem.maxZoom,
                });
                setPendingDem(null);
              }}
            >
              Download
            </button>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="glb-context-menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={handleViewAll}>
            View all
          </button>
          <button type="button" onClick={() => handleZoomTo(14)}>
            Zoom 14
          </button>
          <button type="button" onClick={() => handleZoomTo(18)}>
            Zoom 18
          </button>
        </div>
      )}

      {cursorReadout && (
        <div className="glb-cursor-readout">
          <div>
            <span className="glb-cursor-readout__label">Lat</span>
            {cursorReadout.lat.toFixed(5)}
            {"  "}
            <span className="glb-cursor-readout__label">Lng</span>
            {cursorReadout.lng.toFixed(5)}
          </div>
          {terrainOn && (
            <div>
              <span className="glb-cursor-readout__label">Alt</span>
              {cursorReadout.alt != null
                ? `${Math.round(cursorReadout.alt)} m`
                : "—"}
            </div>
          )}
        </div>
      )}

      {infoPopup && (
        <div
          className="glb-info-popup"
          // eslint-disable-next-line template/no-jsx-style-prop -- runtime click position
          style={{
            left: `${Math.min(infoPopup.x + 12, (wrapperRef.current?.clientWidth ?? 800) - 340)}px`,
            top: `${Math.min(infoPopup.y + 12, (wrapperRef.current?.clientHeight ?? 600) - 340)}px`,
          }}
        >
          <div className="glb-info-popup__header">
            <span
              className="glb-info-popup__title"
              title={infoPopup.layer || "(unknown)"}
            >
              {infoPopup.layer
                ? infoPopup.layer.split("/").pop()
                : "(unknown)"}
            </span>
            <button
              type="button"
              className="glb-info-popup__close"
              onClick={() => setInfoPopup(null)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="glb-info-popup__body">
            {Object.keys(infoPopup.properties).length === 0 ? (
              <div className="glb-info-popup__empty">No attributes</div>
            ) : (
              Object.entries(infoPopup.properties).map(([k, v]) => (
                <div key={k} className="glb-info-popup__row">
                  <span className="glb-info-popup__key">{k}</span>
                  <span className="glb-info-popup__value">
                    {v == null ? "—" : String(v)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A toolbar group renders a single trigger button; clicking it toggles a
// vertical popover above the toolbar that holds child tool buttons. The
// trigger shows as "active" when any child tool is active, or when the
// popover is open. Clicking outside dismisses the popover.
function ToolbarGroup({
  icon,
  title,
  disabled,
  childActive,
  children,
  groupRef,
}: {
  icon: string;
  title: string;
  disabled?: boolean;
  /** True when any child tool inside the group is currently active. */
  childActive?: boolean;
  children: React.ReactNode;
  groupRef?: React.Ref<HTMLDivElement>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div ref={groupRef} className="glb-toolbar-group">
      <button
        type="button"
        title={title}
        className={
          "glb-btn" + (open || childActive ? " glb-btn--active" : "")
        }
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      {open && !disabled && (
        <div className="glb-toolbar-group__popover">{children}</div>
      )}
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
  dirtyOutline,
  ref,
}: {
  icon: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  dirty?: boolean;
  dirtyOutline?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const cls = [
    "glb-btn",
    active ? "glb-btn--active" : "",
    dirty ? "glb-btn--dirty" : "",
    dirtyOutline ? "glb-btn--dirty-outline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      ref={ref}
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
  resetKey,
  toolbarRef: externalToolbarRef,
  children,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  resetKey?: unknown;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const localToolbarRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = externalToolbarRef ?? localToolbarRef;
  const dragStateRef = React.useRef({
    active: false,
    startX: 0,
    startY: 0,
    offX: 0,
    offY: 0,
  });

  // Snap back to the default (bottom-center) layout whenever resetKey changes
  // — e.g. when entering or leaving fullscreen — by clearing the inline styles
  // the drag handler writes.
  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.style.left = "";
    toolbar.style.top = "";
    toolbar.style.bottom = "";
    toolbar.style.transform = "";
    // toolbarRef is stable across renders (either the external prop or
    // the local ref) — including it would be a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, option, input")) return;
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
