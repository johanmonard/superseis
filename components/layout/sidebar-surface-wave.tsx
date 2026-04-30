"use client";

import * as React from "react";

/**
 * Continuously-animating Surface Wave (Rayleigh, retrograde particle motion).
 * Mirrors the wireframe in ``components/features/demo/wireframes-showcase``
 * but ticks on its own rAF loop — no hover gating — and spans the full
 * sidebar width.
 *
 * Coordinates are in raw pixels (no `viewBox` / `preserveAspectRatio`), so
 * particles stay perfectly circular regardless of how wide the SVG renders.
 * A `ResizeObserver` reports the actual rendered width and the column
 * count + spacing are derived from it — wider sidebar gets more columns at
 * the same density rather than the same columns stretched out.
 *
 * The `isCollapsed` prop is accepted but no longer affects sizing — kept
 * for call-site compatibility.
 */
export function SidebarSurfaceWave(_props: { isCollapsed?: boolean } = {}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [width, setWidth] = React.useState(200);

  React.useEffect(() => {
    let raf = 0;
    let lastTs: number | null = null;
    const tick = (ts: number) => {
      if (lastTs !== null) {
        setElapsed((prev) => prev + (ts - lastTs!));
      }
      lastTs = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Sync the column geometry to the SVG's actual rendered width. Using
  // `useLayoutEffect` for the initial measure avoids a one-frame flicker
  // where dots would otherwise be drawn at the default fallback width.
  React.useLayoutEffect(() => {
    if (!svgRef.current) return;
    setWidth(svgRef.current.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  const t = (elapsed / 4_000) * 2 * Math.PI;

  // All distances are in pixels now (no viewBox scaling).
  const HEIGHT = 72;
  const SURFACE_Y = 16;
  const ROWS = 4;
  const GAP_Y = 11;
  const AMP_X = 3;
  const AMP_Y = 6;
  const TARGET_GAP_X = 10; // desired px between columns
  const SIDE_PADDING = 8;
  const COLS = Math.max(
    6,
    Math.floor((width - 2 * SIDE_PADDING) / TARGET_GAP_X) + 1,
  );
  const GAP_X = (width - 2 * SIDE_PADDING) / Math.max(COLS - 1, 1);

  const stroke = "currentColor";

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        width="100%"
        height={HEIGHT}
        fill="none"
        aria-hidden="true"
        className="block text-[var(--color-text-muted)] opacity-60"
      >
        <line
          x1={4}
          y1={SURFACE_Y}
          x2={Math.max(width - 4, 4)}
          y2={SURFACE_Y}
          stroke={stroke}
          strokeWidth="0.5"
          opacity="0.2"
        />
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => {
            const baseX = SIDE_PADDING + c * GAP_X;
            const baseY = SURFACE_Y + r * GAP_Y + 8;
            const decay = Math.exp(-r * 0.5);
            const phase = t - c * 0.5;
            const dx = AMP_X * decay * Math.cos(phase);
            const dy = AMP_Y * decay * Math.sin(phase);
            const x = baseX + dx;
            const y = baseY + dy;
            return (
              <circle
                key={`${r}-${c}`}
                cx={x}
                cy={y}
                r={1.2 + decay * 1.2}
                fill={stroke}
                opacity={0.25 + decay * 0.35}
              />
            );
          }),
        )}
      </svg>
    </div>
  );
}
