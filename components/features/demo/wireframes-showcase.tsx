"use client";

import * as React from "react";

/* ===================================================================
   Shared constants
   =================================================================== */

const SIZE = 200;
const CX = 100;
const CY = 100;
const R = 80;
const STROKE = "currentColor";

/* ===================================================================
   Hook — continuous angle driven by rAF
   =================================================================== */

function useAnimationAngle(durationMs: number) {
  const [angle, setAngle] = React.useState(0);
  React.useEffect(() => {
    let start: number | null = null;
    let id: number;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      setAngle(((ts - start) / durationMs) * 360);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [durationMs]);
  return angle;
}

/* ===================================================================
   1. Rotating Globe — longitude lines sweep horizontally
   =================================================================== */

function RotatingGlobe() {
  const angle = useAnimationAngle(20_000);
  const lats = [-60, -30, 0, 30, 60];
  const lonOffsets = [0, 30, 60, 90, 120, 150];

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      <circle cx={CX} cy={CY} r={R} stroke={STROKE} strokeWidth="1.25" opacity="0.6" />
      {lats.map((lat) => {
        const rad = (lat * Math.PI) / 180;
        return (
          <ellipse key={lat} cx={CX} cy={CY - R * Math.sin(rad)} rx={R * Math.cos(rad)} ry={1} stroke={STROKE} strokeWidth="0.8" opacity="0.45" />
        );
      })}
      {lonOffsets.map((base) => {
        const lon = ((base + angle) % 180) * (Math.PI / 180);
        const rx = Math.abs(R * Math.cos(lon));
        return (
          <ellipse key={base} cx={CX} cy={CY} rx={rx} ry={R} stroke={STROKE} strokeWidth="0.8" opacity={0.25 + 0.45 * (1 - rx / R)} />
        );
      })}
    </svg>
  );
}

/* ===================================================================
   2. Pulsing Radar — expanding rings
   =================================================================== */

function PulsingRadar() {
  const angle = useAnimationAngle(4_000);
  const t = (angle % 360) / 360; // 0→1

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* cross hairs */}
      <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke={STROKE} strokeWidth="0.8" opacity="0.3" />
      <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke={STROKE} strokeWidth="0.8" opacity="0.3" />
      {/* static rings */}
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} stroke={STROKE} strokeWidth="0.8" opacity="0.25" />
      ))}
      {/* sweep line */}
      {(() => {
        const a = (angle * Math.PI) / 180;
        return <line x1={CX} y1={CY} x2={CX + R * Math.cos(a)} y2={CY - R * Math.sin(a)} stroke={STROKE} strokeWidth="1.5" opacity="0.65" />;
      })()}
      {/* expanding pulse */}
      {[0, 0.33, 0.66].map((offset) => {
        const p = (t + offset) % 1;
        return (
          <circle key={offset} cx={CX} cy={CY} r={R * p} stroke={STROKE} strokeWidth="1" opacity={0.6 * (1 - p)} />
        );
      })}
      {/* center dot */}
      <circle cx={CX} cy={CY} r={3} fill={STROKE} opacity="0.55" />
    </svg>
  );
}

/* ===================================================================
   3. Orbiting Atoms — three elliptical orbits with dots
   =================================================================== */

function OrbitingAtoms() {
  const angle = useAnimationAngle(8_000);

  const orbits = [
    { tilt: 0, speed: 1 },
    { tilt: 60, speed: 1.4 },
    { tilt: -60, speed: 0.8 },
  ];

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* nucleus */}
      <circle cx={CX} cy={CY} r={5} fill={STROKE} opacity="0.45" />
      {orbits.map(({ tilt, speed }, i) => {
        const a = ((angle * speed) * Math.PI) / 180;
        const dx = R * Math.cos(a);
        const dy = R * 0.3 * Math.sin(a);
        return (
          <g key={i} transform={`rotate(${tilt} ${CX} ${CY})`}>
            <ellipse cx={CX} cy={CY} rx={R} ry={R * 0.3} stroke={STROKE} strokeWidth="0.8" opacity="0.4" />
            <circle cx={CX + dx} cy={CY + dy} r={4} fill={STROKE} opacity="0.65" />
          </g>
        );
      })}
    </svg>
  );
}

/* ===================================================================
   4. Spinning Cube — wireframe cube with Y-axis rotation
   =================================================================== */

function SpinningCube() {
  const angle = useAnimationAngle(12_000);
  const a = (angle * Math.PI) / 180;
  const S = 50; // half-size

  // 8 cube vertices centered at origin
  const verts = [
    [-S, -S, -S], [S, -S, -S], [S, S, -S], [-S, S, -S],
    [-S, -S, S], [S, -S, S], [S, S, S], [-S, S, S],
  ];

  // project with Y-rotation
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
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        const op = 0.3 + 0.45 * ((avgZ + S) / (2 * S));
        return (
          <line key={i} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth="1.25" opacity={op} />
        );
      })}
      {proj.map(([x, y, z], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={STROKE} opacity={0.4 + 0.35 * ((z + S) / (2 * S))} />
      ))}
    </svg>
  );
}

/* ===================================================================
   5. DNA Helix — two intertwined sine waves
   =================================================================== */

function DnaHelix() {
  const angle = useAnimationAngle(6_000);
  const offset = (angle / 360) * Math.PI * 2;
  const steps = 24;
  const AMP = 40;
  const H = 160;
  const TOP = 20;

  const strand = (phase: number) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const x = CX + AMP * Math.sin(t * Math.PI * 3 + offset + phase);
      const y = TOP + t * H;
      const z = Math.cos(t * Math.PI * 3 + offset + phase);
      return { x, y, z };
    });

  const s1 = strand(0);
  const s2 = strand(Math.PI);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* connecting rungs */}
      {Array.from({ length: steps + 1 }, (_, i) => (
        <line key={`rung-${i}`} x1={s1[i].x} y1={s1[i].y} x2={s2[i].x} y2={s2[i].y} stroke={STROKE} strokeWidth="0.6" opacity={0.2 + 0.2 * (1 + s1[i].z) / 2} />
      ))}
      {/* strand 1 */}
      <polyline
        points={s1.map((p) => `${p.x},${p.y}`).join(" ")}
        stroke={STROKE} strokeWidth="1.5" opacity="0.55" fill="none"
      />
      {/* strand 2 */}
      <polyline
        points={s2.map((p) => `${p.x},${p.y}`).join(" ")}
        stroke={STROKE} strokeWidth="1.5" opacity="0.55" fill="none"
      />
      {/* dots on strands */}
      {s1.filter((_, i) => i % 3 === 0).map((p, i) => (
        <circle key={`d1-${i}`} cx={p.x} cy={p.y} r={3} fill={STROKE} opacity={0.35 + 0.35 * (1 + p.z) / 2} />
      ))}
      {s2.filter((_, i) => i % 3 === 0).map((p, i) => (
        <circle key={`d2-${i}`} cx={p.x} cy={p.y} r={3} fill={STROKE} opacity={0.35 + 0.35 * (1 + p.z) / 2} />
      ))}
    </svg>
  );
}

/* ===================================================================
   6. Geodesic Sphere — icosahedron wireframe with slow rotation
   =================================================================== */

function GeodesicSphere() {
  const angle = useAnimationAngle(16_000);
  const aY = (angle * Math.PI) / 180;
  const aX = (angle * 0.3 * Math.PI) / 180;

  // icosahedron vertices
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw: [number, number, number][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  // normalise to R
  const verts = raw.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [(x / len) * R, (y / len) * R, (z / len) * R] as [number, number, number];
  });

  const faces = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];

  // unique edges from faces
  const edgeSet = new Set<string>();
  faces.forEach(([a, b, c]) => {
    [[a,b],[b,c],[c,a]].forEach(([u,v]) => {
      const key = `${Math.min(u,v)}-${Math.max(u,v)}`;
      edgeSet.add(key);
    });
  });
  const edges = [...edgeSet].map((k) => k.split("-").map(Number));

  // rotate Y then X
  const cosY = Math.cos(aY), sinY = Math.sin(aY);
  const cosX = Math.cos(aX), sinX = Math.sin(aX);
  const proj = verts.map(([x, y, z]) => {
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    const scale = 300 / (300 + z2);
    return [CX + x1 * scale, CY + y1 * scale, z2] as const;
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        return (
          <line key={i} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth="1" opacity={0.25 + 0.45 * ((avgZ + R) / (2 * R))} />
        );
      })}
    </svg>
  );
}

/* ===================================================================
   7. Oscilloscope — Lissajous figure that morphs
   =================================================================== */

function Oscilloscope() {
  const angle = useAnimationAngle(10_000);
  const t0 = (angle * Math.PI) / 180;
  const freqX = 3;
  const freqY = 2;
  const steps = 200;

  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const x = CX + R * Math.sin(freqX * t + t0);
    const y = CY + R * Math.cos(freqY * t);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* bounding box */}
      <rect x={CX - R} y={CY - R} width={R * 2} height={R * 2} stroke={STROKE} strokeWidth="0.6" opacity="0.25" />
      {/* grid */}
      {[-0.5, 0, 0.5].map((f) => (
        <React.Fragment key={f}>
          <line x1={CX + R * f} y1={CY - R} x2={CX + R * f} y2={CY + R} stroke={STROKE} strokeWidth="0.5" opacity="0.15" />
          <line x1={CX - R} y1={CY + R * f} x2={CX + R} y2={CY + R * f} stroke={STROKE} strokeWidth="0.5" opacity="0.15" />
        </React.Fragment>
      ))}
      <polyline points={points} stroke={STROKE} strokeWidth="1.5" opacity="0.6" fill="none" />
    </svg>
  );
}

/* ===================================================================
   8. Torus — rotating donut wireframe
   =================================================================== */

function WireTorus() {
  const angle = useAnimationAngle(14_000);
  const aY = (angle * Math.PI) / 180;
  const aX = 0.4; // slight tilt

  const majorR = 50;
  const minorR = 22;
  const uSteps = 24;
  const vSteps = 12;

  const cosY = Math.cos(aY), sinY = Math.sin(aY);
  const cosX = Math.cos(aX), sinX = Math.sin(aX);

  const getPoint = (u: number, v: number) => {
    const cu = Math.cos(u), su = Math.sin(u);
    const cv = Math.cos(v), sv = Math.sin(v);
    const x = (majorR + minorR * cv) * cu;
    const y = (majorR + minorR * cv) * su;
    const z = minorR * sv;
    // rotate Y then X
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    const scale = 300 / (300 + z2);
    return [CX + x1 * scale, CY + y1 * scale, z2] as const;
  };

  const lines: React.ReactNode[] = [];

  // rings along major circle
  for (let ui = 0; ui < uSteps; ui++) {
    const u = (ui / uSteps) * Math.PI * 2;
    const pts: string[] = [];
    for (let vi = 0; vi <= vSteps; vi++) {
      const v = (vi / vSteps) * Math.PI * 2;
      const [px, py] = getPoint(u, v);
      pts.push(`${px},${py}`);
    }
    lines.push(<polyline key={`u-${ui}`} points={pts.join(" ")} stroke={STROKE} strokeWidth="0.8" opacity="0.4" fill="none" />);
  }

  // rings along minor circle
  for (let vi = 0; vi < vSteps; vi++) {
    const v = (vi / vSteps) * Math.PI * 2;
    const pts: string[] = [];
    for (let ui = 0; ui <= uSteps; ui++) {
      const u = (ui / uSteps) * Math.PI * 2;
      const [px, py] = getPoint(u, v);
      pts.push(`${px},${py}`);
    }
    lines.push(<polyline key={`v-${vi}`} points={pts.join(" ")} stroke={STROKE} strokeWidth="0.8" opacity="0.35" fill="none" />);
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {lines}
    </svg>
  );
}

/* ===================================================================
   9. Grid Wave — undulating dot grid
   =================================================================== */

function GridWave() {
  const angle = useAnimationAngle(5_000);
  const t = (angle * Math.PI) / 180;
  const cols = 12;
  const rows = 12;
  const gap = 14;
  const ox = CX - ((cols - 1) * gap) / 2;
  const oy = CY - ((rows - 1) * gap) / 2;

  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * gap;
      const y = oy + r * gap;
      const dist = Math.sqrt((c - cols / 2) ** 2 + (r - rows / 2) ** 2);
      const wave = Math.sin(dist * 0.8 - t) * 0.5 + 0.5;
      const radius = 1.5 + wave * 3;
      const opacity = 0.25 + wave * 0.5;
      dots.push(
        <circle key={`${r}-${c}`} cx={x} cy={y} r={radius} fill={STROKE} opacity={opacity} />
      );
    }
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {dots}
    </svg>
  );
}

/* ===================================================================
   10. Spirograph — hypotrochoid curve that draws itself
   =================================================================== */

function Spirograph() {
  const angle = useAnimationAngle(12_000);
  const phase = (angle * Math.PI) / 180;
  const R1 = 55, R2 = 22, D = 45;
  const steps = 400;

  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * Math.PI * 8;
    const x = CX + (R1 - R2) * Math.cos(t + phase) + D * Math.cos(((R1 - R2) / R2) * t + phase);
    const y = CY + (R1 - R2) * Math.sin(t + phase) - D * Math.sin(((R1 - R2) / R2) * t + phase);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      <circle cx={CX} cy={CY} r={R1} stroke={STROKE} strokeWidth="0.5" opacity="0.15" />
      <polyline points={points} stroke={STROKE} strokeWidth="1" opacity="0.55" fill="none" />
    </svg>
  );
}

/* ===================================================================
   11. Constellation — random stars with twinkling + proximity lines
   =================================================================== */

const CONSTELLATION_STARS = Array.from({ length: 30 }, (_, i) => {
  // seeded pseudo-random using index
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
  const angle = useAnimationAngle(3_000);
  const t = (angle * Math.PI) / 180;
  const LINK_DIST = 55;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* proximity lines */}
      {CONSTELLATION_STARS.map((s, i) =>
        CONSTELLATION_STARS.slice(i + 1).map((s2, j) => {
          const dx = s.x - s2.x, dy = s.y - s2.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > LINK_DIST) return null;
          return (
            <line key={`${i}-${j}`} x1={s.x} y1={s.y} x2={s2.x} y2={s2.y} stroke={STROKE} strokeWidth="0.6" opacity={0.15 + 0.25 * (1 - d / LINK_DIST)} />
          );
        })
      )}
      {/* stars */}
      {CONSTELLATION_STARS.map((s, i) => {
        const twinkle = 0.4 + 0.4 * Math.sin(t * s.speed + s.phase);
        const r = 1.5 + twinkle * 2;
        return <circle key={i} cx={s.x} cy={s.y} r={r} fill={STROKE} opacity={twinkle} />;
      })}
    </svg>
  );
}

/* ===================================================================
   12. Pendulum Wave — row of pendulums with phase offset
   =================================================================== */

function PendulumWave() {
  const angle = useAnimationAngle(8_000);
  const t = (angle * Math.PI) / 180;
  const COUNT = 15;
  const PIVOT_Y = 20;
  const LENGTH = 70;
  const SPACING = (SIZE - 20) / (COUNT + 1);

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* pivot bar */}
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
    </svg>
  );
}

/* ===================================================================
   13. Möbius Strip — twisted loop wireframe
   =================================================================== */

function MoebiusStrip() {
  const angle = useAnimationAngle(18_000);
  const aY = (angle * Math.PI) / 180;

  const majorR = 55;
  const halfW = 20;
  const uSteps = 48;
  const wSteps = 4;
  const cosY = Math.cos(aY), sinY = Math.sin(aY);
  const tiltX = 0.5;
  const cosX = Math.cos(tiltX), sinX = Math.sin(tiltX);

  const getPoint = (u: number, w: number) => {
    const halfTwist = u / 2;
    const r = majorR + w * Math.cos(halfTwist);
    const x = r * Math.cos(u);
    const y = r * Math.sin(u);
    const z = w * Math.sin(halfTwist);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    const scale = 350 / (350 + z2);
    return [CX + x1 * scale, CY + y1 * scale, z2] as const;
  };

  const lines: React.ReactNode[] = [];

  // lengthwise strips
  for (let wi = 0; wi <= wSteps; wi++) {
    const w = -halfW + (wi / wSteps) * halfW * 2;
    const pts: string[] = [];
    for (let ui = 0; ui <= uSteps; ui++) {
      const u = (ui / uSteps) * Math.PI * 2;
      const [px, py] = getPoint(u, w);
      pts.push(`${px},${py}`);
    }
    lines.push(<polyline key={`w-${wi}`} points={pts.join(" ")} stroke={STROKE} strokeWidth="0.8" opacity="0.4" fill="none" />);
  }

  // cross ribs
  for (let ui = 0; ui < uSteps; ui += 3) {
    const u = (ui / uSteps) * Math.PI * 2;
    const [x1, y1] = getPoint(u, -halfW);
    const [x2, y2] = getPoint(u, halfW);
    lines.push(<line key={`r-${ui}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth="0.5" opacity="0.25" />);
  }

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {lines}
    </svg>
  );
}

/* ===================================================================
   14. Particle Drift — random particles floating with brownian motion
   =================================================================== */

const PARTICLE_SEEDS = Array.from({ length: 40 }, (_, i) => {
  const a = Math.sin(i * 157.3 + 43.1) * 43758.5453;
  const b = Math.sin(i * 213.7 + 97.4) * 43758.5453;
  const c = Math.sin(i * 331.2 + 171.8) * 43758.5453;
  return {
    baseX: 10 + (a - Math.floor(a)) * 180,
    baseY: 10 + (b - Math.floor(b)) * 180,
    freqX: 0.3 + (c - Math.floor(c)) * 0.9,
    freqY: 0.3 + (a - Math.floor(a)) * 0.7,
    phaseX: (b - Math.floor(b)) * Math.PI * 2,
    phaseY: (c - Math.floor(c)) * Math.PI * 2,
    r: 1.5 + (a - Math.floor(a)) * 2,
  };
});

function ParticleDrift() {
  const angle = useAnimationAngle(6_000);
  const t = (angle * Math.PI) / 180;
  const LINK = 45;

  const positions = PARTICLE_SEEDS.map((p) => ({
    x: p.baseX + Math.sin(t * p.freqX + p.phaseX) * 15,
    y: p.baseY + Math.cos(t * p.freqY + p.phaseY) * 15,
    r: p.r,
  }));

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {/* links */}
      {positions.map((p, i) =>
        positions.slice(i + 1).map((p2, j) => {
          const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (d > LINK) return null;
          return <line key={`${i}-${j}`} x1={p.x} y1={p.y} x2={p2.x} y2={p2.y} stroke={STROKE} strokeWidth="0.5" opacity={0.12 + 0.28 * (1 - d / LINK)} />;
        })
      )}
      {positions.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={STROKE} opacity="0.55" />
      ))}
    </svg>
  );
}

/* ===================================================================
   15. Wave Mesh — 3D sine surface viewed at an angle
   =================================================================== */

function WaveMesh() {
  const angle = useAnimationAngle(7_000);
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
      // project: tilt around X
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
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {lines}
    </svg>
  );
}

/* ===================================================================
   16. Spinning Octahedron — dual pyramid wireframe
   =================================================================== */

function SpinningOctahedron() {
  const angle = useAnimationAngle(10_000);
  const aY = (angle * Math.PI) / 180;
  const aX = (angle * 0.4 * Math.PI) / 180;
  const S = 65;

  const verts: [number, number, number][] = [
    [S, 0, 0], [-S, 0, 0],
    [0, S, 0], [0, -S, 0],
    [0, 0, S], [0, 0, -S],
  ];

  const edges = [
    [0,2],[0,3],[0,4],[0,5],
    [1,2],[1,3],[1,4],[1,5],
    [2,4],[2,5],[3,4],[3,5],
  ];

  const cosY = Math.cos(aY), sinY = Math.sin(aY);
  const cosX = Math.cos(aX), sinX = Math.sin(aX);

  const proj = verts.map(([x, y, z]) => {
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    const scale = 300 / (300 + z2);
    return [CX + x1 * scale, CY + y1 * scale, z2] as const;
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {edges.map(([a, b], i) => {
        const avgZ = (proj[a][2] + proj[b][2]) / 2;
        return (
          <line key={i} x1={proj[a][0]} y1={proj[a][1]} x2={proj[b][0]} y2={proj[b][1]} stroke={STROKE} strokeWidth="1.25" opacity={0.3 + 0.4 * ((avgZ + S) / (2 * S))} />
        );
      })}
      {proj.map(([x, y, z], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={STROKE} opacity={0.4 + 0.35 * ((z + S) / (2 * S))} />
      ))}
    </svg>
  );
}

/* ===================================================================
   17. Sound Bars — audio equalizer style bouncing bars
   =================================================================== */

const BAR_SEEDS = Array.from({ length: 20 }, (_, i) => {
  const a = Math.sin(i * 97.1 + 23.7) * 43758.5453;
  const b = Math.sin(i * 181.3 + 67.1) * 43758.5453;
  return {
    freq: 0.6 + (a - Math.floor(a)) * 1.8,
    phase: (b - Math.floor(b)) * Math.PI * 2,
  };
});

function SoundBars() {
  const angle = useAnimationAngle(4_000);
  const t = (angle * Math.PI) / 180;
  const COUNT = 20;
  const BAR_W = 6;
  const GAP = 3;
  const MAX_H = 140;
  const BOTTOM = 180;
  const totalW = COUNT * BAR_W + (COUNT - 1) * GAP;
  const startX = CX - totalW / 2;

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {BAR_SEEDS.map((seed, i) => {
        const h = MAX_H * (0.15 + 0.85 * ((Math.sin(t * seed.freq + seed.phase) + 1) / 2));
        const x = startX + i * (BAR_W + GAP);
        return (
          <rect key={i} x={x} y={BOTTOM - h} width={BAR_W} height={h} rx={2} fill={STROKE} opacity={0.3 + 0.35 * (h / MAX_H)} />
        );
      })}
    </svg>
  );
}

/* ===================================================================
   18. Fractal Tree — recursive branches swaying in wind
   =================================================================== */

function FractalTree() {
  const angle = useAnimationAngle(5_000);
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
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" className="text-[var(--color-text-muted)]">
      {branches}
    </svg>
  );
}

/* ===================================================================
   Showcase layout
   =================================================================== */

const ITEMS: { label: string; description: string; Component: React.FC }[] = [
  { label: "Rotating Globe", description: "Longitude lines sweep around the Y-axis", Component: RotatingGlobe },
  { label: "Pulsing Radar", description: "Expanding rings with rotating sweep", Component: PulsingRadar },
  { label: "Orbiting Atoms", description: "Three tilted elliptical orbits", Component: OrbitingAtoms },
  { label: "Spinning Cube", description: "Wireframe cube with perspective", Component: SpinningCube },
  { label: "DNA Helix", description: "Twin sine strands with connecting rungs", Component: DnaHelix },
  { label: "Geodesic Sphere", description: "Icosahedron wireframe rotating in 3D", Component: GeodesicSphere },
  { label: "Oscilloscope", description: "Morphing Lissajous figure", Component: Oscilloscope },
  { label: "Wire Torus", description: "Rotating donut wireframe", Component: WireTorus },
  { label: "Grid Wave", description: "Undulating dot matrix", Component: GridWave },
  { label: "Spirograph", description: "Rotating hypotrochoid curve", Component: Spirograph },
  { label: "Constellation", description: "Twinkling stars with proximity links", Component: Constellation },
  { label: "Pendulum Wave", description: "Phase-offset swinging pendulums", Component: PendulumWave },
  { label: "Möbius Strip", description: "Twisted loop wireframe", Component: MoebiusStrip },
  { label: "Particle Drift", description: "Brownian particles with proximity lines", Component: ParticleDrift },
  { label: "Wave Mesh", description: "3D sine surface grid", Component: WaveMesh },
  { label: "Octahedron", description: "Dual pyramid wireframe rotating in 3D", Component: SpinningOctahedron },
  { label: "Sound Bars", description: "Randomized equalizer bars", Component: SoundBars },
  { label: "Fractal Tree", description: "Recursive branches swaying in wind", Component: FractalTree },
];

export function WireframesShowcase() {
  return (
    <div className="mx-auto max-w-6xl p-[var(--space-6)]">
      <h1 className="mb-[var(--space-2)] text-lg font-semibold text-[var(--color-text-primary)]">
        Wireframe Viewport Placeholders
      </h1>
      <p className="mb-[var(--space-6)] text-sm text-[var(--color-text-secondary)]">
        Animated SVG placeholders for empty viewports. Pure SVG + requestAnimationFrame — no dependencies.
      </p>

      <div className="grid grid-cols-1 gap-[var(--space-6)] sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(({ label, description, Component }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-4)]"
          >
            <div className="flex h-[200px] w-[200px] items-center justify-center">
              <Component />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{label}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
