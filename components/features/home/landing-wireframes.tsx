"use client";

import * as React from "react";

const SIZE = 200;
const CX = 100;
const CY = 100;
const STROKE = "currentColor";

const ElapsedContext = React.createContext(0);

export function AnimationLoop({ children }: { children: React.ReactNode }) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    const tick = (ts: number) => {
      if (last !== null) setElapsed((prev) => prev + (ts - last!));
      last = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <ElapsedContext.Provider value={elapsed}>{children}</ElapsedContext.Provider>
  );
}

function useAngle(durationMs: number) {
  const elapsed = React.useContext(ElapsedContext);
  return (elapsed / durationMs) * 360;
}

export function SpinningCube() {
  const angle = useAngle(12_000);
  const a = (angle * Math.PI) / 180;
  const S = 50;

  const verts = [
    [-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S],
    [-S, -S, S], [S, -S, S], [S, S, S], [-S, S, S],
  ];

  const cosA = Math.cos(a), sinA = Math.sin(a);
  const proj = verts.map(([x, y, z]) => {
    const rx = x * cosA - z * sinA;
    const rz = x * sinA + z * cosA;
    const scale = 300 / (300 + rz);
    return [CX + rx * scale, CY + y * scale, rz] as const;
  });

  const edges = [
    [0,1],[1,2],[2,3],[3,0],
    [4,5],[5,6],[6,7],[7,4],
    [0,4],[1,5],[2,6],[3,7],
  ];

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        const depthT = (avgZ + S) / (2 * S); // 0 = front, 1 = back
        const op = 0.3 + 0.45 * depthT;
        const sw = 2.4 - 1.8 * depthT; // thicker on the near face
        return (
          <line key={i} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth={sw} opacity={op} />
        );
      })}
      {proj.map(([x, y, z], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={STROKE} opacity={0.4 + 0.35 * ((z + S) / (2 * S))} />
      ))}
    </svg>
  );
}

export function PendulumWave() {
  const angle = useAngle(8_000);
  const t = (angle * Math.PI) / 180;
  const COUNT = 15;
  const PIVOT_Y = 20;
  const LENGTH = 70;
  const SPACING = (SIZE - 20) / (COUNT + 1);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      <g transform="translate(0, 45)">
        <line x1={10} y1={PIVOT_Y} x2={190} y2={PIVOT_Y} stroke={STROKE} strokeWidth="1" opacity="0.3" />
        {Array.from({ length: COUNT }, (_, i) => {
          const px = 10 + SPACING * (i + 1);
          const freq = 1 + i * 0.12;
          const swing = Math.sin(t * freq) * 0.6;
          const bx = px + LENGTH * Math.sin(swing);
          const by = PIVOT_Y + LENGTH * Math.cos(swing);
          return (
            <React.Fragment key={i}>
              <line x1={px} y1={PIVOT_Y} x2={bx} y2={by} stroke={STROKE} strokeWidth="0.8" opacity="0.4" />
              <circle cx={bx} cy={by} r={4} fill={STROKE} opacity="0.6" />
            </React.Fragment>
          );
        })}
      </g>
    </svg>
  );
}

export function FractalTree() {
  const angle = useAngle(5_000);
  const t = (angle * Math.PI) / 180;

  const branches: React.ReactNode[] = [];
  let key = 0;

  const draw = (x: number, y: number, len: number, a: number, depth: number) => {
    if (depth > 8 || len < 4) return;
    const sway = Math.sin(t + depth * 0.5) * 0.08 * depth;
    const endA = a + sway;
    const ex = x + len * Math.sin(endA);
    const ey = y - len * Math.cos(endA);
    const op = 0.3 + 0.4 * (1 - depth / 9);
    const sw = Math.max(0.5, 2.5 - depth * 0.25);
    branches.push(<line key={key++} x1={x} y1={y} x2={ex} y2={ey} stroke={STROKE} strokeWidth={sw} opacity={op} />);
    if (depth >= 6) {
      branches.push(<circle key={key++} cx={ex} cy={ey} r={1.5} fill={STROKE} opacity="0.35" />);
    }
    draw(ex, ey, len * 0.72, endA - 0.45, depth + 1);
    draw(ex, ey, len * 0.72, endA + 0.45, depth + 1);
  };

  draw(CX, 190, 40, 0, 0);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      <g transform="translate(0, -20)">{branches}</g>
    </svg>
  );
}

export function WaveMesh() {
  const angle = useAngle(5_385);
  const t = (angle * Math.PI) / 180;
  const COLS = 14;
  const ROWS = 14;
  const CELL = 12;
  const AMP = 15;
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
    const pts = grid[r].map(([x, y]) => `${x},${y}`).join(" ");
    lines.push(<polyline key={`r-${r}`} points={pts} stroke={STROKE} strokeWidth="0.7" opacity="0.4" fill="none" />);
  }
  for (let c = 0; c < COLS; c++) {
    const pts = grid.map((row) => `${row[c][0]},${row[c][1]}`).join(" ");
    lines.push(<polyline key={`c-${c}`} points={pts} stroke={STROKE} strokeWidth="0.7" opacity="0.4" fill="none" />);
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      {lines}
    </svg>
  );
}
