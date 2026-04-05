/* eslint-disable template/no-jsx-style-prop -- SVG patch diagram requires inline styles for runtime sizing */
"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

const { compass: Compass } = appIcons;

const ZOOM_FACTOR = 1.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 20;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PatchParams {
  rpi: number;
  rli: number;
  spi: number;
  sli: number;
  activeRl: number;
  activeRp: number;
  spSalvo: number;
  roll: number;
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function computeGeometry(p: PatchParams) {
  const recLineLength = (p.activeRp - 1) * p.rpi;
  const recPatchHeight = (p.activeRl - 1) * p.rli;
  const salvoLength = (p.spSalvo - 1) * p.spi;
  const centerX = recLineLength / 2;
  const centerY = recPatchHeight / 2;
  return { recLineLength, recPatchHeight, salvoLength, centerX, centerY };
}

function buildPatch(
  p: PatchParams,
  offsetX: number,
  offsetY: number,
  geo: ReturnType<typeof computeGeometry>
) {
  const { recLineLength, salvoLength, centerX, centerY } = geo;

  // Receiver lines
  const recLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < p.activeRl; i++) {
    const y = offsetY + i * p.rli;
    recLines.push({ x1: offsetX, y1: y, x2: offsetX + recLineLength, y2: y });
  }

  // Receiver points
  const recPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < p.activeRl; i++) {
    for (let j = 0; j < p.activeRp; j++) {
      recPoints.push({ x: offsetX + j * p.rpi, y: offsetY + i * p.rli });
    }
  }

  // Source line (vertical, centered)
  const sx = offsetX + centerX;
  const syStart = offsetY + centerY - salvoLength / 2;
  const syEnd = offsetY + centerY + salvoLength / 2;
  const srcLine = { x: sx, y1: syStart, y2: syEnd };

  // Source points
  const srcPoints: { x: number; y: number }[] = [];
  for (let k = 0; k < p.spSalvo; k++) {
    srcPoints.push({ x: sx, y: syStart + k * p.spi });
  }

  return { recLines, recPoints, srcLine, srcPoints };
}

/* ------------------------------------------------------------------ */
/*  Patch rendering                                                    */
/* ------------------------------------------------------------------ */

function PatchGroup({
  patch,
  recSize,
  srcRadius,
  opacity,
  recColor,
  srcColor,
  lineColor,
}: {
  patch: ReturnType<typeof buildPatch>;
  recSize: number;
  srcRadius: number;
  opacity: number;
  recColor: string;
  srcColor: string;
  lineColor: string;
}) {
  return (
    <g opacity={opacity}>
      {/* Receiver lines */}
      {patch.recLines.map((l, i) => (
        <line
          key={`rl-${i}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={lineColor}
          strokeWidth={0.5}
        />
      ))}
      {/* Source line */}
      <line
        x1={patch.srcLine.x}
        y1={patch.srcLine.y1}
        x2={patch.srcLine.x}
        y2={patch.srcLine.y2}
        stroke={srcColor}
        strokeWidth={0.8}
      />
      {/* Receiver points (squares) */}
      {patch.recPoints.map((pt, i) => (
        <rect
          key={`rp-${i}`}
          x={pt.x - recSize / 2}
          y={pt.y - recSize / 2}
          width={recSize}
          height={recSize}
          fill={recColor}
        />
      ))}
      {/* Source points (circles) */}
      {patch.srcPoints.map((pt, i) => (
        <circle
          key={`sp-${i}`}
          cx={pt.x}
          cy={pt.y}
          r={srcRadius}
          fill={srcColor}
        />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PatchViewport({ params }: { params: PatchParams }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ w: 600, h: 400 });

  // Zoom & pan state
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const dragging = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Parse and clamp params
  const p: PatchParams = {
    rpi: Math.max(params.rpi, 1),
    rli: Math.max(params.rli, 1),
    spi: Math.max(params.spi, 1),
    sli: Math.max(params.sli, 1),
    activeRl: Math.max(params.activeRl, 1),
    activeRp: Math.max(params.activeRp, 1),
    spSalvo: Math.max(params.spSalvo, 1),
    roll: params.roll,
  };

  const geo = computeGeometry(p);

  // Patch offsets
  const offset2 = { x: p.sli, y: -p.roll * p.rli };

  const patch1 = buildPatch(p, 0, 0, geo);
  const patch2 = buildPatch(p, offset2.x, offset2.y, geo);

  // Compute base bounding box of both patches
  const allX = [0, geo.recLineLength, offset2.x, offset2.x + geo.recLineLength];
  const allY = [0, geo.recPatchHeight, offset2.y, offset2.y + geo.recPatchHeight];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;

  // Base viewBox (fit-all with padding)
  const padding = 0.1;
  const padW = contentW * padding;
  const padH = contentH * padding;
  const baseVbX = minX - padW;
  const baseVbY = minY - padH;
  const baseVbW = contentW + padW * 2;
  const baseVbH = contentH + padH * 2;

  // Apply zoom and pan to viewBox
  const baseCx = baseVbX + baseVbW / 2;
  const baseCy = baseVbY + baseVbH / 2;
  const vbW = baseVbW / zoom;
  const vbH = baseVbH / zoom;
  const vbX = baseCx - vbW / 2 + pan.x;
  const vbY = baseCy - vbH / 2 + pan.y;

  // Scale marker sizes relative to base (not zoomed) viewport
  const baseScale = Math.min(baseVbW, baseVbH);
  const baseRecSize = baseScale * 0.008;
  const baseSrcRadius = baseScale * 0.005;

  // Grid lines extending across current viewBox
  const gridLines: React.ReactNode[] = [];
  if (p.sli > 0) {
    const startX = Math.floor(vbX / p.sli) * p.sli;
    for (let x = startX; x <= vbX + vbW; x += p.sli) {
      gridLines.push(
        <line
          key={`gv-${x}`}
          x1={x} y1={vbY} x2={x} y2={vbY + vbH}
          stroke="var(--color-border-subtle)"
          strokeWidth={0.3}
          strokeDasharray={`${baseScale * 0.003} ${baseScale * 0.006}`}
        />
      );
    }
  }
  if (p.rli > 0) {
    const startY = Math.floor(vbY / p.rli) * p.rli;
    for (let y = startY; y <= vbY + vbH; y += p.rli) {
      gridLines.push(
        <line
          key={`gh-${y}`}
          x1={vbX} y1={y} x2={vbX + vbW} y2={y}
          stroke="var(--color-border-subtle)"
          strokeWidth={0.3}
          strokeDasharray={`${baseScale * 0.003} ${baseScale * 0.006}`}
        />
      );
    }
  }

  // Zoom via mouse wheel
  const handleWheel = React.useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      setZoom((prev) => {
        const next = e.deltaY < 0 ? prev * ZOOM_FACTOR : prev / ZOOM_FACTOR;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    },
    []
  );

  // Pan via drag
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
    // Convert screen px to SVG units
    const svgDx = -(dx / size.w) * vbW;
    const svgDy = -(dy / size.h) * vbH;
    setPan((prev) => ({ x: prev.x + svgDx, y: prev.y + svgDy }));
  };

  const handlePointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  // Recenter: reset zoom and pan
  const handleRecenter = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute bottom-[var(--space-3)] left-[var(--space-3)] z-10 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        aria-label="Re-center view"
        title="Re-center and reset zoom"
      >
        <Compass size={14} />
      </button>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: "100%",
          height: "100%",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Background grid */}
        {gridLines}

        {/* Patch 2 (behind) — slightly larger markers */}
        <PatchGroup
          patch={patch2}
          recSize={baseRecSize * 1.35}
          srcRadius={baseSrcRadius * 1.15}
          opacity={0.5}
          recColor="var(--color-accent)"
          srcColor="var(--color-status-warning)"
          lineColor="var(--color-border-strong)"
        />

        {/* Patch 1 (on top) */}
        <PatchGroup
          patch={patch1}
          recSize={baseRecSize}
          srcRadius={baseSrcRadius}
          opacity={1}
          recColor="var(--color-accent)"
          srcColor="var(--color-status-warning)"
          lineColor="var(--color-border-strong)"
        />
      </svg>
    </div>
  );
}
