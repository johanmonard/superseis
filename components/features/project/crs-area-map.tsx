"use client";

import * as React from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const CARTO_DARK_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];
const ESRI_LIGHT_GRAY_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
];

function useIsDarkTheme() {
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute("data-theme-kind") === "dark");
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-kind"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

/**
 * Small static map that highlights a CRS's "area of use" bounding box on
 * top of a theme-aware raster basemap (CartoDB Dark in dark mode, Esri
 * Light Gray in light mode). Used inside the CRS info panel.
 *
 * Bounds are lon/lat; they may cross the antimeridian (west > east), in
 * which case we draw two rectangles so the outline remains continuous.
 */
export function CrsAreaMap({
  bounds,
}: {
  bounds: [number, number, number, number]; // [w, s, e, n]
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MLMap | null>(null);
  const isDark = useIsDarkTheme();

  React.useEffect(() => {
    if (!containerRef.current) return;
    const [w, s, e, n] = bounds;

    const polygons = makePolygons(w, s, e, n);
    const fitBounds: [[number, number], [number, number]] = [
      [Math.min(w, e) - (e > w ? 0 : 360), s],
      [Math.max(w, e), n],
    ];

    const tileTiles = isDark ? CARTO_DARK_TILES : ESRI_LIGHT_GRAY_TILES;
    const tileAttribution = isDark
      ? "© CARTO"
      : "Tiles © Esri";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: tileTiles,
            tileSize: 256,
            attribution: tileAttribution,
          },
        },
        layers: [{ id: "basemap", type: "raster", source: "basemap" }],
      },
      bounds: fitBounds,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      interactive: true,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const accent =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent")
        .trim() || "#3b82f6";

    map.on("load", () => {
      map.addSource("area", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: polygons.map((coords) => ({
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [coords] },
          })),
        },
      });
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "area",
        paint: { "fill-color": accent, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "area-outline",
        type: "line",
        source: "area",
        paint: {
          "line-color": accent,
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bounds, isDark]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function makePolygons(
  w: number,
  s: number,
  e: number,
  n: number,
): number[][][] {
  // Antimeridian-crossing box (w > e): split into two rectangles.
  if (w > e) {
    return [
      rect(w, s, 180, n),
      rect(-180, s, e, n),
    ];
  }
  return [rect(w, s, e, n)];
}

function rect(w: number, s: number, e: number, n: number): number[][] {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}
