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

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1;

const FEATURE_COLOR = "#facc15";
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

const GLOBE_CSS = `
  .glb-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 2px solid rgba(0,0,0,0.2);
    background-color: #fff;
    color: #333;
    cursor: pointer;
    background-clip: padding-box;
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

  .glb-zoom-badge {
    font-size: 11px;
    font-family: monospace;
    color: #fff;
    background-color: rgba(0,0,0,0.5);
    border-radius: 4px;
    padding: 3px 6px;
    pointer-events: none;
    user-select: none;
    align-self: flex-start;
  }

  .glb-unsupported {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    font-size: 11px;
    font-family: system-ui, sans-serif;
    color: #fff;
    background-color: rgba(0,0,0,0.55);
    border-radius: 4px;
    padding: 4px 8px;
    pointer-events: none;
    user-select: none;
  }

  @keyframes glb-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.5); }
    50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
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

function makeBtn(icon: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "glb-btn";
  btn.innerHTML = icon;
  return btn;
}

export function GisGlobeViewport({
  data,
  dataKey,
  editing,
  adding,
  dirty,
  saving,
  onSave,
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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const [tileIndex, setTileIndex] = React.useState(0);
  const [styleReady, setStyleReady] = React.useState(false);
  const [zoomDisplay, setZoomDisplay] = React.useState(DEFAULT_ZOOM);
  const fittedKeyRef = React.useRef<string | null>(null);
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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

    // ResizeObserver so the map keeps up with the resizable panel
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    mapRef.current = map;

    return () => {
      ro.disconnect();
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
      });
      map.addLayer({
        id: FEATURES_FILL_LAYER,
        type: "fill",
        source: FEATURES_SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": FEATURE_COLOR,
          "fill-opacity": 0.15,
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
          "line-opacity": 0.85,
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
          "circle-opacity": 0.85,
          "circle-stroke-color": "#78350f",
          "circle-stroke-width": 1,
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

  const tile = TILE_SOURCES[tileIndex];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-md)]">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-left: tile selector + zoom badge */}
      <div className="glb-panel glb-panel--tl">
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
      </div>

      {/* Top-right: edit / add / save toolbar (edit & add disabled on globe) */}
      <div className="glb-panel glb-panel--tr">
        <ToolbarButton
          title="Add feature (unsupported on globe)"
          icon={ADD_ICON}
          disabled
          active={adding}
        />
        <ToolbarButton
          title="Edit vertices (unsupported on globe)"
          icon={EDIT_ICON}
          disabled
          active={editing}
        />
        <ToolbarButton
          title={saving ? "Saving…" : dirty ? "Save edits" : "No unsaved edits"}
          icon={SAVE_ICON}
          disabled={saving || !dirty}
          dirty={dirty}
          onClick={() => onSaveRef.current()}
        />
      </div>

      {/* Bottom-left: zoom + fullscreen */}
      <NavToolbar containerRef={containerRef} map={mapRef} />

      <p className="glb-unsupported">
        Vertex editing disabled on globe projection · Attribution:{" "}
        <span dangerouslySetInnerHTML={{ __html: tile.attribution }} />
      </p>
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

function NavToolbar({
  containerRef,
  map,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  map: React.RefObject<MLMap | null>;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    wrap.innerHTML = "";

    const zoomIn = makeBtn(ZOOM_IN_ICON);
    zoomIn.title = "Zoom in";
    zoomIn.addEventListener("click", () => map.current?.zoomIn());

    const zoomOut = makeBtn(ZOOM_OUT_ICON);
    zoomOut.title = "Zoom out";
    zoomOut.addEventListener("click", () => map.current?.zoomOut());

    const fsBtn = makeBtn(EXPAND_ICON);
    fsBtn.title = "Fullscreen";

    const updateFs = () => {
      const isFs = !!document.fullscreenElement;
      fsBtn.innerHTML = isFs ? SHRINK_ICON : EXPAND_ICON;
      fsBtn.title = isFs ? "Exit fullscreen" : "Fullscreen";
      setTimeout(() => map.current?.resize(), 100);
    };

    fsBtn.addEventListener("click", () => {
      const el = containerRef.current;
      if (!el) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen();
      }
    });

    document.addEventListener("fullscreenchange", updateFs);

    wrap.appendChild(zoomIn);
    wrap.appendChild(zoomOut);
    wrap.appendChild(fsBtn);

    return () => {
      document.removeEventListener("fullscreenchange", updateFs);
      wrap.innerHTML = "";
    };
  }, [containerRef, map]);

  return <div ref={wrapRef} className="glb-panel glb-panel--bl" />;
}
