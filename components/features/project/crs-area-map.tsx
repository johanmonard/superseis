"use client";

import * as React from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Small static map that highlights a CRS's "area of use" bounding box on
 * top of a plain OSM raster basemap. Used inside the CRS info panel.
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

  React.useEffect(() => {
    if (!containerRef.current) return;
    const [w, s, e, n] = bounds;

    const polygons = makePolygons(w, s, e, n);
    const fitBounds: [[number, number], [number, number]] = [
      [Math.min(w, e) - (e > w ? 0 : 360), s],
      [Math.max(w, e), n],
    ];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
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
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: "area-outline",
        type: "line",
        source: "area",
        paint: { "line-color": "#3b82f6", "line-width": 2 },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bounds]);

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
