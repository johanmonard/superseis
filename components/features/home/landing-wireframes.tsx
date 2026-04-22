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
  const elapsed = React.useContext(ElapsedContext);
  const angle = (elapsed / 12_000) * 360;
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

  // Gentle drift of the cloud so it feels alive rather than static.
  const driftX = Math.sin(elapsed / 2400) * 3;
  const driftY = Math.cos(elapsed / 2900) * 2;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      <defs>
        <radialGradient id="cube-cloud-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.9" />
          <stop offset="55%" stopColor="var(--color-accent)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="cube-cloud-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="14" />
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {/* Back half of the cube wireframe — rendered beneath the cloud so
          edges whose midpoint is on the far side of the cube centre (incl.
          the two short vertical bars at the back after perspective) appear
          behind the cloud. */}
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        if (avgZ <= 0) return null;
        const depthT = (avgZ + S) / (2 * S);
        const op = 0.3 + 0.45 * depthT;
        const sw = 2.4 - 1.8 * depthT;
        return (
          <line key={`b-${i}`} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth={sw} opacity={op} />
        );
      })}
      {proj.map(([x, y, z], i) =>
        z > 0 ? (
          <circle key={`bv-${i}`} cx={x} cy={y} r={2.5} fill={STROKE} opacity={0.4 + 0.35 * ((z + S) / (2 * S))} />
        ) : null,
      )}
      <g
        className="opacity-0 transition-opacity duration-[1400ms] ease-out group-hover:opacity-100"
        transform={`translate(${driftX} ${driftY})`}
      >
        <ellipse
          cx={CX}
          cy={CY}
          rx={30}
          ry={24}
          fill="url(#cube-cloud-grad)"
          filter="url(#cube-cloud-filter)"
        />
      </g>
      {/* Front half — renders over the cloud so the two tall (near) vertical
          bars and any edges on the viewer-facing side of the cube sit on top. */}
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        if (avgZ > 0) return null;
        const depthT = (avgZ + S) / (2 * S);
        const op = 0.3 + 0.45 * depthT;
        const sw = 2.4 - 1.8 * depthT;
        return (
          <line key={`f-${i}`} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth={sw} opacity={op} />
        );
      })}
      {proj.map(([x, y, z], i) =>
        z <= 0 ? (
          <circle key={`fv-${i}`} cx={x} cy={y} r={2.5} fill={STROKE} opacity={0.4 + 0.35 * ((z + S) / (2 * S))} />
        ) : null,
      )}
    </svg>
  );
}

const PENDULUM_COUNT = 15;

const PendulumHighlightContext = React.createContext<number | null>(null);

export function PendulumHighlightProvider({
  index,
  children,
}: {
  index: number | null;
  children: React.ReactNode;
}) {
  const normalized =
    index == null ? null : ((index % PENDULUM_COUNT) + PENDULUM_COUNT) % PENDULUM_COUNT;
  return (
    <PendulumHighlightContext.Provider value={normalized}>
      {children}
    </PendulumHighlightContext.Provider>
  );
}

export function PendulumWave() {
  const highlight = React.useContext(PendulumHighlightContext);
  const angle = useAngle(8_000);
  const t = (angle * Math.PI) / 180;
  const PIVOT_Y = 20;
  const LENGTH = 70;
  const SPACING = (SIZE - 20) / (PENDULUM_COUNT + 1);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      <g transform="translate(0, 45)">
        <line x1={10} y1={PIVOT_Y} x2={190} y2={PIVOT_Y} stroke={STROKE} strokeWidth="1" opacity="0.3" />
        {Array.from({ length: PENDULUM_COUNT }, (_, i) => {
          const px = 10 + SPACING * (i + 1);
          const freq = 1 + i * 0.12;
          const swing = Math.sin(t * freq) * 0.6;
          const bx = px + LENGTH * Math.sin(swing);
          const by = PIVOT_Y + LENGTH * Math.cos(swing);
          const isHighlighted = highlight === i;
          return (
            <React.Fragment key={i}>
              <line
                x1={px}
                y1={PIVOT_Y}
                x2={bx}
                y2={by}
                strokeWidth={isHighlighted ? 1 : 0.8}
                // eslint-disable-next-line template/no-jsx-style-prop -- animated stroke
                style={{
                  stroke: isHighlighted ? "var(--color-accent)" : "currentColor",
                  opacity: isHighlighted ? 0.8 : 0.4,
                  transition: "stroke 280ms ease-out, opacity 280ms ease-out",
                }}
              />
              <circle
                cx={bx}
                cy={by}
                r={isHighlighted ? 5 : 4}
                // eslint-disable-next-line template/no-jsx-style-prop -- animated fill
                style={{
                  fill: isHighlighted ? "var(--color-accent)" : "currentColor",
                  opacity: isHighlighted ? 1 : 0.6,
                  transition: "fill 280ms ease-out, opacity 280ms ease-out, r 280ms ease-out",
                }}
              />
            </React.Fragment>
          );
        })}
      </g>
    </svg>
  );
}

// Five depth-3 sub-trees spread left-to-right across the canopy. The tool
// at index i lights the whole spine from the trunk out through its sub-tree.
const TREE_HIGHLIGHT_PATHS = ["LLL", "LRL", "LRR", "RLR", "RRR"] as const;

const TreeHighlightContext = React.createContext<number | null>(null);

export function TreeHighlightProvider({
  index,
  children,
}: {
  index: number | null;
  children: React.ReactNode;
}) {
  return (
    <TreeHighlightContext.Provider value={index}>
      {children}
    </TreeHighlightContext.Provider>
  );
}

export function FractalTree() {
  const idx = React.useContext(TreeHighlightContext);
  const highlightPath =
    idx != null && idx >= 0 && idx < TREE_HIGHLIGHT_PATHS.length
      ? TREE_HIGHLIGHT_PATHS[idx]
      : null;
  const angle = useAngle(5_000);
  const t = (angle * Math.PI) / 180;

  const branches: React.ReactNode[] = [];
  let key = 0;

  const draw = (
    x: number,
    y: number,
    len: number,
    a: number,
    depth: number,
    path: string,
  ) => {
    if (depth > 8 || len < 4) return;
    const sway = Math.sin(t + depth * 0.5) * 0.08 * depth;
    const endA = a + sway;
    const ex = x + len * Math.sin(endA);
    const ey = y - len * Math.cos(endA);
    const op = 0.3 + 0.4 * (1 - depth / 9);
    const sw = Math.max(0.5, 2.5 - depth * 0.25);
    // Highlight if this segment is either an ancestor of the target sub-tree
    // (on the spine) or a descendant within it.
    const isHighlighted =
      highlightPath != null &&
      (path.startsWith(highlightPath) || highlightPath.startsWith(path));
    branches.push(
      <line
        key={key++}
        x1={x}
        y1={y}
        x2={ex}
        y2={ey}
        strokeWidth={isHighlighted ? sw + 0.3 : sw}
        // eslint-disable-next-line template/no-jsx-style-prop -- animated stroke
        style={{
          stroke: isHighlighted ? "var(--color-accent)" : "currentColor",
          opacity: isHighlighted ? Math.min(1, op + 0.5) : op,
          transition: "stroke 280ms ease-out, opacity 280ms ease-out",
        }}
      />,
    );
    if (depth >= 6) {
      branches.push(
        <circle
          key={key++}
          cx={ex}
          cy={ey}
          r={1.5}
          // eslint-disable-next-line template/no-jsx-style-prop -- animated fill
          style={{
            fill: isHighlighted ? "var(--color-accent)" : "currentColor",
            opacity: isHighlighted ? 0.9 : 0.35,
            transition: "fill 280ms ease-out, opacity 280ms ease-out",
          }}
        />,
      );
    }
    draw(ex, ey, len * 0.72, endA - 0.45, depth + 1, path + "L");
    draw(ex, ey, len * 0.72, endA + 0.45, depth + 1, path + "R");
  };

  draw(CX, 190, 40, 0, 0, "");

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      <g transform="translate(0, -20)">{branches}</g>
    </svg>
  );
}

// Wave wires are grouped into 4 concentric radial bands from the centre out.
// The number of About paragraphs revealed lights that many bands, starting
// at the centre and growing outward to the edges.
const MeshHighlightContext = React.createContext<number>(0);

export function MeshHighlightProvider({
  revealed,
  children,
}: {
  revealed: number;
  children: React.ReactNode;
}) {
  return (
    <MeshHighlightContext.Provider value={revealed}>
      {children}
    </MeshHighlightContext.Provider>
  );
}

export function WaveMesh() {
  const revealed = React.useContext(MeshHighlightContext);
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

  // Segment midpoints are classified by distance-from-centre in grid space
  // (pre-projection) so the rings stay concentric rather than skewing with
  // the perspective tilt. Band 0 is innermost and lights up at revealed=1;
  // band 3 is outermost and only lights up once revealed reaches 4.
  const centerC = (COLS - 1) / 2;
  const centerR = (ROWS - 1) / 2;
  const maxDist = Math.sqrt(centerC * centerC + centerR * centerR);
  const bandAt = (r1: number, c1: number, r2: number, c2: number) => {
    const dr = (r1 + r2) / 2 - centerR;
    const dc = (c1 + c2) / 2 - centerC;
    const d = Math.sqrt(dr * dr + dc * dc);
    return Math.min(3, Math.floor((d / maxDist) * 4));
  };

  const segments: React.ReactNode[] = [];
  const pushSegment = (
    key: string,
    r1: number,
    c1: number,
    r2: number,
    c2: number,
  ) => {
    const active = bandAt(r1, c1, r2, c2) < revealed;
    const [x1, y1] = grid[r1][c1];
    const [x2, y2] = grid[r2][c2];
    segments.push(
      <line
        key={key}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={active ? 1 : 0.7}
        // eslint-disable-next-line template/no-jsx-style-prop -- animated stroke
        style={{
          stroke: active ? "var(--color-accent)" : STROKE,
          opacity: active ? 0.85 : 0.4,
          transition: "stroke 700ms ease-out, opacity 700ms ease-out",
        }}
      />,
    );
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) pushSegment(`r-${r}-${c}`, r, c, r, c + 1);
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 1; r++) pushSegment(`c-${c}-${r}`, r, c, r + 1, c);
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      {segments}
    </svg>
  );
}

// Rung count exposed so the Login hover card can time the bottom-to-top
// accent cascade without having to recompute it.
export const DNA_HELIX_COUNT = 20;
export const DNA_HELIX_RUNG_COUNT = Math.floor(DNA_HELIX_COUNT / 2);

const DnaHelixHighlightContext = React.createContext<number>(0);

export function DnaHelixHighlightProvider({
  rungsLit,
  children,
}: {
  rungsLit: number;
  children: React.ReactNode;
}) {
  return (
    <DnaHelixHighlightContext.Provider value={rungsLit}>
      {children}
    </DnaHelixHighlightContext.Provider>
  );
}

export function DnaHelix() {
  const rungsLit = React.useContext(DnaHelixHighlightContext);
  const angle = useAngle(7_000);
  const rotation = (angle * Math.PI) / 180;
  const COUNT = DNA_HELIX_COUNT;
  const R = 42;
  const HEIGHT = 110;
  const TOP = CY - HEIGHT / 2;
  const step = HEIGHT / (COUNT - 1);
  const FREQ = 0.52;

  // Rung at node-index i (even) is the k-th rung counted from the bottom,
  // where k = (COUNT-1 - i) / 2. A rung lights up once k < rungsLit.
  const rungSeqFor = (i: number) => Math.floor((COUNT - 1 - i) / 2);

  type Node = readonly [number, number, number];
  const strandA: Node[] = [];
  const strandB: Node[] = [];
  for (let i = 0; i < COUNT; i++) {
    const y = TOP + i * step;
    const phi = i * FREQ + rotation;
    strandA.push([CX + Math.cos(phi) * R, y, Math.sin(phi) * R]);
    strandB.push([CX + Math.cos(phi + Math.PI) * R, y, Math.sin(phi + Math.PI) * R]);
  }

  const opForZ = (z: number) => 0.3 + 0.5 * ((z + R) / (2 * R));
  const swForZ = (z: number) => Math.max(0.6, 2 - ((z + R) / (2 * R)) * 1.2);

  // Draw back-facing segments first so front-facing segments render over them.
  const rungs: { el: React.ReactNode; avgZ: number }[] = [];
  const aEdges: { el: React.ReactNode; avgZ: number }[] = [];
  const bEdges: { el: React.ReactNode; avgZ: number }[] = [];
  const nodes: { el: React.ReactNode; z: number }[] = [];

  for (let i = 0; i < COUNT; i++) {
    const a = strandA[i];
    const b = strandB[i];
    const isRungIndex = i % 2 === 0;
    const active = isRungIndex && rungSeqFor(i) < rungsLit;
    // Rung every other node keeps the ladder readable without crowding.
    if (isRungIndex) {
      const avgZ = (a[2] + b[2]) / 2;
      rungs.push({
        avgZ,
        el: (
          <line
            key={`rung-${i}`}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            strokeWidth={active ? 1.2 : 0.7}
            // eslint-disable-next-line template/no-jsx-style-prop -- animated stroke
            style={{
              stroke: active ? "var(--color-accent)" : STROKE,
              opacity: opForZ(avgZ) * (active ? 1 : 0.55),
              transition:
                "stroke 450ms ease-out, opacity 450ms ease-out, stroke-width 450ms ease-out",
            }}
          />
        ),
      });
    }
    const nodeTransition = "fill 450ms ease-out, opacity 450ms ease-out";
    nodes.push({
      z: a[2],
      el: (
        <circle
          key={`na-${i}`}
          cx={a[0]}
          cy={a[1]}
          r={active ? 2.6 : 2}
          // eslint-disable-next-line template/no-jsx-style-prop -- animated fill
          style={{
            fill: active ? "var(--color-accent)" : STROKE,
            opacity: active ? 1 : opForZ(a[2]),
            transition: nodeTransition,
          }}
        />
      ),
    });
    nodes.push({
      z: b[2],
      el: (
        <circle
          key={`nb-${i}`}
          cx={b[0]}
          cy={b[1]}
          r={active ? 2.6 : 2}
          // eslint-disable-next-line template/no-jsx-style-prop -- animated fill
          style={{
            fill: active ? "var(--color-accent)" : STROKE,
            opacity: active ? 1 : opForZ(b[2]),
            transition: nodeTransition,
          }}
        />
      ),
    });
  }

  for (let i = 0; i < COUNT - 1; i++) {
    const a = strandA[i];
    const aN = strandA[i + 1];
    const b = strandB[i];
    const bN = strandB[i + 1];
    const aZ = (a[2] + aN[2]) / 2;
    const bZ = (b[2] + bN[2]) / 2;
    aEdges.push({
      avgZ: aZ,
      el: (
        <line
          key={`a-${i}`}
          x1={a[0]}
          y1={a[1]}
          x2={aN[0]}
          y2={aN[1]}
          stroke={STROKE}
          strokeWidth={swForZ(aZ)}
          opacity={opForZ(aZ)}
        />
      ),
    });
    bEdges.push({
      avgZ: bZ,
      el: (
        <line
          key={`b-${i}`}
          x1={b[0]}
          y1={b[1]}
          x2={bN[0]}
          y2={bN[1]}
          stroke={STROKE}
          strokeWidth={swForZ(bZ)}
          opacity={opForZ(bZ)}
        />
      ),
    });
  }

  // Painter's algorithm: back (larger z) first, front (smaller z) last.
  const all = [...rungs, ...aEdges, ...bEdges, ...nodes.map((n) => ({ el: n.el, avgZ: n.z }))];
  all.sort((x, y) => y.avgZ - x.avgZ);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
      {all.map((x) => x.el)}
    </svg>
  );
}
