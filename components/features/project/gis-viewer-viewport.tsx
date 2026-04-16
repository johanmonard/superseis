"use client";

import * as React from "react";
import maplibregl, {
  type Map as MLMap,
  type StyleSpecification,
  type RasterSourceSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { GeoJsonLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";

import { fetchFileGeoJson, type FileCategory } from "@/services/api/project-files";
import type { VisibleFile, GisLayerStyle } from "./project-gis-viewer";

// ---------------------------------------------------------------------------
// Tile sources (same catalog as animate-3d-viewport)
// ---------------------------------------------------------------------------

type TileGroup = "Satellite" | "Color" | "LightNoColor" | "Dark";
type TileSource = { name: string; tiles: string[]; attribution: string; maxZoom: number; tileSize?: number; group: TileGroup };

const TILE_GROUP_LABEL: Record<TileGroup, string> = {
  Satellite: "Satellite",
  Color: "Color maps",
  LightNoColor: "Light maps",
  Dark: "Dark maps",
};
const TILE_GROUP_ORDER: TileGroup[] = ["Satellite", "Color", "LightNoColor", "Dark"];

const TILE_SOURCES: TileSource[] = [
  { name: "Esri Satellite", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics", maxZoom: 18, group: "Satellite" },
  { name: "Esri Satellite + Labels", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 18, group: "Satellite" },
  { name: "Google Satellite", tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"], attribution: "&copy; Google", maxZoom: 22, group: "Satellite" },
  { name: "Google Hybrid", tiles: ["https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"], attribution: "&copy; Google", maxZoom: 22, group: "Satellite" },
  { name: "OpenStreetMap", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: "&copy; OpenStreetMap contributors", maxZoom: 19, group: "Color" },
  { name: "Google Streets", tiles: ["https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"], attribution: "&copy; Google", maxZoom: 22, group: "Color" },
  { name: "Google Terrain", tiles: ["https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"], attribution: "&copy; Google", maxZoom: 22, group: "Color" },
  { name: "Esri Street", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 19, group: "Color" },
  { name: "OpenTopoMap", tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png", "https://b.tile.opentopomap.org/{z}/{x}/{y}.png", "https://c.tile.opentopomap.org/{z}/{x}/{y}.png"], attribution: "&copy; OpenTopoMap (CC-BY-SA)", maxZoom: 17, group: "Color" },
  { name: "Esri Topo", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 19, group: "Color" },
  { name: "Esri NatGeo", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri &mdash; National Geographic", maxZoom: 16, group: "Color" },
  { name: "Esri Ocean", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 13, group: "Color" },
  { name: "Esri Light Gray", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 16, group: "LightNoColor" },
  { name: "Esri Dark Gray", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; Esri", maxZoom: 16, group: "Dark" },
  { name: "CartoDB Positron", tiles: ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"], attribution: "&copy; CARTO", maxZoom: 20, group: "LightNoColor" },
  { name: "CartoDB Dark", tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], attribution: "&copy; CARTO", maxZoom: 20, group: "Dark" },
  { name: "CartoDB Voyager", tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"], attribution: "&copy; CARTO", maxZoom: 20, group: "LightNoColor" },
  { name: "USGS Imagery", tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; USGS", maxZoom: 16, group: "Satellite" },
  { name: "USGS Topo", tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"], attribution: "Tiles &copy; USGS", maxZoom: 16, group: "Color" },
  { name: "Wikimedia", tiles: ["https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png"], attribution: "&copy; Wikimedia, &copy; OpenStreetMap contributors", maxZoom: 19, group: "Color" },
];

const DEFAULT_TILE = 15; // CartoDB Dark

function buildStyle(src: TileSource): StyleSpecification {
  const raster: RasterSourceSpecification = {
    type: "raster",
    tiles: src.tiles,
    tileSize: 256,
    maxzoom: src.maxZoom,
    attribution: src.attribution,
  };
  return { version: 8, sources: { basemap: raster }, layers: [{ id: "basemap", type: "raster", source: "basemap" }] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const GIS_CSS = `
  .gis-toolbar {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background-color: rgba(255,255,255,0.92);
    border: 1px solid rgba(15,23,42,0.12);
    box-shadow: 0 6px 20px rgba(15,23,42,0.18);
    user-select: none;
    backdrop-filter: blur(8px);
  }
  [data-theme="dark"] .gis-toolbar {
    background-color: rgba(15,23,42,0.88);
    border-color: rgba(255,255,255,0.14);
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  }
  .gis-btn {
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px; border: none; cursor: pointer;
    background-color: rgba(15,23,42,0.05); color: #1e293b;
  }
  .gis-btn:hover:not(:disabled) { background-color: rgba(15,23,42,0.1); }
  [data-theme="dark"] .gis-btn { background-color: rgba(255,255,255,0.08); color: #e2e8f0; }
  [data-theme="dark"] .gis-btn:hover:not(:disabled) { background-color: rgba(255,255,255,0.16); }
  .gis-btn--active { background-color: #3b82f6 !important; color: #fff !important; }
  .gis-tile-select {
    font-size: 11px; font-family: system-ui, sans-serif;
    padding: 4px 22px 4px 8px; border-radius: 4px;
    border: none; cursor: pointer; outline: none; appearance: none;
    background-color: rgba(15,23,42,0.05); color: #1e293b; font-weight: 500;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 6px center;
    background-clip: padding-box;
  }
  [data-theme="dark"] .gis-tile-select {
    background-color: rgba(255,255,255,0.08); color: #e2e8f0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23cbd5e1'/%3E%3C/svg%3E");
  }
  .gis-tile-select option {
    background-color: #fff;
    color: #1e293b;
  }
  [data-theme="dark"] .gis-tile-select option {
    background-color: #0f172a;
    color: #e2e8f0;
  }
  .gis-tile-select optgroup {
    background-color: #f1f5f9;
    color: #64748b;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  [data-theme="dark"] .gis-tile-select optgroup {
    background-color: #1e293b;
    color: #94a3b8;
  }
  .gis-zoom-group {
    display: inline-flex; align-items: stretch; height: 34px; border-radius: 8px; overflow: hidden;
    background-color: rgba(15,23,42,0.05); border: 1px solid rgba(15,23,42,0.12);
  }
  [data-theme="dark"] .gis-zoom-group { background-color: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14); }
  .gis-zoom-group > * { flex: 0 0 auto; height: 100%; border: 0 !important; border-radius: 0 !important; background-color: transparent !important; }
  .gis-zoom-group > * + * { border-left: 1px solid rgba(15,23,42,0.12) !important; }
  [data-theme="dark"] .gis-zoom-group > * + * { border-left-color: rgba(255,255,255,0.14) !important; }
  .gis-zoom-group .gis-btn { width: 32px; }
  .gis-zoom-badge {
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 600; font-family: ui-monospace, monospace;
    padding: 0 10px; min-width: 58px; color: #0f172a; user-select: none;
  }
  [data-theme="dark"] .gis-zoom-badge { color: #e2e8f0; }
  .gis-legend {
    position: absolute; top: 10px; left: 10px; z-index: 3;
    display: flex; flex-direction: column; gap: 0;
    padding: 5px 0; border-radius: 8px;
    background-color: rgba(255,255,255,0.88); border: 1px solid rgba(15,23,42,0.12);
    backdrop-filter: blur(8px); font-family: system-ui, sans-serif;
    font-size: 11px; color: #1e293b; user-select: none; min-width: 120px;
    max-height: 50%; overflow-y: auto;
  }
  [data-theme="dark"] .gis-legend {
    background-color: rgba(15,23,42,0.82); border-color: rgba(255,255,255,0.12);
    color: #e2e8f0;
  }
  .gis-legend__header {
    display: flex; align-items: center; gap: 6px;
    padding: 3px 10px 4px;
    border-bottom: 1px solid rgba(15,23,42,0.08); margin-bottom: 2px;
  }
  [data-theme="dark"] .gis-legend__header { border-bottom-color: rgba(255,255,255,0.08); }
  .gis-legend__title {
    font-weight: 700; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.05em; color: #334155; flex: 1;
  }
  [data-theme="dark"] .gis-legend__title { color: #cbd5e1; }
  .gis-legend__chevron {
    border: none; background: none; color: #94a3b8;
    cursor: pointer; font-size: 10px; line-height: 1; padding: 0 2px;
    display: flex; align-items: center;
  }
  .gis-legend__chevron:hover { color: #475569; }
  [data-theme="dark"] .gis-legend__chevron:hover { color: #e2e8f0; }
  .gis-legend__row {
    display: flex; align-items: center; gap: 5px;
    padding: 1.5px 10px;
  }
  .gis-legend__color {
    position: relative; width: 10px; height: 10px; border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.9); flex-shrink: 0; cursor: pointer;
  }
  [data-theme="dark"] .gis-legend__color { border-color: rgba(255,255,255,0.5); }
  .gis-legend__color input[type="color"] {
    position: absolute; inset: 0; width: 100%; height: 100%;
    opacity: 0; cursor: pointer; border: 0; padding: 0;
  }
  .gis-legend__label {
    flex: 1; min-width: 0; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
    color: #334155;
  }
  [data-theme="dark"] .gis-legend__label { color: #cbd5e1; }
  .gis-legend__sliders {
    display: flex; align-items: center; gap: 4px;
    margin-left: auto; flex-shrink: 0;
  }
  .gis-legend__slider-label {
    font-weight: 600; color: #64748b; font-size: 8px;
    text-transform: uppercase; letter-spacing: 0.03em;
    min-width: 10px; text-align: center;
  }
  [data-theme="dark"] .gis-legend__slider-label { color: #94a3b8; }
  .gis-legend__slider {
    -webkit-appearance: none; appearance: none;
    width: 52px; height: 3px; border-radius: 2px;
    background: rgba(15,23,42,0.15); outline: none;
    cursor: pointer; opacity: 0.5;
  }
  .gis-legend__slider:hover { opacity: 1; }
  .gis-legend__slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 8px; height: 8px;
    border-radius: 50%; background: #475569; border: none; cursor: pointer;
  }
  .gis-legend__slider::-moz-range-thumb {
    width: 8px; height: 8px; border-radius: 50%;
    background: #475569; border: none; cursor: pointer;
  }
  [data-theme="dark"] .gis-legend__slider { background: rgba(255,255,255,0.15); }
  [data-theme="dark"] .gis-legend__slider::-webkit-slider-thumb { background: #94a3b8; }
  [data-theme="dark"] .gis-legend__slider::-moz-range-thumb { background: #94a3b8; }
  .gis-legend__fill-cb {
    width: 10px; height: 10px; accent-color: #3b82f6;
    cursor: pointer; margin: 0; flex-shrink: 0;
  }
`;

const CSS_ID = "gis-viewer-css";

// ---------------------------------------------------------------------------
// SVG icons (inline to avoid import weight)
// ---------------------------------------------------------------------------

const ZoomInIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const ZoomOutIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const _TerrainIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m8 3 4 8 5-5 2 4"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/><path d="M5.92 19.9c2.6-1.54 5.18-1.38 7.78.45 2.72 1.92 5.44 1.98 8.17.18"/></svg>;
const TiltIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 L21 9 L12 15 L3 9 Z"/><path d="M3 9 L3 14 L12 20 L21 14 L21 9"/></svg>;
const ExpandIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GisViewerViewportProps {
  projectId: number | null;
  visibleFiles: VisibleFile[];
  onStyleChange: (category: FileCategory, filename: string, patch: Partial<GisLayerStyle>) => void;
  /** Additional deck.gl layers rendered on top of file layers */
  extraLayers?: unknown[];
  /** Extra content rendered at the bottom of the legend */
  legendExtra?: React.ReactNode;
}

export function GisViewerViewport({ projectId, visibleFiles, onStyleChange, extraLayers, legendExtra }: GisViewerViewportProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const overlayRef = React.useRef<MapboxOverlay | null>(null);
  const [tileIndex, setTileIndex] = React.useState(DEFAULT_TILE);
  const [styleReady, setStyleReady] = React.useState(false);
  const [zoomDisplay, setZoomDisplay] = React.useState(2);
  const [pitchDisplay, setPitchDisplay] = React.useState(0);
  const [, setIsFullscreen] = React.useState(false);
  const [legendSliders, setLegendSliders] = React.useState(false);

  // GeoJSON cache: key → FeatureCollection
  const geojsonCache = React.useRef<Map<string, GeoJSON.FeatureCollection>>(new Map());
  const [loadedKeys, setLoadedKeys] = React.useState<Set<string>>(new Set());

  // Inject CSS
  React.useEffect(() => {
    let style = document.getElementById(CSS_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = CSS_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== GIS_CSS) style.textContent = GIS_CSS;
  }, []);

  // Initialize map
  React.useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildStyle(TILE_SOURCES[tileIndex]),
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    });
    map.on("zoom", () => setZoomDisplay(Math.round(map.getZoom() * 10) / 10));
    map.on("pitch", () => setPitchDisplay(Math.round(map.getPitch())));
    map.on("style.load", () => setStyleReady(true));
    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; overlayRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add deck.gl overlay once style is ready
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady || overlayRef.current) return;
    const overlay = new MapboxOverlay({ layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);
    overlayRef.current = overlay;
  }, [styleReady]);

  // Update tile source
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setStyleReady(false);
    map.once("style.load", () => setStyleReady(true));
    map.setStyle(buildStyle(TILE_SOURCES[tileIndex]));
  }, [tileIndex]);

  // Fetch GeoJSON for visible files
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const toFetch = visibleFiles.filter((f) => {
      const key = `${f.category}/${f.filename}`;
      return !geojsonCache.current.has(key);
    });
    if (toFetch.length === 0) return;

    Promise.all(
      toFetch.map(async (f) => {
        const key = `${f.category}/${f.filename}`;
        try {
          const geojson = await fetchFileGeoJson(projectId, f.category, f.filename);
          if (!cancelled) {
            geojsonCache.current.set(key, geojson);
          }
        } catch { /* skip failed loads */ }
      })
    ).then(() => {
      if (!cancelled) {
        setLoadedKeys(new Set(geojsonCache.current.keys()));
      }
    });

    return () => { cancelled = true; };
  }, [projectId, visibleFiles]);

  // Update deck.gl layers
  React.useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !styleReady) return;

    const layers = visibleFiles
      .filter((f) => f.style.visible)
      .map((f) => {
        const key = `${f.category}/${f.filename}`;
        const data = geojsonCache.current.get(key);
        if (!data) return null;
        const alpha = Math.round(f.style.opacity * 255);
        const rgba = hexToRgba(f.style.color, alpha);
        const fillRgba = hexToRgba(f.style.color, Math.round(alpha * 0.3));
        return new GeoJsonLayer({
          id: key,
          data,
          pickable: true,
          stroked: true,
          filled: f.style.filled,
          getLineColor: rgba,
          getFillColor: fillRgba,
          getLineWidth: f.style.width,
          getPointRadius: f.style.width,
          lineWidthUnits: "pixels" as const,
          pointRadiusUnits: "pixels" as const,
          pointRadiusMinPixels: 2,
        });
      })
      .filter(Boolean);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (extraLayers) layers.push(...(extraLayers as any[]));
    overlay.setProps({ layers });
  }, [visibleFiles, loadedKeys, styleReady, extraLayers]);

  // Fit bounds to the combined extent of all visible files
  const fittedKeysRef = React.useRef("");
  React.useEffect(() => {
    if (visibleFiles.length === 0) return;
    const map = mapRef.current;
    if (!map) return;

    // Build a stable key for the current set of visible+loaded files
    const currentKeys = visibleFiles
      .filter((f) => geojsonCache.current.has(`${f.category}/${f.filename}`))
      .map((f) => `${f.category}/${f.filename}`)
      .sort()
      .join("|");
    if (!currentKeys || currentKeys === fittedKeysRef.current) return;

    const bounds = new maplibregl.LngLatBounds();
    const addCoord = (c: number[]) => bounds.extend([c[0], c[1]] as [number, number]);
    const walkCoords = (coords: unknown) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number") { addCoord(coords as number[]); return; }
      for (const c of coords) walkCoords(c);
    };

    for (const f of visibleFiles) {
      const data = geojsonCache.current.get(`${f.category}/${f.filename}`);
      if (!data) continue;
      for (const feature of data.features) {
        if (feature.geometry) walkCoords((feature.geometry as GeoJSON.Geometry & { coordinates: unknown }).coordinates);
      }
    }

    if (bounds.getNorthEast() && bounds.getSouthWest()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      fittedKeysRef.current = currentKeys;
    }
  }, [visibleFiles, loadedKeys]);

  // Toolbar handlers
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleTilt = () => {
    const map = mapRef.current;
    if (!map) return;
    const newPitch = pitchDisplay > 0 ? 0 : 60;
    map.easeTo({ pitch: newPitch, duration: 600 });
  };
  const handleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      el.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  return (
    // eslint-disable-next-line template/no-jsx-style-prop -- runtime map sizing
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* MapLibre container */}
      {/* eslint-disable-next-line template/no-jsx-style-prop -- runtime map sizing */}
      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Legend */}
      {visibleFiles.length > 0 && (
        <div className="gis-legend">
          <div className="gis-legend__header">
            <span className="gis-legend__title">Layers</span>
            <button
              type="button"
              className="gis-legend__chevron"
              onClick={() => setLegendSliders((v) => !v)}
              title={legendSliders ? "Hide sliders" : "Show sliders"}
            >
              {legendSliders ? "\u25B4" : "\u25BE"}
            </button>
          </div>
          {visibleFiles.map((f) => {
            const key = `${f.category}/${f.filename}`;
            return (
              <div key={key} className="gis-legend__row">
                {/* eslint-disable-next-line template/no-jsx-style-prop -- runtime color */}
                <span className="gis-legend__color" style={{ backgroundColor: f.style.color }}>
                  <input
                    type="color"
                    value={f.style.color}
                    onChange={(e) => onStyleChange(f.category, f.filename, { color: e.target.value })}
                  />
                </span>
                <span className="gis-legend__label">{f.filename.replace(/\.gpkg$/, "")}</span>
                {legendSliders && (
                  <div className="gis-legend__sliders">
                    <span className="gis-legend__slider-label">W</span>
                    <input
                      type="range"
                      className="gis-legend__slider"
                      min={1}
                      max={f.category === "poi" ? 20 : 8}
                      step={1}
                      value={f.style.width}
                      title={f.category === "poi" ? `Size: ${f.style.width}px` : `Width: ${f.style.width}px`}
                      onChange={(e) => onStyleChange(f.category, f.filename, { width: Number(e.target.value) })}
                    />
                    <span className="gis-legend__slider-label">O</span>
                    <input
                      type="range"
                      className="gis-legend__slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={f.style.opacity}
                      title={`Opacity: ${Math.round(f.style.opacity * 100)}%`}
                      onChange={(e) => onStyleChange(f.category, f.filename, { opacity: Number(e.target.value) })}
                    />
                    {f.category === "polygons" ? (
                      <input
                        type="checkbox"
                        className="gis-legend__fill-cb"
                        checked={f.style.filled}
                        title={f.style.filled ? "Filled" : "Outline only"}
                        onChange={(e) => onStyleChange(f.category, f.filename, { filled: e.target.checked })}
                      />
                    ) : ( // eslint-disable-next-line template/no-jsx-style-prop -- alignment spacer
                      <span style={{ width: 10, flexShrink: 0 }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {legendExtra}
        </div>
      )}

      {/* Toolbar */}
      <div className="gis-toolbar">
        {/* Tile selector */}
        <select
          className="gis-tile-select"
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
        >
          {TILE_GROUP_ORDER.map((group) => (
            <optgroup key={group} label={TILE_GROUP_LABEL[group]}>
              {TILE_SOURCES.map((src, i) =>
                src.group === group ? (
                  <option key={src.name} value={i}>{src.name}</option>
                ) : null
              )}
            </optgroup>
          ))}
        </select>

        {/* Divider */}
        {/* eslint-disable-next-line template/no-jsx-style-prop -- toolbar divider */}
        <div style={{ width: 1, height: 22, backgroundColor: "rgba(15,23,42,0.15)" }} />

        {/* Zoom */}
        <div className="gis-zoom-group">
          <button className="gis-btn" onClick={handleZoomOut} title="Zoom out"><ZoomOutIcon /></button>
          <span className="gis-zoom-badge">{zoomDisplay.toFixed(1)}</span>
          <button className="gis-btn" onClick={handleZoomIn} title="Zoom in"><ZoomInIcon /></button>
        </div>

        {/* Tilt */}
        <button
          className={`gis-btn${pitchDisplay > 0 ? " gis-btn--active" : ""}`}
          onClick={handleTilt}
          title={pitchDisplay > 0 ? "Reset tilt" : "Tilt 60°"}
        >
          <TiltIcon />
        </button>

        {/* Fullscreen */}
        <button className="gis-btn" onClick={handleFullscreen} title="Fullscreen">
          <ExpandIcon />
        </button>
      </div>
    </div>
  );
}
