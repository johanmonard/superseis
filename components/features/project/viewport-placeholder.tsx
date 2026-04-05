"use client";

import * as React from "react";

/* ===================================================================
   Shared
   =================================================================== */

const SIZE = 200;
const CX = 100;
const CY = 100;
const R = 80;
const S = "currentColor";

function useAngle(ms: number) {
  const [angle, setAngle] = React.useState(0);
  React.useEffect(() => {
    let start: number | null = null;
    let id: number;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      setAngle(((ts - start) / ms) * 360);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ms]);
  return angle;
}

/* ===================================================================
   Globe — longitude lines sweep horizontally
   =================================================================== */

const LATS = [-60, -30, 0, 30, 60];
const LON_OFFSETS = [0, 30, 60, 90, 120, 150];

function Globe() {
  const angle = useAngle(20_000);
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      <circle cx={CX} cy={CY} r={R} stroke={S} strokeWidth="1.25" opacity="0.6" />
      {LATS.map((lat) => {
        const rad = (lat * Math.PI) / 180;
        return <ellipse key={lat} cx={CX} cy={CY - R * Math.sin(rad)} rx={R * Math.cos(rad)} ry={1} stroke={S} strokeWidth="0.8" opacity="0.45" />;
      })}
      {LON_OFFSETS.map((base) => {
        const lon = ((base + angle) % 180) * (Math.PI / 180);
        const rx = Math.abs(R * Math.cos(lon));
        return <ellipse key={base} cx={CX} cy={CY} rx={rx} ry={R} stroke={S} strokeWidth="0.8" opacity={0.25 + 0.45 * (1 - rx / R)} />;
      })}
    </svg>
  );
}

/* ===================================================================
   Constellation — twinkling stars with proximity lines
   =================================================================== */

const STARS = Array.from({ length: 30 }, (_, i) => {
  const a = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const b = Math.sin(i * 269.5 + 183.3) * 43758.5453;
  return {
    x: 15 + (a - Math.floor(a)) * 170,
    y: 15 + (b - Math.floor(b)) * 170,
    phase: (a - Math.floor(a)) * Math.PI * 2,
    speed: 0.5 + (b - Math.floor(b)) * 1.5,
  };
});

function Constellation() {
  const angle = useAngle(3_000);
  const t = (angle * Math.PI) / 180;
  const LINK = 55;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {STARS.map((s, i) =>
        STARS.slice(i + 1).map((s2, j) => {
          const d = Math.sqrt((s.x - s2.x) ** 2 + (s.y - s2.y) ** 2);
          if (d > LINK) return null;
          return <line key={`${i}-${j}`} x1={s.x} y1={s.y} x2={s2.x} y2={s2.y} stroke={S} strokeWidth="0.6" opacity={0.15 + 0.25 * (1 - d / LINK)} />;
        })
      )}
      {STARS.map((s, i) => {
        const tw = 0.4 + 0.4 * Math.sin(t * s.speed + s.phase);
        return <circle key={i} cx={s.x} cy={s.y} r={1.5 + tw * 2} fill={S} opacity={tw} />;
      })}
    </svg>
  );
}

/* ===================================================================
   Wave Mesh — 3D sine surface viewed at an angle
   =================================================================== */

function WaveMesh() {
  const angle = useAngle(7_000);
  const t = (angle * Math.PI) / 180;
  const COLS = 14, ROWS = 14, CELL = 12, AMP = 15;
  const tiltX = 0.7;
  const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);

  const grid: [number, number][][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c < COLS; c++) {
      const gx = (c - (COLS - 1) / 2) * CELL;
      const gz = (r - (ROWS - 1) / 2) * CELL;
      const dist = Math.sqrt(gx * gx + gz * gz);
      const gy = AMP * Math.sin(dist * 0.08 - t);
      const py = gy * cosX - gz * sinX;
      const pz = gy * sinX + gz * cosX;
      const scale = 400 / (400 + pz);
      row.push([CX + gx * scale, CY + py * scale]);
    }
    grid.push(row);
  }

  const lines: React.ReactNode[] = [];
  for (let r = 0; r < ROWS; r++) {
    lines.push(<polyline key={`r-${r}`} points={grid[r].map(([x, y]) => `${x},${y}`).join(" ")} stroke={S} strokeWidth="0.7" opacity="0.4" fill="none" />);
  }
  for (let c = 0; c < COLS; c++) {
    lines.push(<polyline key={`c-${c}`} points={grid.map((row) => `${row[c][0]},${row[c][1]}`).join(" ")} stroke={S} strokeWidth="0.7" opacity="0.4" fill="none" />);
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {lines}
    </svg>
  );
}

/* ===================================================================
   Public component
   =================================================================== */

const VARIANTS = { globe: Globe, constellation: Constellation, "wave-mesh": WaveMesh } as const;
export type ViewportPlaceholderVariant = keyof typeof VARIANTS;

export function ViewportPlaceholder({
  variant = "wave-mesh",
  message = "No data to display",
}: {
  variant?: ViewportPlaceholderVariant;
  message?: string;
} = {}) {
  const Animation = VARIANTS[variant];
  return (
    <div className="flex flex-col items-center gap-[var(--space-6)]">
      <Animation />
      <span className="text-sm text-[var(--color-text-muted)]">{message}</span>
    </div>
  );
}
