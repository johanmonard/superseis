"use client";

import * as React from "react";
import maplibregl, {
  type Map as MLMap,
  type StyleSpecification,
  type RasterSourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// ---------------------------------------------------------------------------
// Tile sources (shared with gis-globe-viewport)
// ---------------------------------------------------------------------------

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

const AWS_TERRAIN_SOURCE_ID = "aws-terrain-source";
const AWS_TERRAIN_TILES =
  "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;

function rasterSourceFor(tile: TileSource): RasterSourceSpecification {
  return {
    type: "raster",
    tiles: tile.tiles,
    tileSize: tile.tileSize ?? 256,
    attribution: tile.attribution,
    maxzoom: tile.maxZoom,
  };
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

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const ZOOM_IN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const ZOOM_OUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const EXPAND_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const SHRINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const TERRAIN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 L8 8 L12 14 L15 9 L22 20 Z"/><path d="M8 8 L10 11 M15 9 L17 12"/></svg>';
const TILT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L21 9 L12 15 L3 9 Z"/><path d="M3 9 L3 14 L12 20 L21 14 L21 9"/></svg>';
const TRAIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="12" r="3" fill="currentColor" opacity="1"/><circle cx="11" cy="12" r="2.2" fill="currentColor" opacity="0.55"/><circle cx="5.5" cy="12" r="1.5" fill="currentColor" opacity="0.25"/></svg>';

// ---------------------------------------------------------------------------
// CSS (subset of gis-globe-viewport CSS for toolbar controls)
// ---------------------------------------------------------------------------

const ANIMATE_CSS = `
  /* Ensure entity markers render above the deck.gl overlay canvas */
  .maplibregl-marker {
    z-index: 10 !important;
  }

  .anim-btn {
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
  .anim-toolbar .anim-btn {
    border-color: transparent;
    background-color: rgba(15, 23, 42, 0.05);
  }
  .anim-toolbar .anim-btn:hover:not(:disabled) {
    background-color: rgba(15, 23, 42, 0.1);
  }
  [data-theme="dark"] .anim-toolbar .anim-btn {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }
  [data-theme="dark"] .anim-toolbar .anim-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.16);
  }
  .anim-btn:hover:not(:disabled) { background-color: #f3f4f6; }
  .anim-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .anim-btn--active {
    background-color: #3b82f6 !important;
    color: #fff !important;
    border-color: #3b82f6 !important;
  }
  [data-theme="dark"] .anim-btn {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
  }
  [data-theme="dark"] .anim-btn:hover:not(:disabled) {
    background-color: var(--color-bg-elevated);
  }

  .anim-tile-select {
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
  [data-theme="dark"] .anim-tile-select {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23cbd5e1'/%3E%3C/svg%3E");
  }
  .anim-toolbar .anim-tile-select {
    border-color: transparent;
    background-color: rgba(15, 23, 42, 0.05);
    color: #1e293b;
    font-weight: 500;
  }
  [data-theme="dark"] .anim-toolbar .anim-tile-select {
    background-color: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }
  .anim-tile-select option {
    background-color: #fff;
    color: #1e293b;
  }
  [data-theme="dark"] .anim-tile-select option {
    background-color: #0f172a;
    color: #e2e8f0;
  }
  .anim-tile-select option.anim-tile-select__header {
    background-color: #f1f5f9;
    color: #64748b;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  [data-theme="dark"] .anim-tile-select option.anim-tile-select__header {
    background-color: #1e293b;
    color: #94a3b8;
  }

  .anim-zoom-badge {
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
  .anim-toolbar .anim-zoom-badge {
    background-color: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.18);
    color: #0f172a;
  }
  [data-theme="dark"] .anim-toolbar .anim-zoom-badge {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }

  .anim-zoom-group {
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
  [data-theme="dark"] .anim-zoom-group {
    background-color: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .anim-zoom-group > * {
    flex: 0 0 auto;
    height: 100%;
    border: 0 !important;
    border-radius: 0 !important;
    background-color: transparent !important;
    box-shadow: none !important;
  }
  .anim-zoom-group > * + * {
    border-left: 1px solid rgba(15, 23, 42, 0.12) !important;
  }
  [data-theme="dark"] .anim-zoom-group > * + * {
    border-left-color: rgba(255, 255, 255, 0.14) !important;
  }
  .anim-zoom-group .anim-btn {
    width: 32px;
  }
  .anim-zoom-group .anim-btn:hover:not(:disabled) {
    background-color: rgba(15, 23, 42, 0.08) !important;
  }
  [data-theme="dark"] .anim-zoom-group .anim-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.12) !important;
  }
  .anim-zoom-group .anim-zoom-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    min-width: 58px;
    color: #0f172a;
  }
  [data-theme="dark"] .anim-zoom-group .anim-zoom-badge {
    color: #e2e8f0;
  }

  .anim-toolbar {
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
  [data-theme="dark"] .anim-toolbar {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .anim-toolbar--dragging { cursor: grabbing; }

  .anim-terrain-slider-wrap {
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
  [data-theme="dark"] .anim-terrain-slider-wrap {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }
  .anim-terrain-slider-wrap__label {
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
  }
  [data-theme="dark"] .anim-terrain-slider-wrap__label { color: #94a3b8; }
  .anim-terrain-slider-wrap input[type="range"] {
    width: 110px;
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .anim-terrain-slider-wrap__value {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    min-width: 26px;
    text-align: right;
  }

  .anim-trail-slider-wrap {
    position: absolute;
    top: 100%;
    margin-top: 8px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 12px;
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
  [data-theme="dark"] .anim-trail-slider-wrap {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }
  .anim-trail-slider-wrap__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .anim-trail-slider-wrap__label {
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 10px;
    min-width: 52px;
  }
  [data-theme="dark"] .anim-trail-slider-wrap__label { color: #94a3b8; }
  .anim-trail-slider-wrap input[type="range"] {
    width: 110px;
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .anim-trail-slider-wrap__value {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
  }

  .anim-fs-divider {
    width: 1px;
    height: 22px;
    background-color: rgba(15, 23, 42, 0.14);
    flex-shrink: 0;
  }
  [data-theme="dark"] .anim-fs-divider {
    background-color: rgba(255, 255, 255, 0.22);
  }

  .anim-legend {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 5px 0;
    border-radius: 8px;
    background-color: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
    font-size: 11px;
    color: #1e293b;
    user-select: none;
    min-width: 120px;
  }
  [data-theme="dark"] .anim-legend {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }
  .anim-legend__header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 4px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
    margin-bottom: 2px;
  }
  [data-theme="dark"] .anim-legend__header {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }
  .anim-legend__title {
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #334155;
    flex: 1;
  }
  [data-theme="dark"] .anim-legend__title { color: #cbd5e1; }
  .anim-legend__chevron {
    border: none;
    background: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    padding: 0 2px;
    display: flex;
    align-items: center;
  }
  .anim-legend__chevron:hover { color: #475569; }
  [data-theme="dark"] .anim-legend__chevron:hover { color: #e2e8f0; }
  .anim-legend__group {
    display: flex;
    flex-direction: column;
  }
  .anim-legend__group + .anim-legend__group {
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    margin-top: 2px;
    padding-top: 2px;
  }
  [data-theme="dark"] .anim-legend__group + .anim-legend__group {
    border-top-color: rgba(255, 255, 255, 0.08);
  }
  .anim-legend__row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 1.5px 10px;
  }
  .anim-legend__row--group {
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #64748b;
    padding-top: 2px;
    padding-bottom: 2px;
    cursor: pointer;
  }
  .anim-legend__row--group:hover { color: #475569; }
  [data-theme="dark"] .anim-legend__row--group { color: #94a3b8; }
  [data-theme="dark"] .anim-legend__row--group:hover { color: #cbd5e1; }
  .anim-legend__group-chevron {
    font-size: 8px;
    line-height: 1;
    opacity: 0.5;
    flex-shrink: 0;
    width: 8px;
    text-align: center;
  }
  .anim-legend__row--child {
    padding-left: 38px;
    font-size: 10px;
  }
  .anim-legend__color {
    position: relative;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.9);
    flex-shrink: 0;
    cursor: pointer;
  }
  [data-theme="dark"] .anim-legend__color {
    border-color: rgba(255, 255, 255, 0.5);
  }
  .anim-legend__color input[type="color"] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: 0;
    padding: 0;
  }
  .anim-legend__label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
  }
  .anim-legend__sliders {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .anim-legend__size-icon {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
    opacity: 0.6;
  }
  .anim-legend__size-icon--lg {
    width: 7px;
    height: 7px;
  }
  .anim-legend__slider {
    -webkit-appearance: none;
    appearance: none;
    width: 52px;
    height: 3px;
    border-radius: 2px;
    background: rgba(15, 23, 42, 0.15);
    outline: none;
    cursor: pointer;
    opacity: 0.5;
  }
  .anim-legend__slider:hover { opacity: 1; }
  .anim-legend__slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #475569;
    border: none;
    cursor: pointer;
  }
  .anim-legend__slider::-moz-range-thumb {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #475569;
    border: none;
    cursor: pointer;
  }
  [data-theme="dark"] .anim-legend__slider {
    background: rgba(255, 255, 255, 0.15);
  }
  [data-theme="dark"] .anim-legend__slider::-webkit-slider-thumb {
    background: #94a3b8;
  }
  [data-theme="dark"] .anim-legend__slider::-moz-range-thumb {
    background: #94a3b8;
  }

  .anim-timeline {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 999px;
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.12);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(8px);
    font-family: system-ui, sans-serif;
    font-size: 11px;
    color: #1e293b;
    user-select: none;
    min-width: 320px;
    max-width: 90%;
  }
  [data-theme="dark"] .anim-timeline {
    background-color: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    color: #e2e8f0;
  }
  .anim-timeline__top {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .anim-timeline__time {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-weight: 600;
    font-size: 13px;
    min-width: 64px;
    text-align: center;
  }
  .anim-timeline__slider {
    flex: 1;
    min-width: 0;
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .anim-timeline__btn {
    padding: 2px 8px;
    border-radius: 4px;
    border: none;
    background-color: #3b82f6;
    color: #fff;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .anim-timeline__btn:hover { opacity: 0.9; }
  .anim-timeline__btn--secondary {
    background-color: transparent;
    border: 1px solid rgba(15, 23, 42, 0.2);
    color: inherit;
  }
  [data-theme="dark"] .anim-timeline__btn--secondary {
    border-color: rgba(255, 255, 255, 0.2);
  }
  .anim-timeline__btn--secondary:hover {
    background-color: rgba(15, 23, 42, 0.06);
  }
  [data-theme="dark"] .anim-timeline__btn--secondary:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
  .anim-timeline__speed {
    appearance: none;
    border: 1px solid rgba(15, 23, 42, 0.15);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-family: system-ui, sans-serif;
    font-size: 10px;
    padding: 2px 4px;
    cursor: pointer;
  }
  [data-theme="dark"] .anim-timeline__speed {
    border-color: rgba(255, 255, 255, 0.15);
  }
`;

const ANIMATE_3D_CSS_ID = "anim-3d-viewport-css";
function injectCss() {
  let style = document.getElementById(ANIMATE_3D_CSS_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = ANIMATE_3D_CSS_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== ANIMATE_CSS) style.textContent = ANIMATE_CSS;
}

// ---------------------------------------------------------------------------
// ToolbarButton
// ---------------------------------------------------------------------------

function ToolbarButton({
  icon,
  title,
  onClick,
  disabled,
  active,
  ref,
}: {
  icon: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const cls = ["anim-btn", active ? "anim-btn--active" : ""]
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

// ---------------------------------------------------------------------------
// DraggableToolbar
// ---------------------------------------------------------------------------

function DraggableToolbar({
  wrapperRef,
  resetKey,
  children,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  resetKey?: unknown;
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

  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.style.left = "";
    toolbar.style.top = "";
    toolbar.style.bottom = "";
    toolbar.style.transform = "";
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
    toolbar.classList.add("anim-toolbar--dragging");
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
    toolbarRef.current?.classList.remove("anim-toolbar--dragging");
  };

  return (
    <div
      ref={toolbarRef}
      className="anim-toolbar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnimateViewport
// ---------------------------------------------------------------------------

// deck.gl imports for GPU-accelerated point rendering
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";

// Flat Float64Array stride: [time, lon, lat, elevation] per entry
const STRIDE = 4;

// Binary search on a flat Float64Array (stride 4):
// find the last entry index where positions[i*4] <= t
function bisect(positions: Float64Array, t: number): number {
  const n = positions.length / STRIDE;
  let lo = 0, hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (positions[mid * STRIDE] <= t) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi; // -1 if t < first time
}

// Snap to the last known position at or before time t.
// If t is before the first data point, return the first position so the
// entity is always visible once the animation starts.
function positionAt(
  positions: Float64Array,
  t: number,
): [number, number, number] | null {
  if (positions.length === 0) return null;
  const i = bisect(positions, t);
  const j = (i < 0 ? 0 : i) * STRIDE;
  return [positions[j + 1], positions[j + 2], positions[j + 3]];
}

export type Trajectory = {
  id: string;
  positions: Float64Array; // flat [t, lon, lat, elev, t, lon, lat, elev, ...]
  acqu: Float64Array;      // flat ACQU events, same layout
};

interface EntityStyle {
  color: string;
  dotSize: number;
  acquSize: number;
}

type AcquEntry = { position: [number, number, number]; entityIdx: number };
type TrailPoint = { position: [number, number, number]; progress: number; entityIdx: number };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 8-color palette for entity dots
const ENTITY_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444",
  "#a855f7", "#06b6d4", "#f59e0b", "#ec4899",
];

// Format time in centiseconds to HH:MM:SS
function formatTime(cs: number): string {
  const totalSec = Math.floor(cs / 100);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `D${d} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const SPEED_OPTIONS = [1, 10, 50, 100, 500, 1000, 5000, 10000, 100000];

export function Animate3DViewport({
  trajectories,
}: {
  trajectories?: Trajectory[];
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [tileIndex, setTileIndex] = React.useState(15); // CartoDB Dark
  const [styleReady, setStyleReady] = React.useState(false);
  const [zoomDisplay, setZoomDisplay] = React.useState(DEFAULT_ZOOM);
  const [pitchDisplay, setPitchDisplay] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [terrainOn, setTerrainOn] = React.useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = React.useState(1.5);
  const [terrainSliderLeft, setTerrainSliderLeft] = React.useState<number | null>(null);
  const terrainBtnRef = React.useRef<HTMLButtonElement>(null);

  // Trail settings (global)
  const [trailOn, setTrailOn] = React.useState(true);
  const [trailLength, setTrailLength] = React.useState(2);     // 0–3 multiplier
  const [trailOpacity, setTrailOpacity] = React.useState(0.8); // 0–1
  const [trailDensity, setTrailDensity] = React.useState(100); // 4–100 pts
  const [trailTaper, setTrailTaper] = React.useState(1);       // 0 = uniform, 1 = sharp needle
  const [trailGlow, setTrailGlow] = React.useState(0);         // 0 = no glow, 1 = max glow
  const [trailSliderLeft, setTrailSliderLeft] = React.useState<number | null>(null);
  const trailBtnRef = React.useRef<HTMLButtonElement>(null);
  const trailLengthRef = React.useRef(trailLength);
  const trailOpacityRef = React.useRef(trailOpacity);
  const trailDensityRef = React.useRef(trailDensity);
  const trailTaperRef = React.useRef(trailTaper);
  const trailGlowRef = React.useRef(trailGlow);
  const trailOnRef = React.useRef(trailOn);
  React.useEffect(() => { trailLengthRef.current = trailLength; }, [trailLength]);
  React.useEffect(() => { trailOpacityRef.current = trailOpacity; }, [trailOpacity]);
  React.useEffect(() => { trailDensityRef.current = trailDensity; }, [trailDensity]);
  React.useEffect(() => { trailTaperRef.current = trailTaper; }, [trailTaper]);
  React.useEffect(() => { trailGlowRef.current = trailGlow; }, [trailGlow]);
  React.useEffect(() => { trailOnRef.current = trailOn; }, [trailOn]);

  // Per-entity visual settings
  const [entityStyles, setEntityStyles] = React.useState<EntityStyle[]>([]);
  const entityStylesRef = React.useRef<EntityStyle[]>([]);
  const styleVersionRef = React.useRef(0);

  // Animation state (internal)
  const [timeRange, setTimeRange] = React.useState<[number, number]>([0, 0]);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(10000);

  const playingRef = React.useRef(playing);
  const speedRef = React.useRef(speed);
  const currentTimeRef = React.useRef(currentTime);
  const timeRangeRef = React.useRef(timeRange);
  const trajectoriesRef = React.useRef(trajectories);
  React.useEffect(() => { playingRef.current = playing; }, [playing]);
  React.useEffect(() => { speedRef.current = speed; }, [speed]);
  React.useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  React.useEffect(() => { timeRangeRef.current = timeRange; }, [timeRange]);
  React.useEffect(() => { trajectoriesRef.current = trajectories; }, [trajectories]);

  // Compute time range when trajectories change
  React.useEffect(() => {
    if (!trajectories || trajectories.length === 0) {
      setTimeRange([0, 0]);
      setCurrentTime(0);
      setPlaying(false);
      return;
    }
    let tMin = Infinity, tMax = -Infinity;
    for (const traj of trajectories) {
      if (traj.positions.length > 0) {
        const first = traj.positions[0]; // time of first entry
        const last = traj.positions[traj.positions.length - STRIDE]; // time of last entry
        if (first < tMin) tMin = first;
        if (last > tMax) tMax = last;
      }
    }
    if (!Number.isFinite(tMin)) { tMin = 0; tMax = 0; }
    setTimeRange([tMin, tMax]);
    setCurrentTime(tMin);
    setPlaying(false);
  }, [trajectories]);

  // Inject CSS
  React.useEffect(() => {
    injectCss();
  }, []);

  // Track fullscreen state
  React.useEffect(() => {
    const update = () => {
      const el = wrapperRef.current;
      setIsFullscreen(!!el && document.fullscreenElement === el);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  // Initialise MapLibre GL
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = new maplibregl.Map({
      container: el,
      style: EMPTY_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      ...({ preserveDrawingBuffer: true } as Record<string, unknown>),
    });

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

    mapRef.current = map;

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Swap tile source on index change
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    const tile = TILE_SOURCES[tileIndex];
    const showLabels = tile.name === "Esri Satellite + Labels";

    for (const layerId of [LABELS_LAYER_ID, BASE_LAYER_ID]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const srcId of [LABELS_SOURCE_ID, BASE_SOURCE_ID]) {
      if (map.getSource(srcId)) map.removeSource(srcId);
    }

    map.addSource(BASE_SOURCE_ID, rasterSourceFor(tile));
    map.addLayer({
      id: BASE_LAYER_ID,
      type: "raster",
      source: BASE_SOURCE_ID,
    });

    if (showLabels) {
      map.addSource(LABELS_SOURCE_ID, {
        type: "raster",
        tiles: [LABELS_URL],
        tileSize: 256,
      });
      map.addLayer({
        id: LABELS_LAYER_ID,
        type: "raster",
        source: LABELS_SOURCE_ID,
      });
    }
  }, [tileIndex, styleReady]);

  // 3D terrain toggle
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    let cancelled = false;

    const removeTerrain = () => {
      try {
        map.setTerrain(null);
      } catch {
        // map may already be torn down
      }
      if (map.getSource(AWS_TERRAIN_SOURCE_ID))
        map.removeSource(AWS_TERRAIN_SOURCE_ID);
    };

    if (!terrainOn) {
      removeTerrain();
      return;
    }

    if (!map.getSource(AWS_TERRAIN_SOURCE_ID)) {
      map.addSource(AWS_TERRAIN_SOURCE_ID, {
        type: "raster-dem",
        tiles: [AWS_TERRAIN_TILES],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
      });
    }

    if (!cancelled) {
      map.setTerrain({
        source: AWS_TERRAIN_SOURCE_ID,
        exaggeration: terrainExaggeration,
      });
    }

    return () => {
      cancelled = true;
      removeTerrain();
    };
  }, [terrainOn, terrainExaggeration, styleReady]);

  // Update terrain slider position from the terrain button
  React.useEffect(() => {
    const btn = terrainBtnRef.current;
    if (!btn || !terrainOn) {
      setTerrainSliderLeft(null);
      return;
    }
    setTerrainSliderLeft(btn.offsetLeft + btn.offsetWidth / 2);
  }, [terrainOn, isFullscreen]);

  // Update trail slider position from the trail button
  React.useEffect(() => {
    const btn = trailBtnRef.current;
    if (!btn || !trailOn) {
      setTrailSliderLeft(null);
      return;
    }
    setTrailSliderLeft(btn.offsetLeft + btn.offsetWidth / 2);
  }, [trailOn, isFullscreen]);

  // Resize map when the container changes size
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // deck.gl overlay for GPU-accelerated point rendering
  const overlayRef = React.useRef<MapboxOverlay | null>(null);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    if (overlayRef.current) return;
    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;
  }, [styleReady]);

  // Fit bounds when trajectories first load
  const fittedRef = React.useRef<Trajectory[] | undefined>(undefined);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || !trajectories || trajectories.length === 0) return;
    if (fittedRef.current === trajectories) return;
    fittedRef.current = trajectories;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    for (const traj of trajectories) {
      for (let j = 0; j < traj.positions.length; j += STRIDE) {
        const lon = traj.positions[j + 1];
        const lat = traj.positions[j + 2];
        if (lon < minLng) minLng = lon;
        if (lon > maxLng) maxLng = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (Number.isFinite(minLng)) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, duration: 800 });
    }
  }, [trajectories, styleReady]);

  // Accumulated ACQU data per entity — flat arrays for deck.gl.
  const acquDataRef = React.useRef<AcquEntry[]>([]);
  const acquCursorsRef = React.useRef<number[]>([]);
  const acquLastTimeRef = React.useRef<number>(-1);

  // Native MapLibre markers for entity dots — DOM elements never blink.
  const entityMarkersRef = React.useRef<maplibregl.Marker[]>([]);

  // Create / destroy entity markers when trajectories change
  React.useEffect(() => {
    // Remove old markers
    for (const m of entityMarkersRef.current) m.remove();
    entityMarkersRef.current = [];

    // Reset ACQU state
    const n = (trajectories ?? []).length;
    acquDataRef.current = [];
    acquCursorsRef.current = Array.from({ length: n }, () => 0);
    acquLastTimeRef.current = -1;
    overlayRef.current?.setProps({ layers: [] });

    // Initialize per-entity styles — same color for all wids in the same type group
    const initStyles: EntityStyle[] = [];
    const groupColorMap = new Map<string, string>();
    let groupColorIdx = 0;
    for (let i = 0; i < n; i++) {
      const id = String(trajectories![i].id);
      const dash = id.indexOf("-");
      const group = dash >= 0 ? id.slice(0, dash) : id;
      if (!groupColorMap.has(group)) {
        groupColorMap.set(group, ENTITY_COLORS[groupColorIdx % ENTITY_COLORS.length]);
        groupColorIdx++;
      }
      initStyles.push({
        color: groupColorMap.get(group)!,
        dotSize: 10,
        acquSize: 0.5,
      });
    }
    entityStylesRef.current = initStyles;
    styleVersionRef.current++;
    setEntityStyles(initStyles);

    const map = mapRef.current;
    if (!map || !trajectories) return;

    for (let i = 0; i < trajectories.length; i++) {
      const s = initStyles[i];
      const el = document.createElement("div");
      el.style.width = `${s.dotSize}px`;
      el.style.height = `${s.dotSize}px`;
      el.style.borderRadius = "50%";
      el.style.backgroundColor = s.color;
      el.style.border = "2px solid #fff";
      el.style.boxShadow = "0 0 4px rgba(0,0,0,0.4)";
      el.style.zIndex = "10";
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([0, 0])
        .addTo(map);
      entityMarkersRef.current.push(marker);
    }
  }, [trajectories]);

  // Synchronous overlay update — called directly from RAF loop and scrub handler.
  // Uses only refs so it never depends on React render timing.
  const syncOverlay = React.useCallback((t: number) => {
    const overlay = overlayRef.current;
    const trajs = trajectoriesRef.current;
    const markers = entityMarkersRef.current;

    // Update entity marker positions (DOM — never blinks)
    if (trajs) {
      for (let i = 0; i < trajs.length; i++) {
        const pos = positionAt(trajs[i].positions, t);
        if (pos && markers[i]) {
          markers[i].setLngLat([pos[0], pos[1]]);
        }
      }
    }

    if (!overlay) return;
    if (!trajs || trajs.length === 0) {
      overlay.setProps({ layers: [] });
      return;
    }

    // If time went backwards (scrub/reset), rebuild ACQU from scratch
    if (t < acquLastTimeRef.current) {
      acquDataRef.current = [];
      acquCursorsRef.current = trajs.map(() => 0);
    }
    acquLastTimeRef.current = t;

    let acquAdded = false;

    for (let i = 0; i < trajs.length; i++) {
      const traj = trajs[i];

      // Append new ACQU marks (flat Float64Array, stride 4)
      let cursor = acquCursorsRef.current[i] ?? 0;
      const acquLen = traj.acqu.length / STRIDE;
      while (cursor < acquLen && traj.acqu[cursor * STRIDE] <= t) {
        const base = cursor * STRIDE;
        acquDataRef.current.push({
          position: [traj.acqu[base + 1], traj.acqu[base + 2], traj.acqu[base + 3]],
          entityIdx: i,
        });
        cursor++;
        acquAdded = true;
      }
      acquCursorsRef.current[i] = cursor;
    }

    // deck.gl compares data by reference — create a new array so it detects the additions
    if (acquAdded) {
      acquDataRef.current = acquDataRef.current.slice();
    }

    // Build speed trail data — global trail settings from refs
    const trailData: TrailPoint[] = [];
    const spd = speedRef.current;
    const tLen = trailLengthRef.current;
    const tOp = trailOpacityRef.current;
    const tDens = Math.round(trailDensityRef.current);
    const tTaper = trailTaperRef.current;
    const tGlow = trailGlowRef.current;
    const trailDuration = trailOnRef.current && tLen > 0 && spd >= 10
      ? spd * 30 * tLen
      : 0;

    if (trailDuration > 0 && tDens >= 2 && trajs) {
      const tStart = t - trailDuration;
      for (let i = 0; i < trajs.length; i++) {
        const pos = trajs[i].positions;
        const n = pos.length / STRIDE;
        if (n === 0) continue;
        const endIdx = bisect(pos, t);
        if (endIdx < 0) continue;
        const startIdx = Math.max(0, bisect(pos, tStart) + 1);
        const count = endIdx - startIdx + 1;
        if (count <= 1) continue;
        const step = Math.max(1, Math.floor(count / tDens));
        for (let j = startIdx; j < endIdx; j += step) {
          const base = j * STRIDE;
          const pTime = pos[base];
          const progress = (pTime - tStart) / trailDuration;
          trailData.push({
            position: [pos[base + 1], pos[base + 2], pos[base + 3]],
            progress: Math.max(0, Math.min(1, progress)),
            entityIdx: i,
          });
        }
      }
    }

    const styles = entityStylesRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: ScatterplotLayer<any>[] = [
      new ScatterplotLayer({
        id: "acqu-marks",
        data: acquDataRef.current,
        getPosition: (d: AcquEntry) => d.position,
        getFillColor: (d: AcquEntry) => {
          const s = styles[d.entityIdx];
          return s ? hexToRgb(s.color) : [200, 200, 200];
        },
        getRadius: (d: AcquEntry) => styles[d.entityIdx]?.acquSize ?? 3,
        updateTriggers: {
          getFillColor: styleVersionRef.current,
          getRadius: styleVersionRef.current,
        },
        radiusUnits: "pixels" as const,
        radiusMinPixels: 0.5,
        radiusMaxPixels: 20,
      }),
    ];

    // Add trail layer when there are trail points
    if (trailData.length > 0) {
      // tTaper: 0 = uniform width, 1 = sharp needle
      // We blend between a flat size curve and a steep one via tTaper
      const taperSize = (p: number, base: number) => {
        const flat = base;
        const tapered = base * (0.1 + 0.9 * p);
        return flat * (1 - tTaper) + tapered * tTaper;
      };

      // Soft glow layer (larger, more transparent) — intensity driven by tGlow
      if (tGlow > 0) {
        layers.push(
          new ScatterplotLayer({
            id: "entity-trail-glow",
            data: trailData,
            getPosition: (d: TrailPoint) => d.position,
            getFillColor: (d: TrailPoint) => {
              const s = styles[d.entityIdx];
              const rgb = s ? hexToRgb(s.color) : [200, 200, 200];
              const a = d.progress * d.progress * d.progress;
              return [...rgb, Math.round(a * 100 * tOp * tGlow)] as [number, number, number, number];
            },
            getRadius: (d: TrailPoint) => {
              const s = styles[d.entityIdx];
              const base = s ? s.dotSize * (0.5 + 0.5 * tGlow) : 6;
              return taperSize(d.progress, base);
            },
            radiusUnits: "pixels" as const,
            radiusMinPixels: 2,
            radiusMaxPixels: 30,
          }),
        );
      }
      // Core trail dots (smaller, more opaque)
      layers.push(
        new ScatterplotLayer({
          id: "entity-trail",
          data: trailData,
          getPosition: (d: TrailPoint) => d.position,
          getFillColor: (d: TrailPoint) => {
            const s = styles[d.entityIdx];
            const rgb = s ? hexToRgb(s.color) : [200, 200, 200];
            const a = d.progress * d.progress;
            return [...rgb, Math.round(a * 255 * tOp)] as [number, number, number, number];
          },
          getRadius: (d: TrailPoint) => {
            const s = styles[d.entityIdx];
            const base = s ? s.dotSize * 0.35 : 3;
            return taperSize(d.progress, base);
          },
          radiusUnits: "pixels" as const,
          radiusMinPixels: 1,
          radiusMaxPixels: 16,
        }),
      );
    }

    overlay.setProps({ layers });
  }, []);

  // Update a single entity's visual style and immediately apply it.
  const applyMarkerStyle = React.useCallback(
    (idx: number, patch: Partial<EntityStyle>) => {
      const marker = entityMarkersRef.current[idx];
      if (marker) {
        const el = marker.getElement();
        if (patch.color != null) el.style.backgroundColor = patch.color;
        if (patch.dotSize != null) {
          el.style.width = `${patch.dotSize}px`;
          el.style.height = `${patch.dotSize}px`;
        }
      }
    },
    [],
  );

  const updateEntityStyle = React.useCallback(
    (idx: number, patch: Partial<EntityStyle>) => {
      setEntityStyles((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        entityStylesRef.current = next;
        styleVersionRef.current++;
        return next;
      });
      applyMarkerStyle(idx, patch);
      syncOverlay(currentTimeRef.current);
    },
    [syncOverlay, applyMarkerStyle],
  );

  // Update all entities in a group at once.
  const updateGroupStyle = React.useCallback(
    (indices: number[], patch: Partial<EntityStyle>) => {
      setEntityStyles((prev) => {
        const next = [...prev];
        for (const idx of indices) next[idx] = { ...next[idx], ...patch };
        entityStylesRef.current = next;
        styleVersionRef.current++;
        return next;
      });
      for (const idx of indices) applyMarkerStyle(idx, patch);
      syncOverlay(currentTimeRef.current);
    },
    [syncOverlay, applyMarkerStyle],
  );

  // Legend collapse states
  const [legendSizes, setLegendSizes] = React.useState(false);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const toggleGroup = React.useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Group trajectories by type prefix (the part before the first "-")
  const legendGroups = React.useMemo(() => {
    if (!trajectories || entityStyles.length === 0) return [];
    const map = new Map<string, number[]>();
    for (let i = 0; i < trajectories.length; i++) {
      const id = String(trajectories[i].id);
      const dash = id.indexOf("-");
      const group = dash >= 0 ? id.slice(0, dash) : id;
      let arr = map.get(group);
      if (!arr) { arr = []; map.set(group, arr); }
      arr.push(i);
    }
    return Array.from(map.entries()).map(([name, indices]) => ({ name, indices }));
  }, [trajectories, entityStyles]);

  // Update overlay when not playing (scrubbing, trajectory changes)
  React.useEffect(() => {
    if (playing) return;
    syncOverlay(currentTime);
  }, [trajectories, currentTime, playing, syncOverlay]);

  // Animation loop — updates the overlay synchronously inside RAF,
  // then sets React state for the timeline UI.
  React.useEffect(() => {
    if (!playing) return;
    let prev: number | null = null;
    let raf: number;
    const tick = (ts: number) => {
      if (!playingRef.current) return;
      if (prev != null) {
        const dtMs = ts - prev;
        const dtCs = (dtMs / 1000) * 100 * speedRef.current;
        const next = currentTimeRef.current + dtCs;
        const [, tMax] = timeRangeRef.current;
        if (next >= tMax) {
          currentTimeRef.current = tMax;
          syncOverlay(tMax);
          setCurrentTime(tMax);
          setPlaying(false);
          return;
        }
        currentTimeRef.current = next;
        syncOverlay(next);
        setCurrentTime(next);
      }
      prev = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, syncOverlay]);

  const toggleFullscreen = React.useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden rounded-[var(--radius-md)]"
    >
      <div ref={containerRef} className="h-full w-full" />

      <DraggableToolbar wrapperRef={wrapperRef} resetKey={isFullscreen}>
        <select
          className="anim-tile-select"
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
        >
          {TILE_GROUP_ORDER.map((group) => (
            <React.Fragment key={group}>
              <option disabled className="anim-tile-select__header">
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
        <div className="anim-fs-divider" />
        <div className="anim-zoom-group">
          <ToolbarButton
            icon={ZOOM_IN_ICON}
            title="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
          />
          <span className="anim-zoom-badge">Z {zoomDisplay.toFixed(1)}</span>
          <ToolbarButton
            icon={ZOOM_OUT_ICON}
            title="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
          />
        </div>
        <ToolbarButton
          ref={terrainBtnRef}
          title={terrainOn ? "Disable 3D terrain" : "Enable 3D terrain"}
          icon={TERRAIN_ICON}
          active={terrainOn}
          onClick={() => setTerrainOn((v) => !v)}
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
          ref={trailBtnRef}
          icon={TRAIL_ICON}
          title={trailOn ? "Trail settings (on)" : "Trail settings (off)"}
          active={trailOn}
          onClick={() => setTrailOn((v) => !v)}
        />
        <ToolbarButton
          icon={isFullscreen ? SHRINK_ICON : EXPAND_ICON}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={toggleFullscreen}
        />

        {terrainOn && terrainSliderLeft != null && (
          <div
            className="anim-terrain-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime offset from button position
            style={{ left: `${terrainSliderLeft}px` }}
          >
            <span className="anim-terrain-slider-wrap__label">3D &times;</span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={terrainExaggeration}
              onChange={(e) => setTerrainExaggeration(Number(e.target.value))}
            />
            <span className="anim-terrain-slider-wrap__value">
              {terrainExaggeration.toFixed(1)}
            </span>
          </div>
        )}

        {trailOn && trailSliderLeft != null && (
          <div
            className="anim-trail-slider-wrap"
            // eslint-disable-next-line template/no-jsx-style-prop
            style={{ left: `${trailSliderLeft}px` }}
          >
            <div className="anim-trail-slider-wrap__row">
              <span className="anim-trail-slider-wrap__label">Length</span>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={trailLength}
                onChange={(e) => setTrailLength(Number(e.target.value))}
              />
              <span className="anim-trail-slider-wrap__value">
                {trailLength.toFixed(1)}&times;
              </span>
            </div>
            <div className="anim-trail-slider-wrap__row">
              <span className="anim-trail-slider-wrap__label">Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={trailOpacity}
                onChange={(e) => setTrailOpacity(Number(e.target.value))}
              />
              <span className="anim-trail-slider-wrap__value">
                {Math.round(trailOpacity * 100)}%
              </span>
            </div>
            <div className="anim-trail-slider-wrap__row">
              <span className="anim-trail-slider-wrap__label">Density</span>
              <input
                type="range"
                min={4}
                max={100}
                step={1}
                value={trailDensity}
                onChange={(e) => setTrailDensity(Number(e.target.value))}
              />
              <span className="anim-trail-slider-wrap__value">
                {trailDensity}
              </span>
            </div>
            <div className="anim-trail-slider-wrap__row">
              <span className="anim-trail-slider-wrap__label">Taper</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={trailTaper}
                onChange={(e) => setTrailTaper(Number(e.target.value))}
              />
              <span className="anim-trail-slider-wrap__value">
                {Math.round(trailTaper * 100)}%
              </span>
            </div>
            <div className="anim-trail-slider-wrap__row">
              <span className="anim-trail-slider-wrap__label">Glow</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={trailGlow}
                onChange={(e) => setTrailGlow(Number(e.target.value))}
              />
              <span className="anim-trail-slider-wrap__value">
                {Math.round(trailGlow * 100)}%
              </span>
            </div>
          </div>
        )}
      </DraggableToolbar>

      {/* Entity legend — top-left */}
      {trajectories && legendGroups.length > 0 && (
        <div className="anim-legend">
          {/* Header: title + crew-wide sliders + collapse chevron */}
          <div className="anim-legend__header">
            <span className="anim-legend__title">Crew</span>
            {legendSizes && entityStyles.length > 0 && (() => {
              const allIndices = legendGroups.flatMap((g) => g.indices);
              const s0 = entityStyles[0];
              return (
                <div className="anim-legend__sliders">
                  <span
                    className="anim-legend__size-icon anim-legend__size-icon--lg"
                    // eslint-disable-next-line template/no-jsx-style-prop
                    style={{ backgroundColor: "#64748b" }}
                  />
                  <input
                    type="range"
                    className="anim-legend__slider"
                    min={4}
                    max={30}
                    value={s0.dotSize}
                    title={`All dot size: ${s0.dotSize}px`}
                    onChange={(e) => updateGroupStyle(allIndices, { dotSize: Number(e.target.value) })}
                  />
                  <span
                    className="anim-legend__size-icon"
                    // eslint-disable-next-line template/no-jsx-style-prop
                    style={{ backgroundColor: "#64748b" }}
                  />
                  <input
                    type="range"
                    className="anim-legend__slider"
                    min={0.5}
                    max={12}
                    step={0.5}
                    value={s0.acquSize}
                    title={`All ACQU size: ${s0.acquSize}px`}
                    onChange={(e) => updateGroupStyle(allIndices, { acquSize: Number(e.target.value) })}
                  />
                </div>
              );
            })()}
            <button
              type="button"
              className="anim-legend__chevron"
              onClick={() => setLegendSizes((v) => !v)}
              title={legendSizes ? "Hide sizes" : "Show sizes"}
            >
              {legendSizes ? "\u25B4" : "\u25BE"}
            </button>
          </div>

          {legendGroups.map((grp) => {
                const firstStyle = entityStyles[grp.indices[0]];
                if (!firstStyle) return null;
                const isGroupOpen = !collapsedGroups.has(grp.name);
                return (
                  <div key={grp.name} className="anim-legend__group">
                    {/* Group header — click to collapse/expand children */}
                    <div
                      className="anim-legend__row anim-legend__row--group"
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleGroup(grp.name)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleGroup(grp.name); }}
                    >
                      <span className="anim-legend__group-chevron">
                        {isGroupOpen ? "\u25BE" : "\u25B8"}
                      </span>
                      <span
                        className="anim-legend__color"
                        // eslint-disable-next-line template/no-jsx-style-prop
                        style={{ backgroundColor: firstStyle.color }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="color"
                          value={firstStyle.color}
                          onChange={(e) => updateGroupStyle(grp.indices, { color: e.target.value })}
                        />
                      </span>
                      <span className="anim-legend__label">{grp.name}</span>
                      {legendSizes && (
                        <div className="anim-legend__sliders" role="presentation" onClick={(e) => e.stopPropagation()}>
                          <span
                            className="anim-legend__size-icon anim-legend__size-icon--lg"
                            // eslint-disable-next-line template/no-jsx-style-prop
                            style={{ backgroundColor: firstStyle.color }}
                          />
                          <input
                            type="range"
                            className="anim-legend__slider"
                            min={4}
                            max={30}
                            value={firstStyle.dotSize}
                            title={`Group dot size: ${firstStyle.dotSize}px`}
                            onChange={(e) => updateGroupStyle(grp.indices, { dotSize: Number(e.target.value) })}
                          />
                          <span
                            className="anim-legend__size-icon"
                            // eslint-disable-next-line template/no-jsx-style-prop
                            style={{ backgroundColor: firstStyle.color }}
                          />
                          <input
                            type="range"
                            className="anim-legend__slider"
                            min={0.5}
                            max={12}
                            step={0.5}
                            value={firstStyle.acquSize}
                            title={`Group ACQU size: ${firstStyle.acquSize}px`}
                            onChange={(e) => updateGroupStyle(grp.indices, { acquSize: Number(e.target.value) })}
                          />
                        </div>
                      )}
                    </div>
                    {/* Individual wid rows */}
                    {isGroupOpen && grp.indices.map((idx) => {
                      const traj = trajectories![idx];
                      const s = entityStyles[idx];
                      if (!s) return null;
                      const widLabel = String(traj.id).slice(grp.name.length + 1) || String(traj.id);
                      return (
                        <div key={String(traj.id)} className="anim-legend__row anim-legend__row--child">
                          <span
                            className="anim-legend__color"
                            // eslint-disable-next-line template/no-jsx-style-prop
                            style={{ backgroundColor: s.color }}
                          >
                            <input
                              type="color"
                              value={s.color}
                              onChange={(e) => updateEntityStyle(idx, { color: e.target.value })}
                            />
                          </span>
                          <span className="anim-legend__label">{widLabel}</span>
                          {legendSizes && (
                            <div className="anim-legend__sliders">
                              <span
                                className="anim-legend__size-icon anim-legend__size-icon--lg"
                                // eslint-disable-next-line template/no-jsx-style-prop
                                style={{ backgroundColor: s.color }}
                              />
                              <input
                                type="range"
                                className="anim-legend__slider"
                                min={4}
                                max={30}
                                value={s.dotSize}
                                title={`Dot size: ${s.dotSize}px`}
                                onChange={(e) => updateEntityStyle(idx, { dotSize: Number(e.target.value) })}
                              />
                              <span
                                className="anim-legend__size-icon"
                                // eslint-disable-next-line template/no-jsx-style-prop
                                style={{ backgroundColor: s.color }}
                              />
                              <input
                                type="range"
                                className="anim-legend__slider"
                                min={0.5}
                                max={12}
                                step={0.5}
                                value={s.acquSize}
                                title={`ACQU size: ${s.acquSize}px`}
                                onChange={(e) => updateEntityStyle(idx, { acquSize: Number(e.target.value) })}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
        </div>
      )}

      {/* Timeline bar — bottom */}
      {trajectories && trajectories.length > 0 && timeRange[1] > timeRange[0] && (
        <div className="anim-timeline">
          <div className="anim-timeline__top">
            <button
              type="button"
              className="anim-timeline__btn"
              onClick={() => {
                if (currentTime >= timeRange[1]) setCurrentTime(timeRange[0]);
                setPlaying((p) => !p);
              }}
            >
              {playing ? "\u23F8" : currentTime >= timeRange[1] ? "\u21BB" : "\u25B6"}
            </button>
            <span className="anim-timeline__time">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="anim-timeline__slider"
              min={timeRange[0]}
              max={timeRange[1]}
              step={100}
              value={currentTime}
              onChange={(e) => { setCurrentTime(Number(e.target.value)); setPlaying(false); }}
            />
            <button
              type="button"
              className="anim-timeline__btn anim-timeline__btn--secondary"
              onClick={() => { setPlaying(false); setCurrentTime(timeRange[0]); }}
            >
              Reset
            </button>
            <select
              className="anim-timeline__speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {SPEED_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}&times;</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
