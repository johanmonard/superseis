/* eslint-disable template/no-jsx-style-prop -- SVG globe requires inline styles for runtime sizing and geo styling */
"use client";

import * as React from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { appIcons } from "@/components/ui/icon";

const { compass: Compass } = appIcons;

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const NAME_OVERRIDES: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia and Herz.",
  "Congo": "Dem. Rep. Congo",
  "Czech Republic": "Czechia",
  "Myanmar": "Myanmar",
  "North Korea": "North Korea",
  "Papua New Guinea": "Papua New Guinea",
  "Russia": "Russia",
  "South Korea": "South Korea",
  "Sri Lanka": "Sri Lanka",
  "Trinidad and Tobago": "Trinidad and Tobago",
  "UAE": "United Arab Emirates",
  "UK": "United Kingdom",
  "United States": "United States of America",
};

function getGeoName(appName: string): string {
  return NAME_OVERRIDES[appName] ?? appName;
}

const SENSITIVITY = 0.4;
const VIEWBOX = 500;
const SCALE_RATIO = 0.46; // globe radius relative to viewBox
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_FACTOR = 1.15;

interface CountryMapProps {
  country: string;
  /** Optional CRS area-of-use bounds [west, south, east, north] in degrees. */
  crsBounds?: [number, number, number, number] | null;
}

/** Densify a lat/lon edge so it follows the globe's curvature cleanly. */
function densifyEdge(
  a: [number, number],
  b: [number, number],
  steps = 40,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return pts;
}

function boundsRing(
  w: number,
  s: number,
  e: number,
  n: number,
): [number, number][] {
  // d3-geo / GeoJSON RFC 7946: exterior ring walks so the interior stays on
  // the LEFT. On the sphere, that means clockwise when viewed on a standard
  // north-up map (SW → NW → NE → SE → SW). Going CCW would make the ring
  // enclose the *complement* — i.e. everything except the strip — which in
  // orthographic projection shows up as a filled hemisphere with the strip
  // punched out.
  return [
    ...densifyEdge([w, s], [w, n]),
    ...densifyEdge([w, n], [e, n]).slice(1),
    ...densifyEdge([e, n], [e, s]).slice(1),
    ...densifyEdge([e, s], [w, s]).slice(1),
  ];
}

function crsBoundsGeoJson(
  bounds: [number, number, number, number],
): GeoJSON.FeatureCollection {
  const [w, s, e, n] = bounds;
  const rings: [number, number][][] = [];
  // Antimeridian split — w > e means the box wraps around 180°.
  if (w > e) {
    rings.push(boundsRing(w, s, 180, n));
    rings.push(boundsRing(-180, s, e, n));
  } else {
    rings.push(boundsRing(w, s, e, n));
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { __crsBounds: true },
        geometry: {
          type: "MultiPolygon",
          coordinates: rings.map((r) => [r]),
        },
      },
    ],
  };
}

export function CountryMap({ country, crsBounds }: CountryMapProps) {
  const targetName = getGeoName(country);
  const [rotation, setRotation] = React.useState<[number, number, number]>([0, 0, 0]);
  const [initialized, setInitialized] = React.useState(false);
  const [hovered, setHovered] = React.useState("");
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState(VIEWBOX);
  const centeredRotation = React.useRef<[number, number, number]>([0, 0, 0]);
  const animFrame = React.useRef(0);
  const [zoom, setZoom] = React.useState(1);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragging = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });
  const rotationRef = React.useRef(rotation);
  const zoomRef = React.useRef(zoom);

  React.useEffect(() => {
    rotationRef.current = rotation;
    zoomRef.current = zoom;
  }, [rotation, zoom]);

  // Smooth animated rotation (and optional zoom) to a target
  const animateTo = React.useCallback((target: [number, number, number], targetZoom?: number) => {
    cancelAnimationFrame(animFrame.current);
    const duration = 1000;
    let start: number | null = null;
    const from = [...rotationRef.current] as [number, number, number];
    const fromZoom = zoomRef.current;

    // Normalize longitude difference to shortest path
    let dLon = target[0] - from[0];
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;

    const step = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      // ease-out quintic — strong deceleration at the end
      const ease = 1 - Math.pow(1 - t, 5);
      setRotation([
        from[0] + dLon * ease,
        from[1] + (target[1] - from[1]) * ease,
        0,
      ]);
      if (targetZoom !== undefined) {
        setZoom(fromZoom + (targetZoom - fromZoom) * ease);
      }
      if (t < 1) {
        animFrame.current = requestAnimationFrame(step);
      }
    };
    animFrame.current = requestAnimationFrame(step);
  }, []);

  // Measure container and fit globe to it
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize(Math.min(width, height));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const globeRadius = size * SCALE_RATIO * zoom;

  const [geoData, setGeoData] = React.useState<{ properties: { name: string }; type: string; geometry: GeoJSON.Geometry }[] | null>(null);

  // Process geo data once available
  React.useEffect(() => {
    if (initialized || !geoData) return;
    const target = geoData.find((g) => g.properties.name === targetName);
    if (target) {
      const [lon, lat] = geoCentroid(target as GeoJSON.Feature);
      const rot: [number, number, number] = [-lon, -lat, 0];
      centeredRotation.current = rot;
      animateTo(rot);
    }
    setInitialized(true);
  }, [initialized, targetName, geoData, animateTo]);

  const prevCountry = React.useRef(country);
  React.useEffect(() => {
    if (country !== prevCountry.current) {
      prevCountry.current = country;
      setInitialized(false);
    }
  }, [country]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    cancelAnimationFrame(animFrame.current);
    dragging.current = true;
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setRotation((prev) => [
      prev[0] + dx * SENSITIVITY,
      Math.max(-90, Math.min(90, prev[1] - dy * SENSITIVITY)),
      0,
    ]);
  };

  const handlePointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  const handleWheel = React.useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((prev) => {
      const next = e.deltaY < 0 ? prev * ZOOM_FACTOR : prev / ZOOM_FACTOR;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  }, []);

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center"
      onMouseMove={handleContainerMouseMove}
    >
      {hovered && (
        <div
          className="pointer-events-none absolute z-20 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-[0_2px_6px_var(--color-shadow-alpha)]"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 28 }}
        >
          {hovered}
        </div>
      )}
      <button
        type="button"
        onClick={() => animateTo(centeredRotation.current, MIN_ZOOM)}
        className="absolute bottom-[var(--space-3)] left-[var(--space-3)] z-10 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        aria-label="Re-center globe"
        title="Re-center on country"
      >
        <Compass size={14} />
      </button>
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ scale: globeRadius, rotate: rotation }}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={globeRadius}
          fill="var(--color-bg-elevated)"
          stroke="var(--color-border-subtle)"
        />
        <Geographies geography={GEO_URL}>
          {({ geographies }) => {
            if (!initialized && !geoData) {
              // Schedule state update outside of render
              queueMicrotask(() => setGeoData(geographies));
            }
            return geographies.map((geo) => {
              const name = geo.properties.name;
              const isSelected = name === targetName;
              const isHovered = !isSelected && name === hovered;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={
                    isSelected
                      ? "var(--color-accent)"
                      : isHovered
                        ? "color-mix(in srgb, var(--color-accent) 30%, transparent)"
                        : "color-mix(in srgb, var(--color-accent) 8%, var(--color-bg-canvas))"
                  }
                  stroke="var(--color-border-strong)"
                  strokeWidth={0.5}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered("")}
                  style={{
                    default: { outline: "none", transition: "fill 0.15s" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            });
          }}
        </Geographies>

        {/* CRS area-of-use boundary overlay */}
        {crsBounds && (
          <Geographies geography={crsBoundsGeoJson(crsBounds)}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  style={{
                    default: { outline: "none", pointerEvents: "none" },
                    hover: { outline: "none", pointerEvents: "none" },
                    pressed: { outline: "none", pointerEvents: "none" },
                  }}
                />
              ))
            }
          </Geographies>
        )}
      </ComposableMap>
    </div>
  );
}
