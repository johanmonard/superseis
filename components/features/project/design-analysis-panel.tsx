"use client";

import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { appIcons } from "@/components/ui/icon";

import {
  analyzeDesign,
  type DesignAnalyzeRequest,
  type DesignAnalyzeResponse,
} from "@/services/api/project-design-analyze";
import { formatApiError } from "@/services/api/client";

const { x: X, alertTriangle: AlertTriangle, loader: Loader } = appIcons;

export interface DesignAnalyzeEntry {
  id: string;
  request: DesignAnalyzeRequest;
}

export function DesignAnalysisPanel({
  projectId,
  requests,
  activeId,
  onClose,
}: {
  projectId: number;
  requests: DesignAnalyzeEntry[];
  activeId: string;
  onClose: () => void;
}) {
  const queries = useQueries({
    queries: requests.map((r) => ({
      queryKey: ["design-analyze", projectId, r.request] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        analyzeDesign(projectId, r.request, signal),
      staleTime: 60_000,
    })),
  });

  const activeIndex = requests.findIndex((r) => r.id === activeId);
  const activeQuery = activeIndex >= 0 ? queries[activeIndex] : undefined;

  // Shared histogram axis scales across all design groups so switching
  // groups doesn't cause axes to jump. Fallback to the active group's
  // own data while sibling groups are still loading.
  const sharedScales = React.useMemo(() => {
    let xMax = 0;
    let yMax = 0;
    for (const q of queries) {
      const d = q.data;
      if (!d) continue;
      const lastEdge = d.histogram.offset_edges[d.histogram.offset_edges.length - 1];
      if (lastEdge > xMax) xMax = lastEdge;
      for (const c of d.histogram.counts) {
        if (c > yMax) yMax = c;
      }
    }
    return xMax > 0 && yMax > 0 ? { xMax, yMax } : null;
  }, [queries]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--space-4)] py-[var(--space-3)]">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            Design analysis
          </h2>
          <p className="truncate text-xs text-[var(--color-text-muted)]">
            Spread metrics · offset histogram · offset/azimuth rose
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <X size={14} />
        </button>
      </header>

      {activeQuery?.isLoading && (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
          <Loader size={16} className="mr-2 animate-spin" />
          Computing…
        </div>
      )}

      {activeQuery?.isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-[var(--space-2)] p-[var(--space-4)] text-center">
          <AlertTriangle size={20} className="text-[var(--color-status-danger)]" />
          <p className="text-sm text-[var(--color-text-primary)]">Analysis failed</p>
          <p className="max-w-sm text-xs text-[var(--color-text-muted)]">
            {formatApiError(activeQuery.error)}
          </p>
        </div>
      )}

      {activeQuery?.data && (
        <AnalysisBody data={activeQuery.data} sharedScales={sharedScales} />
      )}
    </div>
  );
}

interface SharedScales {
  xMax: number;
  yMax: number;
}

function AnalysisBody({
  data,
  sharedScales,
}: {
  data: DesignAnalyzeResponse;
  sharedScales: SharedScales | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto p-[var(--space-4)]">
      <SummaryGrid data={data} />
      <div className="flex flex-col gap-[var(--space-2)]">
        <SectionTitle>Offset distribution</SectionTitle>
        <OffsetHistogram data={data} sharedScales={sharedScales} />
      </div>
      <div className="flex flex-col gap-[var(--space-2)]">
        <SectionTitle>Offset / azimuth rose</SectionTitle>
        <OffsetRose data={data} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Summary
   ------------------------------------------------------------------ */

function SummaryGrid({ data }: { data: DesignAnalyzeResponse }) {
  const { layout, fold, offsets, taper } = data;
  return (
    <div className="grid grid-cols-2 gap-[var(--space-3)]">
      <StatBlock title="Fold">
        <Row label="Peak" value={fold.peak.toString()} />
        <Row label="Nominal" value={fold.nominal.toFixed(0)} />
        <Row label="Inline nom." value={fold.inline_nominal.toFixed(0)} />
        <Row label="Xline nom." value={fold.crossline_nominal.toFixed(0)} />
      </StatBlock>
      <StatBlock title="Layout">
        <Row label="Receivers" value={layout.receiver_count.toString()} />
        <Row label="Sources" value={layout.source_count.toString()} />
        <Row label="Live channels" value={layout.live_channel_count.toString()} />
        <Row label="Trace count" value={layout.trace_count.toLocaleString()} />
        <Row label="Aspect ratio" value={layout.receiver_aspect_ratio.toFixed(3)} />
      </StatBlock>
      <StatBlock title="Offsets (m)">
        <Row label="Min" value={fmt(offsets.minimum)} />
        <Row label="Max" value={fmt(offsets.maximum)} />
        <Row label="Max inline" value={fmt(offsets.maximum_inline)} />
        <Row label="Max xline" value={fmt(offsets.maximum_crossline)} />
        <Row label="Largest min" value={fmt(offsets.largest_minimum)} />
        <Row label="Smallest max" value={fmt(offsets.smallest_maximum)} />
      </StatBlock>
      <StatBlock title="Geometry (m)">
        <Row label="Bin (in × xl)" value={`${fmt(layout.bin_size[0])} × ${fmt(layout.bin_size[1])}`} />
        <Row label="Patch" value={`${fmt(layout.patch_size[0])} × ${fmt(layout.patch_size[1])}`} />
        <Row label="Salvo" value={`${fmt(layout.salvo_size[0])} × ${fmt(layout.salvo_size[1])}`} />
        <Row label="Move-up" value={`${fmt(layout.moveup[0])} / ${fmt(layout.moveup[1])}`} />
        <Row label="Taper (in / xl)" value={`${fmt(taper.inline_distance)} / ${fmt(taper.crossline_distance)}`} />
      </StatBlock>
    </div>
  );
}

function StatBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </div>
      <div className="flex flex-col gap-[2px]">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--space-2)] text-xs">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-right font-mono text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
      {children}
    </h3>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(Math.abs(n) >= 100 ? 0 : 1);
}

/* ------------------------------------------------------------------
   Offset histogram (SVG)
   ------------------------------------------------------------------ */

function OffsetHistogram({
  data,
  sharedScales,
}: {
  data: DesignAnalyzeResponse;
  sharedScales: SharedScales | null;
}) {
  const { histogram, offsets } = data;
  const ref = React.useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 300);

  const height = 200;
  const pad = { top: 6, right: 8, bottom: 38, left: 34 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const xMin = histogram.offset_edges[0];
  const localXMax = histogram.offset_edges[histogram.offset_edges.length - 1];
  const localYMax = Math.max(1, ...histogram.counts);
  const xMax = sharedScales ? Math.max(sharedScales.xMax, localXMax) : localXMax;
  const yMax = sharedScales ? Math.max(sharedScales.yMax, localYMax) : localYMax;
  const xSpan = xMax - xMin || 1;
  const xPx = (x: number) => pad.left + ((x - xMin) / xSpan) * innerW;
  const yPx = (y: number) => pad.top + innerH - (y / yMax) * innerH;

  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = niceTicks(0, yMax, 4);
  const maxCount = localYMax;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} className="block">
        {/* axes */}
        <line
          x1={pad.left}
          x2={pad.left + innerW}
          y1={pad.top + innerH}
          y2={pad.top + innerH}
          className="stroke-[var(--color-border-subtle)]"
          strokeWidth={1}
        />
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={pad.top + innerH}
          className="stroke-[var(--color-border-subtle)]"
          strokeWidth={1}
        />
        {/* y ticks */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={pad.left - 3}
              x2={pad.left}
              y1={yPx(t)}
              y2={yPx(t)}
              className="stroke-[var(--color-border-subtle)]"
              strokeWidth={1}
            />
            <text
              x={pad.left - 5}
              y={yPx(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-[var(--color-text-muted)]"
              fontSize={9}
            >
              {t}
            </text>
          </g>
        ))}
        {/* x ticks */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={xPx(t)}
              x2={xPx(t)}
              y1={pad.top + innerH}
              y2={pad.top + innerH + 3}
              className="stroke-[var(--color-border-subtle)]"
              strokeWidth={1}
            />
            <text
              x={xPx(t)}
              y={pad.top + innerH + 12}
              textAnchor="middle"
              className="fill-[var(--color-text-muted)]"
              fontSize={9}
            >
              {t}
            </text>
          </g>
        ))}
        {/* bars */}
        {histogram.counts.map((c, i) => {
          const x0 = xPx(histogram.offset_edges[i]);
          const x1 = xPx(histogram.offset_edges[i + 1]);
          const y0 = yPx(c);
          const y1 = yPx(0);
          return (
            <rect
              key={i}
              x={x0 + 0.5}
              y={y0}
              width={Math.max(0, x1 - x0 - 1)}
              height={Math.max(0, y1 - y0)}
              className="fill-[var(--color-accent)]"
              opacity={0.85}
            />
          );
        })}
        {/* reference lines */}
        <ReferenceLine
          x={xPx(offsets.largest_minimum)}
          y0={pad.top}
          y1={pad.top + innerH}
          color="var(--color-status-danger)"
          label={["largest", "min", String(Math.round(offsets.largest_minimum))]}
        />
        <ReferenceLine
          x={xPx(offsets.smallest_maximum)}
          y0={pad.top}
          y1={pad.top + innerH}
          color="var(--color-status-success)"
          label={["smallest", "max", String(Math.round(offsets.smallest_maximum))]}
        />
        {/* axis labels */}
        <text
          x={pad.left + innerW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-[var(--color-text-secondary)]"
          fontSize={10}
        >
          offset (m)
        </text>
      </svg>
      <p className="mt-3 text-[10px] text-[var(--color-text-muted)]">
        {histogram.counts.length} bins · peak count {maxCount.toLocaleString()}
      </p>
    </div>
  );
}

function ReferenceLine({
  x,
  y0,
  y1,
  color,
  label,
}: {
  x: number;
  y0: number;
  y1: number;
  color: string;
  label: string | string[];
}) {
  const lines = Array.isArray(label) ? label : [label];
  return (
    <g>
      <line
        x1={x}
        x2={x}
        y1={y0}
        y2={y1}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text x={x + 3} y={y0 + 8} fontSize={9} fill={color}>
        {lines.map((line, i) => (
          <tspan key={i} x={x + 3} dy={i === 0 ? 0 : "1.1em"}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------
   Offset / azimuth rose (SVG polar 2D histogram)
   ------------------------------------------------------------------ */

function OffsetRose({ data }: { data: DesignAnalyzeResponse }) {
  const { rose } = data;
  const ref = React.useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 300);
  const size = Math.min(width, 300);
  const cx = size / 2;
  const cy = size / 2;
  const pad = 20; // room for N/E/S/W labels
  const radius = size / 2 - pad;
  const rMax = rose.r_max || 1;

  const countsMax = React.useMemo(() => {
    let m = 0;
    for (const row of rose.counts) for (const c of row) if (c > m) m = c;
    return m || 1;
  }, [rose.counts]);

  const wedges: React.ReactNode[] = [];
  for (let ir = 0; ir < rose.counts.length; ir++) {
    const r0 = (rose.radius_edges[ir] / rMax) * radius;
    const r1 = (rose.radius_edges[ir + 1] / rMax) * radius;
    for (let it = 0; it < rose.counts[ir].length; it++) {
      const count = rose.counts[ir][it];
      if (count <= 0) continue;
      const theta0 = rose.theta_edges[it];
      const theta1 = rose.theta_edges[it + 1];
      const d = annularSectorPath(cx, cy, r0, r1, theta0, theta1);
      wedges.push(
        <path
          key={`${ir}-${it}`}
          d={d}
          fill={rainbowR(count / countsMax)}
          stroke="var(--color-bg-surface)"
          strokeWidth={0.3}
          opacity={0.95}
        />,
      );
    }
  }

  // Radial grid rings
  const rings = rose.radius_edges.map((rEdge, i) => (
    <circle
      key={`ring-${i}`}
      cx={cx}
      cy={cy}
      r={(rEdge / rMax) * radius}
      fill="none"
      className="stroke-[var(--color-border-subtle)]"
      strokeWidth={0.5}
      opacity={0.6}
    />
  ));

  // Cardinal directions (N up, E right, S down, W left — clockwise)
  const cardinals: Array<{ label: string; angleRad: number }> = [
    { label: "N", angleRad: 0 },
    { label: "E", angleRad: Math.PI / 2 },
    { label: "S", angleRad: Math.PI },
    { label: "W", angleRad: -Math.PI / 2 },
  ];

  return (
    <div ref={ref} className="flex w-full flex-col items-center">
      <svg width={size} height={size} className="block">
        {rings}
        {/* axis crosses */}
        <line
          x1={cx}
          x2={cx}
          y1={cy - radius}
          y2={cy + radius}
          className="stroke-[var(--color-border-subtle)]"
          strokeWidth={0.5}
          opacity={0.6}
        />
        <line
          x1={cx - radius}
          x2={cx + radius}
          y1={cy}
          y2={cy}
          className="stroke-[var(--color-border-subtle)]"
          strokeWidth={0.5}
          opacity={0.6}
        />
        {wedges}
        {cardinals.map(({ label, angleRad }) => {
          const { x, y } = seismicPolarToXY(cx, cy, radius + pad * 0.55, angleRad);
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--color-text-muted)]"
              fontSize={10}
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-[var(--space-2)] text-[10px] text-[var(--color-text-muted)]">
        <LegendGradient />
        <span>few → many traces</span>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
        r_max {Math.round(rMax)} m · {rose.counts.length} radial × {rose.counts[0]?.length ?? 0} angular bins
      </p>
    </div>
  );
}

function LegendGradient() {
  const stops = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="flex h-2 w-24 overflow-hidden rounded-[var(--radius-sm)]">
      {stops.slice(0, -1).map((t, i) => (
        <div
          key={i}
          className="flex-1"
          // eslint-disable-next-line template/no-jsx-style-prop -- gradient stops are dynamic
          style={{
            background: `linear-gradient(to right, ${rainbowR(t)}, ${rainbowR(stops[i + 1])})`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function useWidth(ref: React.RefObject<HTMLElement | null>, fallback: number): number {
  const [w, setW] = React.useState(fallback);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cw = entry.contentRect.width;
        if (cw > 0) setW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * Map math-polar (θ=0 is +x, counterclockwise, as returned by the rose
 * report) to SVG screen coords under seismic convention: θ=0 is North
 * (up) and positive θ is clockwise. Equivalent to matplotlib's
 * `set_theta_zero_location("N")` + `set_theta_direction(-1)`.
 */
function seismicPolarToXY(
  cx: number,
  cy: number,
  r: number,
  theta: number,
): { x: number; y: number } {
  return {
    x: cx + r * Math.sin(theta),
    y: cy - r * Math.cos(theta),
  };
}

function annularSectorPath(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  theta0: number,
  theta1: number,
): string {
  const p1 = seismicPolarToXY(cx, cy, r1, theta0);
  const p2 = seismicPolarToXY(cx, cy, r1, theta1);
  const p3 = seismicPolarToXY(cx, cy, r0, theta1);
  const p4 = seismicPolarToXY(cx, cy, r0, theta0);
  const sweep = theta1 - theta0;
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  // Seismic mapping flips sweep direction relative to math-polar, so arcs
  // run clockwise in screen space.
  const outerSweep = sweep > 0 ? 1 : 0;
  const innerSweep = sweep > 0 ? 0 : 1;
  if (r0 <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${p1.x} ${p1.y}`,
      `A ${r1} ${r1} 0 ${largeArc} ${outerSweep} ${p2.x} ${p2.y}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r1} ${r1} 0 ${largeArc} ${outerSweep} ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${r0} ${r0} 0 ${largeArc} ${innerSweep} ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ");
}

/**
 * Rainbow_r colormap approximation — t=0 is red, t=1 is violet.
 * Matches matplotlib's `rainbow_r` closely enough for categorical display.
 */
function rainbowR(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const hue = 0 + clamped * 280; // 0° red → 280° violet
  return `hsl(${hue.toFixed(0)}, 85%, 55%)`;
}

function niceTicks(min: number, max: number, target: number): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const step0 = span / target;
  const pow10 = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / pow10;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * pow10;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

