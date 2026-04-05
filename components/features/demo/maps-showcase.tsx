/* eslint-disable template/no-jsx-style-prop -- SVG maps require inline styles for sizing and text styling */
"use client";

import { useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
  Annotation,
  ZoomableGroup,
} from "react-simple-maps";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-col items-start gap-[var(--space-1)]">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared geography style helpers                                     */
/* ------------------------------------------------------------------ */

const defaultGeoStyle = {
  default: { outline: "none" },
  hover: { outline: "none" },
  pressed: { outline: "none" },
};

/* ------------------------------------------------------------------ */
/*  1. Basic World Map                                                 */
/* ------------------------------------------------------------------ */

function BasicWorldMap() {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 120 }}
      width={800}
      height={400}
      style={{ width: "100%", height: "auto" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-border-subtle)"
              strokeWidth={0.5}
              style={defaultGeoStyle}
            />
          ))
        }
      </Geographies>
    </ComposableMap>
  );
}

/* ------------------------------------------------------------------ */
/*  2. Highlight on Hover                                              */
/* ------------------------------------------------------------------ */

function HoverHighlightMap() {
  const [hovered, setHovered] = useState("");

  return (
    <div>
      <p className="mb-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
        Hovered: <span className="font-medium text-[var(--color-text-primary)]">{hovered || "—"}</span>
      </p>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120 }}
        width={800}
        height={400}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={
                  geo.properties.name === hovered
                    ? "var(--color-accent)"
                    : "var(--color-bg-elevated)"
                }
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
                onMouseEnter={() => setHovered(geo.properties.name)}
                onMouseLeave={() => setHovered("")}
                style={{
                  default: { outline: "none", cursor: "pointer", transition: "fill 0.15s" },
                  hover: { outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3. Projections                                                     */
/* ------------------------------------------------------------------ */

type ProjectionName = "geoMercator" | "geoEqualEarth" | "geoOrthographic" | "geoAlbersUsa";

const PROJECTIONS: { name: ProjectionName; label: string; scale: number; rotate?: [number, number, number] }[] = [
  { name: "geoMercator", label: "Mercator", scale: 120 },
  { name: "geoEqualEarth", label: "Equal Earth", scale: 150 },
  { name: "geoOrthographic", label: "Orthographic (Globe)", scale: 250, rotate: [-10, -30, 0] },
  { name: "geoAlbersUsa", label: "Albers USA", scale: 900 },
];

function ProjectionsMap() {
  const [idx, setIdx] = useState(0);
  const proj = PROJECTIONS[idx];

  return (
    <div>
      <Field label="Projection" htmlFor="proj-select" layout="horizontal" className="mb-[var(--space-3)]">
        <Select id="proj-select" value={String(idx)} onChange={(e) => setIdx(Number(e.target.value))}>
          {PROJECTIONS.map((p, i) => (
            <option key={p.name} value={i}>{p.label}</option>
          ))}
        </Select>
      </Field>
      <ComposableMap
        projection={proj.name}
        projectionConfig={{ scale: proj.scale, rotate: proj.rotate }}
        width={800}
        height={450}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="var(--color-bg-elevated)"
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
                style={defaultGeoStyle}
              />
            ))
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  4. Markers                                                         */
/* ------------------------------------------------------------------ */

const CITIES = [
  { name: "New York", coordinates: [-74.006, 40.7128] as [number, number] },
  { name: "London", coordinates: [-0.1276, 51.5074] as [number, number] },
  { name: "Tokyo", coordinates: [139.6917, 35.6895] as [number, number] },
  { name: "Sydney", coordinates: [151.2093, -33.8688] as [number, number] },
  { name: "Dubai", coordinates: [55.2708, 25.2048] as [number, number] },
  { name: "São Paulo", coordinates: [-46.6333, -23.5505] as [number, number] },
  { name: "Lagos", coordinates: [3.3792, 6.5244] as [number, number] },
  { name: "Mumbai", coordinates: [72.8777, 19.076] as [number, number] },
];

function MarkersMap() {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 120 }}
      width={800}
      height={400}
      style={{ width: "100%", height: "auto" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-border-subtle)"
              strokeWidth={0.5}
              style={defaultGeoStyle}
            />
          ))
        }
      </Geographies>
      {CITIES.map(({ name, coordinates }) => (
        <Marker key={name} coordinates={coordinates}>
          <circle r={4} fill="var(--color-accent)" stroke="var(--color-bg-surface)" strokeWidth={1.5} />
          <text
            textAnchor="middle"
            y={-10}
            style={{
              fontFamily: "inherit",
              fontSize: 9,
              fill: "var(--color-text-secondary)",
              fontWeight: 500,
            }}
          >
            {name}
          </text>
        </Marker>
      ))}
    </ComposableMap>
  );
}

/* ------------------------------------------------------------------ */
/*  5. Lines (connections)                                             */
/* ------------------------------------------------------------------ */

const CONNECTIONS: { from: [number, number]; to: [number, number]; label: string }[] = [
  { from: [-74.006, 40.7128], to: [-0.1276, 51.5074], label: "NYC → London" },
  { from: [-0.1276, 51.5074], to: [55.2708, 25.2048], label: "London → Dubai" },
  { from: [55.2708, 25.2048], to: [139.6917, 35.6895], label: "Dubai → Tokyo" },
  { from: [139.6917, 35.6895], to: [151.2093, -33.8688], label: "Tokyo → Sydney" },
];

function LinesMap() {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 120 }}
      width={800}
      height={400}
      style={{ width: "100%", height: "auto" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-border-subtle)"
              strokeWidth={0.5}
              style={defaultGeoStyle}
            />
          ))
        }
      </Geographies>
      {CONNECTIONS.map((conn) => (
        <Line
          key={conn.label}
          from={conn.from}
          to={conn.to}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
      {[...CONNECTIONS.map((c) => c.from), CONNECTIONS[CONNECTIONS.length - 1].to].map(
        (coords, i) => (
          <Marker key={i} coordinates={coords}>
            <circle r={3} fill="var(--color-accent)" />
          </Marker>
        )
      )}
    </ComposableMap>
  );
}

/* ------------------------------------------------------------------ */
/*  6. Annotations                                                     */
/* ------------------------------------------------------------------ */

function AnnotationsMap() {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 120 }}
      width={800}
      height={400}
      style={{ width: "100%", height: "auto" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="var(--color-bg-elevated)"
              stroke="var(--color-border-subtle)"
              strokeWidth={0.5}
              style={defaultGeoStyle}
            />
          ))
        }
      </Geographies>
      <Annotation subject={[2.3522, 48.8566]} dx={-40} dy={-30} connectorProps={{ stroke: "var(--color-accent)", strokeWidth: 1.5 }}>
        <text style={{ fontSize: 10, fill: "var(--color-accent)", fontWeight: 600 }}>Paris</text>
      </Annotation>
      <Annotation subject={[37.6173, 55.7558]} dx={30} dy={-20} connectorProps={{ stroke: "var(--color-status-danger)", strokeWidth: 1.5 }}>
        <text style={{ fontSize: 10, fill: "var(--color-status-danger)", fontWeight: 600 }}>Moscow</text>
      </Annotation>
      <Annotation subject={[116.4074, 39.9042]} dx={40} dy={20} connectorProps={{ stroke: "var(--color-status-warning)", strokeWidth: 1.5 }}>
        <text style={{ fontSize: 10, fill: "var(--color-status-warning)", fontWeight: 600 }}>Beijing</text>
      </Annotation>
    </ComposableMap>
  );
}

/* ------------------------------------------------------------------ */
/*  7. Zoomable Map                                                    */
/* ------------------------------------------------------------------ */

function ZoomableMap() {
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [0, 20],
    zoom: 1,
  });

  return (
    <div>
      <div className="mb-[var(--space-2)] flex items-center gap-[var(--space-2)]">
        <Button variant="secondary" size="sm" onClick={() => setPosition((p) => ({ ...p, zoom: Math.min(p.zoom * 1.5, 8) }))}>
          Zoom In
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPosition((p) => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }))}>
          Zoom Out
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPosition({ coordinates: [0, 20], zoom: 1 })}>
          Reset
        </Button>
        <span className="text-xs text-[var(--color-text-muted)]">
          Zoom: {position.zoom.toFixed(1)}x — scroll or drag to navigate
        </span>
      </div>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120 }}
        width={800}
        height={400}
        style={{ width: "100%", height: "auto" }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={(pos) => setPosition(pos)}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="var(--color-bg-elevated)"
                  stroke="var(--color-border-subtle)"
                  strokeWidth={0.5}
                  style={defaultGeoStyle}
                />
              ))
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  8. Choropleth (data-driven fill)                                   */
/* ------------------------------------------------------------------ */

const POPULATION_DATA: Record<string, number> = {
  China: 1412,
  India: 1408,
  "United States of America": 333,
  Indonesia: 275,
  Pakistan: 230,
  Brazil: 215,
  Nigeria: 218,
  Bangladesh: 169,
  Russia: 146,
  Mexico: 128,
  Japan: 125,
  Ethiopia: 120,
  Philippines: 113,
  Egypt: 104,
  "Dem. Rep. Congo": 99,
  Vietnam: 98,
  Germany: 84,
  Turkey: 85,
  Iran: 87,
  Thailand: 72,
  France: 68,
  "United Kingdom": 67,
};

function getPopColor(population: number | undefined): string {
  if (!population) return "var(--color-bg-elevated)";
  if (population > 1000) return "var(--color-accent)";
  if (population > 200) return "color-mix(in srgb, var(--color-accent) 65%, transparent)";
  if (population > 100) return "color-mix(in srgb, var(--color-accent) 40%, transparent)";
  if (population > 50) return "color-mix(in srgb, var(--color-accent) 25%, transparent)";
  return "color-mix(in srgb, var(--color-accent) 12%, transparent)";
}

function ChoroplethMap() {
  const [hovered, setHovered] = useState("");
  const hoveredPop = POPULATION_DATA[hovered];

  return (
    <div>
      <p className="mb-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
        Population (millions):{" "}
        <span className="font-medium text-[var(--color-text-primary)]">
          {hovered ? `${hovered} — ${hoveredPop ?? "N/A"}M` : "Hover a country"}
        </span>
      </p>
      <div className="mb-[var(--space-2)] flex items-center gap-[var(--space-2)]">
        {[
          { label: "1B+", opacity: "100%" },
          { label: "200M+", opacity: "65%" },
          { label: "100M+", opacity: "40%" },
          { label: "50M+", opacity: "25%" },
          { label: "<50M", opacity: "12%" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ background: `color-mix(in srgb, var(--color-accent) ${item.opacity}, transparent)` }}
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">{item.label}</span>
          </div>
        ))}
      </div>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120 }}
        width={800}
        height={400}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const pop = POPULATION_DATA[geo.properties.name];
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getPopColor(pop)}
                  stroke="var(--color-border-subtle)"
                  strokeWidth={0.5}
                  onMouseEnter={() => setHovered(geo.properties.name)}
                  onMouseLeave={() => setHovered("")}
                  style={{
                    default: { outline: "none", cursor: "pointer" },
                    hover: { outline: "none", opacity: 0.85 },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  9. Rotating Globe                                                  */
/* ------------------------------------------------------------------ */

function RotatingGlobe() {
  const [rotation, setRotation] = useState<[number, number, number]>([-10, -30, 0]);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const SENSITIVITY = 0.4;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
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

  return (
    <div>
      <p className="mb-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
        Click and drag to rotate the globe in any direction. Use sliders for precise control.
      </p>
      <div className="mb-[var(--space-2)] flex gap-[var(--space-4)]">
        <Field label="Longitude" htmlFor="globe-lon" layout="horizontal" className="flex-1">
          <Slider
            id="globe-lon"
            min={-180}
            max={180}
            step={1}
            value={[rotation[0]]}
            onValueChange={([v]) => setRotation([v, rotation[1], 0])}
          />
        </Field>
        <Field label="Latitude" htmlFor="globe-lat" layout="horizontal" className="flex-1">
          <Slider
            id="globe-lat"
            min={-90}
            max={90}
            step={1}
            value={[rotation[1]]}
            onValueChange={([v]) => setRotation([rotation[0], v, 0])}
          />
        </Field>
      </div>
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ scale: 250, rotate: rotation }}
        width={800}
        height={500}
        style={{ width: "100%", height: "auto", cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <circle cx={400} cy={250} r={250} fill="var(--color-bg-canvas)" stroke="var(--color-border-subtle)" />
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="var(--color-bg-elevated)"
                stroke="var(--color-border-subtle)"
                strokeWidth={0.5}
                style={defaultGeoStyle}
              />
            ))
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Showcase                                                      */
/* ------------------------------------------------------------------ */

export function MapsShowcase() {
  return (
    <div className="space-y-[var(--space-4)]">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
          react-simple-maps
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          SVG map rendering with D3 geo projections and Natural Earth TopoJSON data.
        </p>
      </div>

      <Section title="Basic World Map" description="Minimal map with country boundaries using geoMercator projection.">
        <BasicWorldMap />
      </Section>

      <Section title="Hover Highlight" description="Interactive country detection on mouse hover with accent fill.">
        <HoverHighlightMap />
      </Section>

      <Section title="Projections" description="Switch between Mercator, Equal Earth, Orthographic (globe), and Albers USA.">
        <ProjectionsMap />
      </Section>

      <Section title="Markers" description="Place labeled dot markers at geographic coordinates (major cities).">
        <MarkersMap />
      </Section>

      <Section title="Lines (Connections)" description="Draw great-circle arcs between coordinate pairs.">
        <LinesMap />
      </Section>

      <Section title="Annotations" description="Callout labels with connector lines pointing to map locations.">
        <AnnotationsMap />
      </Section>

      <Section title="Zoomable Map" description="Pan and zoom with ZoomableGroup — use scroll wheel or buttons.">
        <ZoomableMap />
      </Section>

      <Section title="Choropleth" description="Data-driven country fills. Shows population density with accent color intensity.">
        <ChoroplethMap />
      </Section>

      <Section title="Rotating Globe" description="Orthographic projection with adjustable longitude/latitude rotation.">
        <RotatingGlobe />
      </Section>
    </div>
  );
}
