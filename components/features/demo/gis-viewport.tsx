"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import type { GeoJSONFeatureCollection } from "@/lib/gpkg";

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTR =
  "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics";

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

function FitBounds({ dataKey, data }: { dataKey: string; data: GeoJSONFeatureCollection }) {
  const map = useMap();
  const prevKey = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (dataKey === prevKey.current || !data.features.length) return;
    prevKey.current = dataKey;

    const id = requestAnimationFrame(() => {
      map.invalidateSize();
      const bounds = geojsonBounds(data);
      if (bounds) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    });
    return () => cancelAnimationFrame(id);
  }, [map, dataKey, data]);

  return null;
}

// ---------------------------------------------------------------------------
// Edit controller
// ---------------------------------------------------------------------------

function EditController({
  editing,
  onEdited,
}: {
  editing: boolean;
  onEdited: (features: GeoJSON.Feature[]) => void;
}) {
  const map = useMap();
  const wasEditing = React.useRef(false);

  React.useEffect(() => {
    if (editing) {
      map.pm.enableGlobalEditMode({ snappable: true });
      wasEditing.current = true;
    } else if (wasEditing.current) {
      const edited: GeoJSON.Feature[] = [];
      map.eachLayer((layer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feat = (layer as any).feature as GeoJSON.Feature | undefined;
        if (feat && "toGeoJSON" in layer) {
          edited.push((layer as L.GeoJSON).toGeoJSON() as GeoJSON.Feature);
        }
      });

      map.pm.disableGlobalEditMode();
      wasEditing.current = false;

      if (edited.length > 0) {
        onEdited(edited);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editing]);

  return null;
}

// ---------------------------------------------------------------------------
// Map toolbar — uses a real Leaflet Control so clicks work properly
// ---------------------------------------------------------------------------

const EDIT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 4-9 9H3v-4z"/><path d="M17.5 2.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const SAVE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

function makeBtn(icon: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = icon;
  Object.assign(btn.style, {
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    border: "2px solid rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
    color: "#333",
    cursor: "pointer",
    backgroundClip: "padding-box",
  } as CSSStyleDeclaration);
  return btn;
}

function MapToolbar({
  editing,
  dirty,
  saving,
  onToggleEdit,
  onSave,
}: {
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
}) {
  const map = useMap();
  const controlRef = React.useRef<L.Control | null>(null);
  const editBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const saveBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const callbacksRef = React.useRef({ onToggleEdit, onSave });

  React.useEffect(() => {
    callbacksRef.current = { onToggleEdit, onSave };
  }, [onToggleEdit, onSave]);

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

        const editBtn = makeBtn(EDIT_ICON);
        editBtn.title = "Edit vertices";
        editBtn.addEventListener("click", () => callbacksRef.current.onToggleEdit());
        editBtnRef.current = editBtn;

        const saveBtn = makeBtn(SAVE_ICON);
        saveBtn.title = "Save edits";
        saveBtn.addEventListener("click", () => callbacksRef.current.onSave());
        saveBtnRef.current = saveBtn;

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
    editBtn.style.backgroundColor = editing ? "#3b82f6" : "#fff";
    editBtn.style.color = editing ? "#fff" : "#333";
    editBtn.style.opacity = saving ? "0.5" : "1";
    editBtn.style.cursor = saving ? "not-allowed" : "pointer";
    editBtn.title = editing ? "Stop editing" : "Edit vertices";
    editBtn.disabled = saving;
  }, [editing, saving]);

  React.useEffect(() => {
    const saveBtn = saveBtnRef.current;
    if (!saveBtn) return;
    saveBtn.style.border = dirty ? "2px solid #f59e0b" : "2px solid rgba(0,0,0,0.2)";
    saveBtn.style.backgroundColor = dirty ? "#fbbf24" : "#fff";
    saveBtn.style.color = dirty ? "#78350f" : "#999";
    saveBtn.style.cursor = saving || !dirty ? "not-allowed" : "pointer";
    saveBtn.style.opacity = saving ? "0.5" : "1";
    saveBtn.style.animation = dirty ? "gis-pulse 2s ease-in-out infinite" : "none";
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

// Geoman marker overrides — injected once
const GEOMAN_CSS = `
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
  style.textContent = GEOMAN_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Main viewport
// ---------------------------------------------------------------------------

export function GisViewport({
  data,
  dataKey,
  editing,
  dirty,
  saving,
  onToggleEdit,
  onSave,
  onEdited,
}: {
  data: GeoJSONFeatureCollection | null;
  dataKey: string;
  editing: boolean;
  dirty: boolean;
  saving: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onEdited: (features: GeoJSON.Feature[]) => void;
}) {
  React.useEffect(() => injectGeomanCss(), []);

  const hasData = data && data.features.length > 0;

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      // eslint-disable-next-line template/no-jsx-style-prop -- full-size map
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer url={SATELLITE_URL} attribution={SATELLITE_ATTR} maxZoom={19} />
      <InvalidateSize />
      {hasData && (
        <>
          <GeoJSON
            key={dataKey}
            data={data as GeoJSON.FeatureCollection}
            // eslint-disable-next-line template/no-jsx-style-prop -- Leaflet path options, not CSS
            style={featureStyle}
            pointToLayer={(_feature, latlng) =>
              L.circleMarker(latlng, { ...featureStyle, radius: 5 })
            }
          />
          <FitBounds dataKey={dataKey} data={data} />
          <EditController editing={editing} onEdited={onEdited} />
        </>
      )}
      {hasData && (
        <MapToolbar
          editing={editing}
          dirty={dirty}
          saving={saving}
          onToggleEdit={onToggleEdit}
          onSave={onSave}
        />
      )}
    </MapContainer>
  );
}
