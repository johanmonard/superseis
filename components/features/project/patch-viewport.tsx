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

  // Bounding rect for the patch area
  const bx = offsetX;
  const by = offsetY;
  const bw = recLineLength;
  const bh = geo.recPatchHeight;

  return { recLines, recPoints, srcLine, srcPoints, bounds: { x: bx, y: by, w: bw, h: bh } };
}

/* ------------------------------------------------------------------ */
/*  Patch rendering                                                    */
/* ------------------------------------------------------------------ */

function PatchGroup({
  patch,
  rpRadius,
  spRadius,
  opacity,
  rpColor,
  spColor,
  lineColor,
  lineWidth,
}: {
  patch: ReturnType<typeof buildPatch>;
  rpRadius: number;
  spRadius: number;
  opacity: number;
  rpColor: string;
  spColor: string;
  lineColor: string;
  lineWidth: number;
}) {
  return (
    <g opacity={opacity}>
      {/* Patch area fill */}
      <rect
        x={patch.bounds.x} y={patch.bounds.y}
        width={patch.bounds.w} height={patch.bounds.h}
        fill={rpColor} opacity={0.06}
      />

      {/* Receiver lines */}
      {patch.recLines.map((l, i) => (
        <line key={`rl-${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={lineColor} strokeWidth={lineWidth} />
      ))}

      {/* Source line */}
      <line
        x1={patch.srcLine.x} y1={patch.srcLine.y1}
        x2={patch.srcLine.x} y2={patch.srcLine.y2}
        stroke={lineColor} strokeWidth={lineWidth}
      />

      {/* Receiver points */}
      {patch.recPoints.map((pt, i) => (
        <rect key={`rp-${i}`} x={pt.x - rpRadius} y={pt.y - rpRadius} width={rpRadius * 2} height={rpRadius * 2} fill={rpColor} />
      ))}

      {/* Source points */}
      {patch.srcPoints.map((pt, i) => (
        <rect key={`sp-${i}`} x={pt.x - spRadius} y={pt.y - spRadius} width={spRadius * 2} height={spRadius * 2} fill={spColor} />
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

  // Compute base bounding box of both patches (including source lines that
  // may extend beyond the receiver patch area)
  const allX = [
    patch1.bounds.x, patch1.bounds.x + patch1.bounds.w,
    patch2.bounds.x, patch2.bounds.x + patch2.bounds.w,
    patch1.srcLine.x, patch2.srcLine.x,
  ];
  const allY = [
    patch1.bounds.y, patch1.bounds.y + patch1.bounds.h,
    patch2.bounds.y, patch2.bounds.y + patch2.bounds.h,
    patch1.srcLine.y1, patch1.srcLine.y2,
    patch2.srcLine.y1, patch2.srcLine.y2,
  ];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);

  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;

  // Base viewBox (fit-all with padding, matched to container aspect ratio)
  const padding = 0.15;
  const padW = contentW * padding;
  const padH = contentH * padding;
  let baseVbW = contentW + padW * 2;
  let baseVbH = contentH + padH * 2;

  // Expand the viewBox to match the container aspect ratio so
  // the content fills both the horizontal and vertical extent.
  const containerAR = size.w / (size.h || 1);
  const contentAR = baseVbW / (baseVbH || 1);
  if (containerAR > contentAR) {
    baseVbW = baseVbH * containerAR;
  } else {
    baseVbH = baseVbW / containerAR;
  }

  const baseVbX = (minX + maxX) / 2 - baseVbW / 2;
  const baseVbY = (minY + maxY) / 2 - baseVbH / 2;

  // Apply zoom and pan to viewBox
  const baseCx = baseVbX + baseVbW / 2;
  const baseCy = baseVbY + baseVbH / 2;
  const vbW = baseVbW / zoom;
  const vbH = baseVbH / zoom;
  const vbX = baseCx - vbW / 2 + pan.x;
  const vbY = baseCy - vbH / 2 + pan.y;

  // Scale marker sizes — capped so dots never overlap
  const baseScale = Math.min(baseVbW, baseVbH);
  const minInterval = Math.min(p.rpi, p.rli, p.spi);
  const maxDotR = minInterval * 0.35;
  const baseRecSize = Math.min(baseScale * 0.012, maxDotR);
  const baseSrcRadius = Math.min(baseScale * 0.007, maxDotR);


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
        {/* Patch 2 (behind) — accent/highlight color */}
        <PatchGroup
          patch={patch2}
          rpRadius={baseRecSize * 0.55}
          spRadius={baseSrcRadius * 0.6}
          opacity={0.5}
          rpColor="var(--color-accent)"
          spColor="var(--color-accent)"
          lineColor="var(--color-accent)"
          lineWidth={baseRecSize * 0.15}
        />

        {/* Patch 1 (on top) — muted/base color */}
        <PatchGroup
          patch={patch1}
          rpRadius={baseRecSize * 0.5}
          spRadius={baseSrcRadius * 0.55}
          opacity={0.7}
          rpColor="var(--color-text-muted)"
          spColor="var(--color-text-muted)"
          lineColor="var(--color-text-muted)"
          lineWidth={baseRecSize * 0.15}
        />
      </svg>
    </div>
  );
}
