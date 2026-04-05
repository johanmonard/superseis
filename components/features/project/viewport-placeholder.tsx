"use client";

import * as React from "react";

/**
 * Rotating wireframe sphere shown when no country is selected
 * on the definition viewport.
 *
 * Longitude lines animate around the Y-axis (horizontal rotation).
 * Pure SVG + rAF — no external dependencies.
 */
export function ViewportPlaceholder() {
  const R = 80;
  const CX = 100;
  const CY = 100;
  const SIZE = 200;
  const DURATION = 20_000; // full revolution in ms

  const lats = [-60, -30, 0, 30, 60];
  const lonOffsets = [0, 30, 60, 90, 120, 150]; // base angles

  const [angle, setAngle] = React.useState(0);

  React.useEffect(() => {
    let start: number | null = null;
    let id: number;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      setAngle(((ts - start) / DURATION) * 360);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-[var(--space-6)]">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        fill="none"
        className="text-[var(--color-border-subtle)]"
      >
        {/* outer circle */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.5"
        />

        {/* latitude lines — static horizontal ellipses */}
        {lats.map((lat) => {
          const rad = (lat * Math.PI) / 180;
          const cy = CY - R * Math.sin(rad);
          const rx = R * Math.cos(rad);
          return (
            <ellipse
              key={`lat-${lat}`}
              cx={CX}
              cy={cy}
              rx={rx}
              ry={1}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.3"
            />
          );
        })}

        {/* longitude lines — vertical ellipses rotating around Y-axis */}
        {lonOffsets.map((base) => {
          const lon = ((base + angle) % 180) * (Math.PI / 180);
          const rx = Math.abs(R * Math.cos(lon));
          // opacity fades as the line approaches the edge
          const op = 0.15 + 0.35 * (1 - rx / R);
          return (
            <ellipse
              key={`lon-${base}`}
              cx={CX}
              cy={CY}
              rx={rx}
              ry={R}
              stroke="currentColor"
              strokeWidth="0.5"
              opacity={op}
            />
          );
        })}
      </svg>

      <span className="text-sm text-[var(--color-text-muted)]">
        Select a country
      </span>
    </div>
  );
}
