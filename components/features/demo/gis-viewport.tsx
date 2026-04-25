"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSONFeatureCollection } from "@/lib/gpkg";
import { defaultTileIndex } from "@/lib/default-tile";
import { useIsDarkTheme } from "@/lib/use-is-dark-theme";

const TILE_SOURCES: { name: string; url: string; attr: string; maxZoom: number }[] = [
  // --- Satellite / Aerial ---
  {
    name: "Esri Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
  },
  {
    name: "Esri Satellite + Labels",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 18,
  },
  {
    name: "Google Satellite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    attr: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Google Hybrid",
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attr: "&copy; Google",
    maxZoom: 22,
  },
  // --- Street / General ---
  {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
    maxZoom: 19,
  },
  {
    name: "Google Streets",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attr: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Google Terrain",
    url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
    attr: "&copy; Google",
    maxZoom: 22,
  },
  {
    name: "Esri Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 23,
  },
  {
    name: "CyclOSM",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attr: "&copy; CyclOSM &amp; OpenStreetMap contributors",
    maxZoom: 20,
  },
  {
    name: "Humanitarian OSM",
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attr: "&copy; OpenStreetMap contributors, Humanitarian OSM Team",
    maxZoom: 19,
  },
  // --- Topographic ---
  {
    name: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attr: "&copy; OpenTopoMap (CC-BY-SA)",
    maxZoom: 17,
  },
  {
    name: "Esri Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 23,
  },
  {
    name: "Esri NatGeo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri &mdash; National Geographic",
    maxZoom: 16,
  },
  {
    name: "Esri Terrain",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 13,
  },
  {
    name: "Esri Ocean",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, NGA, USGS",
    maxZoom: 13,
  },
  // --- Minimal / Canvas ---
  {
    name: "Esri Light Gray",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  {
    name: "Esri Dark Gray",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; Esri",
    maxZoom: 16,
  },
  {
    name: "CartoDB Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  {
    name: "CartoDB Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  {
    name: "CartoDB Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://carto.com/'>CARTO</a>",
    maxZoom: 20,
  },
  // --- USGS ---
  {
    name: "USGS Imagery",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; USGS",
    maxZoom: 16,
  },
  {
    name: "USGS Topo",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    attr: "Tiles &copy; USGS",
    maxZoom: 16,
  },
  // --- Stadia / Stamen ---
  {
    name: "Stamen Watercolor",
    url: "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
    attr: "&copy; <a href='https://stamen.com/'>Stamen Design</a>, &copy; OpenStreetMap contributors",
    maxZoom: 16,
  },
  {
    name: "Stamen Toner",
    url: "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://stamen.com/'>Stamen Design</a>, &copy; OpenStreetMap contributors",
    maxZoom: 20,
  },
  {
    name: "Stamen Terrain",
    url: "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://stamen.com/'>Stamen Design</a>, &copy; OpenStreetMap contributors",
    maxZoom: 18,
  },
  // --- Wikimedia ---
  {
    name: "Wikimedia",
    url: "https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}{r}.png",
    attr: "&copy; <a href='https://wikimediafoundation.org/'>Wikimedia</a>, &copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  // --- Overlays (transport-themed) ---
  {
    name: "OpenRailwayMap",
    url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://www.openrailwaymap.org/'>OpenRailwayMap</a>, &copy; OpenStreetMap contributors",
    maxZoom: 19,
  },
  {
    name: "OpenSeaMap",
    url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
    attr: "&copy; <a href='https://www.openseamap.org/'>OpenSeaMap</a> contributors",
    maxZoom: 18,
  },
];

const LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const DEFAULT_CENTER: [number, number] = [0, 0];
const DEFAULT_ZOOM = 2;

// ---------------------------------------------------------------------------
// Compute bounds from GeoJSON coordinates directly
// ---------------------------------------------------------------------------

function geojsonBounds(data: GeoJSONFeatureCollection): L.LatLngBounds | null {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

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
    if (f.geometry) visit(f.geometry.coordinates);
  }

  if (!isFinite(minLat)) return null;
  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------

function InvalidateSize() {
  const map = useMap();
  React.useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FitBounds({ data }: { data: GeoJSONFeatureCollection }) {
  const map = useMap();
  const fittedRef = React.useRef(false);

  // Reset flag when component remounts (new file selected)
  React.useEffect(() => {
    fittedRef.current = false;
  }, []);

  React.useEffect(() => {
    if (fittedRef.current || !data.features.length) return;
    fittedRef.current = true;

    const timer = setTimeout(() => {
      map.invalidateSize();
      const bounds = geojsonBounds(data);
      if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16, animate: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [map, data]);

  return null;
}

// ---------------------------------------------------------------------------
// Edit controller — click-to-edit individual features (scales to 20k+)
// ---------------------------------------------------------------------------

const selectedStyle: L.PathOptions = {
  color: "#3b82f6",
  weight: 3,
  opacity: 1,
  fillColor: "#3b82f6",
  fillOpacity: 0.3,
};

function EditController({
  editing,
  onEdited,
}: {
  editing: boolean;
  onEdited: (features: GeoJSON.Feature[]) => void;
}) {
  const map = useMap();
  const activeRef = React.useRef<L.Path | null>(null);
  const editedRef = React.useRef<Set<L.Path>>(new Set());
  const onEditedRef = React.useRef(onEdited);
  const skipMapClickRef = React.useRef(false);
  onEditedRef.current = onEdited;

  React.useEffect(() => {
    if (!editing) return;

    function deselectActive() {
      const prev = activeRef.current;
      if (!prev) return;
      prev.off("pm:edit");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prev as any).pm.disable();
      prev.setStyle(featureStyle);
      activeRef.current = null;
    }

    function onMapClick() {
      if (skipMapClickRef.current) return;
      deselectActive();
    }

    function onFeatureClick(this: L.Path) {
      if (activeRef.current === this) return;
      skipMapClickRef.current = true;
      setTimeout(() => { skipMapClickRef.current = false; }, 0);

      deselectActive();
      activeRef.current = this;
      this.setStyle(selectedStyle);
      this.on("pm:edit", () => { editedRef.current.add(this); });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).pm.enable({ snappable: true });
    }

    // Attach click-to-edit handlers to feature layers
    map.eachLayer((layer) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((layer as any).feature && "setStyle" in layer) {
        (layer as L.Path).on("click", onFeatureClick);
      }
    });
    map.on("click", onMapClick);
    map.getContainer().style.cursor = "crosshair";

    // Capture the current ref value so the cleanup uses the same Set we
    // populated in this effect run, not whatever a later run may have set.
    const editedSet = editedRef.current;

    // Cleanup: collect edits and remove handlers
    return () => {
      deselectActive();

      const features: GeoJSON.Feature[] = [];
      editedSet.forEach((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        features.push((layer as any).toGeoJSON() as GeoJSON.Feature);
      });
      editedSet.clear();

      map.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((layer as any).feature && "setStyle" in layer) {
          (layer as L.Path).off("click");
        }
      });
      map.off("click", onMapClick);
      map.getContainer().style.cursor = "";

      if (features.length > 0) {
        onEditedRef.current(features);
      }
    };
  }, [map, editing]);

  return null;
}

// ---------------------------------------------------------------------------
// Draw controller — enables geoman draw for adding new features
// ---------------------------------------------------------------------------

function gpkgTypeToPmShape(geometryType: string): string {
  const t = geometryType.toUpperCase().replace(/^MULTI/, "");
  if (t.startsWith("POINT")) return "CircleMarker";
  if (t.startsWith("LINESTRING")) return "Line";
  if (t.startsWith("POLYGON")) return "Polygon";
  return "Polygon";
}

function wrapGeomToType(
  geom: GeoJSON.Geometry,
  geometryType: string
): GeoJSON.Geometry {
  const target = geometryType.toUpperCase();
  if (!target.startsWith("MULTI")) return geom;

  if (geom.type === "Point" && target === "MULTIPOINT") {
    return { type: "MultiPoint", coordinates: [geom.coordinates] };
  }
  if (geom.type === "LineString" && target === "MULTILINESTRING") {
    return { type: "MultiLineString", coordinates: [geom.coordinates] };
  }
  if (geom.type === "Polygon" && target === "MULTIPOLYGON") {
    return { type: "MultiPolygon", coordinates: [geom.coordinates] };
  }
  return geom;
}

function DrawController({
  adding,
  geometryType,
  onAdded,
}: {
  adding: boolean;
  geometryType: string;
  onAdded: (feature: GeoJSON.Feature) => void;
}) {
  const map = useMap();
  const onAddedRef = React.useRef(onAdded);
  React.useEffect(() => {
    onAddedRef.current = onAdded;
  }, [onAdded]);

  React.useEffect(() => {
    if (!adding) return;

    const shape = gpkgTypeToPmShape(geometryType);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (map as any).pm;
    pm.enableDraw(shape, { snappable: true, continueDrawing: false });

    function onCreate(e: { layer: L.Layer; shape: string }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const drawn = (e.layer as any).toGeoJSON() as GeoJSON.Feature;
      map.removeLayer(e.layer);

      if (drawn.geometry) {
        drawn.geometry = wrapGeomToType(drawn.geometry, geometryType);
      }
      drawn.properties = drawn.properties ?? {};
      onAddedRef.current(drawn);
    }

    map.on("pm:create", onCreate);

    return () => {
      map.off("pm:create", onCreate);
      pm.disableDraw();
    };
  }, [map, adding, geometryType]);

  return null;
}

// ---------------------------------------------------------------------------
// Map toolbar — uses a real Leaflet Control so clicks work properly
// ---------------------------------------------------------------------------

const EDIT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 4-9 9H3v-4z"/><path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const ADD_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

const SAVE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

function makeBtn(icon: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gis-btn";
  btn.innerHTML = icon;
  return btn;
}

function MapToolbar({
  editing,
  adding,
  dirty,
  saving,
  onToggleEdit,
  onToggleAdd,
  onSave,
}: {
  editing: boolean;
  adding: boolean;
  dirty: boolean;
  saving: boolean;
  onToggleEdit: () => void;
  onToggleAdd: () => void;
  onSave: () => void;
}) {
  const map = useMap();
  const controlRef = React.useRef<L.Control | null>(null);
  const editBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const addBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const saveBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const callbacksRef = React.useRef({ onToggleEdit, onToggleAdd, onSave });

  React.useEffect(() => {
    callbacksRef.current = { onToggleEdit, onToggleAdd, onSave };
  }, [onToggleEdit, onToggleAdd, onSave]);

  // Create the Leaflet control once
  React.useEffect(() => {
    const GisToolbar = L.Control.extend({
      onAdd() {
        const container = L.DomUtil.create("div", "gis-toolbar");
        Object.assign(container.style, {
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        });

        const addBtn = makeBtn(ADD_ICON);
        addBtn.title = "Add feature";
        addBtn.addEventListener("click", () => callbacksRef.current.onToggleAdd());
        addBtnRef.current = addBtn;

        const editBtn = makeBtn(EDIT_ICON);
        editBtn.title = "Edit vertices";
        editBtn.addEventListener("click", () => callbacksRef.current.onToggleEdit());
        editBtnRef.current = editBtn;

        const saveBtn = makeBtn(SAVE_ICON);
        saveBtn.title = "Save edits";
        saveBtn.addEventListener("click", () => callbacksRef.current.onSave());
        saveBtnRef.current = saveBtn;

        container.appendChild(addBtn);
        container.appendChild(editBtn);
        container.appendChild(saveBtn);

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        return container;
      },
    });

    const ctrl = new GisToolbar({ position: "topright" });
    ctrl.addTo(map);
    controlRef.current = ctrl;

    return () => {
      ctrl.remove();
    };
  }, [map]);

  // Sync button appearance with props
  React.useEffect(() => {
    const editBtn = editBtnRef.current;
    if (!editBtn) return;
    editBtn.classList.toggle("gis-btn--active", editing);
    editBtn.title = editing ? "Stop editing" : "Edit vertices";
    editBtn.disabled = saving || adding;
  }, [editing, saving, adding]);

  React.useEffect(() => {
    const addBtn = addBtnRef.current;
    if (!addBtn) return;
    addBtn.classList.toggle("gis-btn--active", adding);
    addBtn.title = adding ? "Cancel add" : "Add feature";
    addBtn.disabled = saving || editing;
  }, [adding, saving, editing]);

  React.useEffect(() => {
    const saveBtn = saveBtnRef.current;
    if (!saveBtn) return;
    saveBtn.classList.toggle("gis-btn--dirty", dirty);
    saveBtn.title = saving ? "Saving…" : dirty ? "Save edits" : "No unsaved edits";
    saveBtn.disabled = saving || !dirty;
  }, [dirty, saving]);

  return null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const featureStyle: L.PathOptions = {
  color: "#facc15",
  weight: 2,
  opacity: 0.85,
  fillColor: "#facc15",
  fillOpacity: 0.15,
};

// Map control + geoman overrides — injected once
const GIS_CSS = `
  /* Map control buttons (toolbar + nav) */
  .gis-btn {
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
  .gis-btn:hover:not(:disabled) {
    background-color: #f3f4f6;
  }
  .gis-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .gis-btn--active {
    background-color: #3b82f6 !important;
    color: #fff !important;
    border-color: #3b82f6 !important;
  }
  .gis-btn--dirty {
    background-color: #fbbf24 !important;
    color: #78350f !important;
    border-color: #f59e0b !important;
    animation: gis-pulse 2s ease-in-out infinite;
  }
  [data-theme-kind="dark"] .gis-btn {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
  }
  [data-theme-kind="dark"] .gis-btn:hover:not(:disabled) {
    background-color: var(--color-bg-elevated);
  }

  /* Tile source selector */
  .gis-tile-select {
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
  [data-theme-kind="dark"] .gis-tile-select {
    background-color: var(--color-bg-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border-strong);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23cbd5e1'/%3E%3C/svg%3E");
  }

  /* Zoom badge */
  .gis-zoom-badge {
    font-size: 11px;
    font-family: monospace;
    color: #fff;
    background-color: rgba(0,0,0,0.5);
    border-radius: 4px;
    padding: 3px 6px;
    pointer-events: none;
    user-select: none;
  }

  /* Vertex markers: solid white squares with blue border */
  .marker-icon:not(.marker-icon-middle) {
    background-color: #fff !important;
    border: 2px solid #3b82f6 !important;
    border-radius: 2px !important;
    width: 10px !important;
    height: 10px !important;
    margin-left: -5px !important;
    margin-top: -5px !important;
    box-shadow: 0 0 3px rgba(0,0,0,0.4) !important;
  }
  /* Midpoint (segment center) markers: small orange circles */
  .marker-icon.marker-icon-middle {
    background-color: #fb923c !important;
    border: 1.5px solid #fff !important;
    border-radius: 50% !important;
    width: 8px !important;
    height: 8px !important;
    margin-left: -4px !important;
    margin-top: -4px !important;
    opacity: 0.8 !important;
    box-shadow: 0 0 2px rgba(0,0,0,0.3) !important;
  }
  .marker-icon.marker-icon-middle:hover {
    opacity: 1 !important;
    width: 10px !important;
    height: 10px !important;
    margin-left: -5px !important;
    margin-top: -5px !important;
  }
  /* Pulse animation for dirty save button */
  @keyframes gis-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.5); }
    50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
  }
`;

let cssInjected = false;
function injectGeomanCss() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = GIS_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Navigation control (zoom + fullscreen grouped)
// ---------------------------------------------------------------------------

const ZOOM_IN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

const ZOOM_OUT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';

const EXPAND_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

const SHRINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

function NavControl() {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();

    const zoomInBtn = makeBtn(ZOOM_IN_ICON);
    zoomInBtn.title = "Zoom in";
    zoomInBtn.addEventListener("click", () => map.zoomIn());

    const zoomOutBtn = makeBtn(ZOOM_OUT_ICON);
    zoomOutBtn.title = "Zoom out";
    zoomOutBtn.addEventListener("click", () => map.zoomOut());

    const fsBtn = makeBtn(EXPAND_ICON);
    fsBtn.title = "Fullscreen";

    function updateFs() {
      const isFs = !!document.fullscreenElement;
      fsBtn.innerHTML = isFs ? SHRINK_ICON : EXPAND_ICON;
      fsBtn.title = isFs ? "Exit fullscreen" : "Fullscreen";
      setTimeout(() => map.invalidateSize(), 100);
    }

    fsBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        container.requestFullscreen();
      }
    });

    document.addEventListener("fullscreenchange", updateFs);

    const Ctrl = L.Control.extend({
      onAdd() {
        const wrapper = L.DomUtil.create("div", "gis-nav");
        Object.assign(wrapper.style, {
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        });
        wrapper.appendChild(zoomInBtn);
        wrapper.appendChild(zoomOutBtn);
        wrapper.appendChild(fsBtn);
        L.DomEvent.disableClickPropagation(wrapper);
        L.DomEvent.disableScrollPropagation(wrapper);
        return wrapper;
      },
    });

    const ctrl = new Ctrl({ position: "bottomleft" });
    ctrl.addTo(map);

    return () => {
      ctrl.remove();
      document.removeEventListener("fullscreenchange", updateFs);
    };
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// Tile source selector + zoom indicator
// ---------------------------------------------------------------------------

function TileSourceSelector({
  sourceIndex,
  onChange,
}: {
  sourceIndex: number;
  onChange: (index: number) => void;
}) {
  const map = useMap();
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    const wrapper = L.DomUtil.create("div");
    Object.assign(wrapper.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "6px",
    });

    const select = document.createElement("select");
    select.className = "gis-tile-select";

    TILE_SOURCES.forEach((src, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = src.name;
      select.appendChild(opt);
    });

    select.value = String(sourceIndex);
    select.addEventListener("change", () => {
      onChangeRef.current(Number(select.value));
    });

    const zoomBadge = document.createElement("span");
    zoomBadge.className = "gis-zoom-badge";

    function updateZoom() {
      zoomBadge.textContent = `Z ${map.getZoom().toFixed(1)}`;
    }
    updateZoom();
    map.on("zoomend", updateZoom);

    wrapper.appendChild(select);
    wrapper.appendChild(zoomBadge);

    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);

    const Ctrl = L.Control.extend({
      onAdd() {
        return wrapper;
      },
    });
    const ctrl = new Ctrl({ position: "topleft" });
    ctrl.addTo(map);

    return () => {
      ctrl.remove();
      map.off("zoomend", updateZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

// ---------------------------------------------------------------------------
// Main viewport
// ---------------------------------------------------------------------------

export function GisViewport({
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
  const [tileIndex, setTileIndex] = React.useState(() =>
    defaultTileIndex(TILE_SOURCES),
  );
  // Theme-aware default-tile swap (Dark ⇄ Positron). Skipped when the user
  // has explicitly picked a non-CartoDB tile.
  const isDarkTheme = useIsDarkTheme();
  React.useEffect(() => {
    const currentName = TILE_SOURCES[tileIndex]?.name;
    if (currentName !== "CartoDB Dark" && currentName !== "CartoDB Positron") {
      return;
    }
    const wantName = isDarkTheme ? "CartoDB Dark" : "CartoDB Positron";
    if (currentName === wantName) return;
    const wantIdx = TILE_SOURCES.findIndex((s) => s.name === wantName);
    if (wantIdx >= 0) setTileIndex(wantIdx);
  }, [isDarkTheme, tileIndex]);
  React.useEffect(() => injectGeomanCss(), []);

  const hasData = data && data.features.length > 0;
  const tile = TILE_SOURCES[tileIndex];
  const showLabels = tile.name === "Esri Satellite + Labels";

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      preferCanvas
      zoomControl={false}
      // eslint-disable-next-line template/no-jsx-style-prop -- full-size map
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer key={tileIndex} url={tile.url} attribution={tile.attr} maxZoom={tile.maxZoom} />
      {showLabels && <TileLayer url={LABELS_URL} maxZoom={23} />}
      <InvalidateSize />
      <NavControl />
      <TileSourceSelector sourceIndex={tileIndex} onChange={setTileIndex} />
      {hasData && (
        <>
          <GeoJSON
            key={`${dataKey}:${data.features.length}`}
            data={data as GeoJSON.FeatureCollection}
            // eslint-disable-next-line template/no-jsx-style-prop -- Leaflet path options, not CSS
            style={featureStyle}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, { ...featureStyle, radius: 5 })
            }
          />
          <FitBounds key={dataKey} data={data} />
          <EditController editing={editing} onEdited={onEdited} />
        </>
      )}
      {data && (
        <>
          <DrawController
            adding={adding}
            geometryType={geometryType}
            onAdded={onAdded}
          />
          <MapToolbar
            editing={editing}
            adding={adding}
            dirty={dirty}
            saving={saving}
            onToggleEdit={onToggleEdit}
            onToggleAdd={onToggleAdd}
            onSave={onSave}
          />
        </>
      )}
    </MapContainer>
  );
}
