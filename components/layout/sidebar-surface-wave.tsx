"use client";

import * as React from "react";

/**
 * Continuously-animating Surface Wave (Rayleigh, retrograde particle motion).
 * Mirrors the wireframe in ``components/features/demo/wireframes-showcase``
 * but ticks on its own rAF loop — no hover gating — and is sized to match
 * the bottom actions row: full action-row width when expanded (5 small
 * buttons + 4 var(--space-1) gaps), one button-width when collapsed.
 * Cleans up the rAF on unmount.
 */
export function SidebarSurfaceWave({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
} = {}) {
  const [elapsed, setElapsed] = React.useState(0);

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

  const t = (elapsed / 4_000) * 2 * Math.PI;

  // Same geometry as the demo's SurfaceWave, in a 200×100 viewBox so the
  // bottom half (the particle field) carries the visual weight at sidebar
  // widths. Particle motion is identical: retrograde elliptical decay
  // with depth.
  const COLS = 20;
  const ROWS = 4;
  const GAP_X = 9;
  const GAP_Y = 12;
  const AMP_X = 3;
  const AMP_Y = 7;
  const SURFACE_Y = 18;
  const OX = 10;

  const stroke = "currentColor";

  // Match the bottom-actions row width. Each ghost-sm button renders as a
  // 16px icon plus var(--space-3) horizontal padding on each side, with
  // var(--space-1) gaps between buttons. Expanded: 5 buttons + 4 gaps.
  // Collapsed: a single button.
  const oneBtn = "(16px + 2 * var(--space-3))";
  const widthCss = isCollapsed
    ? `calc(${oneBtn})`
    : `calc(5 * ${oneBtn} + 4 * var(--space-1))`;

  return (
    <div className="flex w-full justify-center">
      <svg
        height="72"
        viewBox="0 0 200 80"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="text-[var(--color-text-muted)] opacity-60"
        // eslint-disable-next-line template/no-jsx-style-prop -- runtime token math
        style={{ width: widthCss }}
      >
      <line
        x1={5}
        y1={SURFACE_Y}
        x2={195}
        y2={SURFACE_Y}
        stroke={stroke}
        strokeWidth="0.5"
        opacity="0.2"
      />
      {Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          const baseX = OX + c * GAP_X;
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
