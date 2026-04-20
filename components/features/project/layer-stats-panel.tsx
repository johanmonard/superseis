"use client";

import * as React from "react";

import { appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  analyzeLayers,
  type LayerAnalysisResult,
  type LayerStats,
} from "@/services/api/project-layers";

const { x: X, loader: Loader, alertTriangle: AlertTriangle, chevronDown: ChevronDown, chevronRight: ChevronRight } = appIcons;

interface LayerStatsPanelProps {
  projectId: number | null;
  /** Polygon filename (stem, no extension required). */
  polygonFile: string | null;
  /** Field to group features by (e.g. "fclass"). */
  sourceField: string;
  /** Parent bumps this (e.g. via Date.now()) to force a fresh run. */
  runToken: number;
  /** Close the panel. */
  onClose: () => void;
}

export function LayerStatsPanel({
  projectId,
  polygonFile,
  sourceField,
  runToken,
  onClose,
}: LayerStatsPanelProps) {
  const [status, setStatus] = React.useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LayerAnalysisResult | null>(null);

  // Track the last run so we can discard late responses.
  const runFor = React.useRef(0);

  // Re-run whenever the parent bumps runToken.
  React.useEffect(() => {
    if (runToken <= 0) return;
    if (!projectId) return;

    const token = runToken;
    runFor.current = token;
    setStatus("loading");
    setError(null);

    analyzeLayers(projectId, {
      polygon_file: polygonFile ?? null,
      source_field: sourceField,
    })
      .then((r) => {
        if (runFor.current !== token) return;
        setResult(r);
        setStatus("done");
      })
      .catch((err: unknown) => {
        if (runFor.current !== token) return;
        const msg = err instanceof Error ? err.message : "Analysis failed";
        const detail = (err as { details?: { detail?: string } })?.details?.detail;
        setError(detail ?? msg);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  return (
    <div className="p-[var(--space-4)]">
      <div className="mb-[var(--space-4)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Terrain Analysis
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Close panel"
        >
          <X size={12} />
        </button>
      </div>

      {/* Context / status line */}
      <div className="mb-[var(--space-4)] flex flex-col gap-[var(--space-1)] text-[11px]">
        {polygonFile && (
          <span className="text-[var(--color-text-muted)]">
            Polygon: <span className="font-mono">{polygonFile}</span>
            {" · "}
            Field: <span className="font-mono">{sourceField}</span>
          </span>
        )}
        {status === "loading" && (
          <span className="flex items-center gap-[var(--space-1)] text-[var(--color-text-muted)]">
            <Loader size={12} className="animate-spin" />
            Analyzing…
          </span>
        )}
        {status === "done" && result && (
          <span className="text-[var(--color-text-muted)]">
            {result.epsg_auto
              ? `No project EPSG set — using auto-detected UTM (EPSG:${result.epsg_used})`
              : `Using project EPSG:${result.epsg_used}`}
            {" · "}
            Polygon area: {result.polygon_area_km2.toFixed(1)} km²
          </span>
        )}
      </div>

      {/* States */}
      {status === "error" && (
        <div className="flex items-start gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-status-danger)] bg-[var(--color-bg-elevated)] p-[var(--space-3)] text-xs text-[var(--color-status-danger)]">
          <AlertTriangle size={13} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === "done" && result && result.stats.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          No .gpkg files found in inputs/gis/gis_layers/.
        </p>
      )}

      {status === "done" && result && result.stats.length > 0 && (
        <div className="flex flex-col gap-[var(--space-4)]">
          <TotalCoverageKpi result={result} />
          <PolygonContributorsChart result={result} />
          <OrderedLayerSections stats={result.stats} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Render layers grouped by geometry type (polygons → lines → points → unknown),
 * each group sorted by biggest total value first.
 */
function OrderedLayerSections({ stats }: { stats: LayerStats[] }) {
  const order: LayerStats["geometry_type"][] = [
    "polygon",
    "line",
    "point",
    "unknown",
  ];
  const groupLabel: Record<LayerStats["geometry_type"], string> = {
    polygon: "Polygon layers",
    line: "Line layers",
    point: "Point layers",
    unknown: "Other",
  };

  return (
    <>
      {order.map((gt) => {
        const group = stats
          .filter((s) => s.geometry_type === gt)
          .sort((a, b) => b.total_inside - a.total_inside);
        if (group.length === 0) return null;
        return (
          <div key={gt} className="flex flex-col gap-[var(--space-2)]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {groupLabel[gt]}
            </span>
            <div className="flex flex-col gap-[var(--space-2)]">
              {group.map((ls) => (
                <LayerSection key={ls.layer} stats={ls} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Horizontal bar chart of the biggest polygon contributors (layer / fclass)
 * across every polygon layer.  Top 8 by clipped area; remainder rolled up
 * into a single "other" row.
 */
function PolygonContributorsChart({ result }: { result: LayerAnalysisResult }) {
  type Row = { key: string; layer: string; fclass: string; area: number; pct: number };

  const rows: Row[] = [];
  for (const ls of result.stats) {
    if (ls.geometry_type !== "polygon") continue;
    for (const c of ls.by_class) {
      rows.push({
        key: `${ls.layer}/${c.fclass}`,
        layer: ls.layer,
        fclass: c.fclass,
        area: c.value,
        pct: result.polygon_area_km2 > 0
          ? (c.value / result.polygon_area_km2) * 100
          : 0,
      });
    }
  }

  if (rows.length === 0) return null;

  rows.sort((a, b) => b.area - a.area);

  const TOP_N = 8;
  const top = rows.slice(0, TOP_N);
  const rest = rows.slice(TOP_N);
  const restArea = rest.reduce((acc, r) => acc + r.area, 0);
  const restPct = rest.reduce((acc, r) => acc + r.pct, 0);

  type ChartRow = { key: string; label: string; sublabel?: string; area: number; pct: number; muted?: boolean };
  const data: ChartRow[] = top.map((r) => ({
    key: r.key,
    label: r.fclass,
    sublabel: r.layer,
    area: r.area,
    pct: r.pct,
  }));
  if (rest.length > 0) {
    data.push({
      key: "__other__",
      label: "other",
      sublabel: `${rest.length} classes`,
      area: restArea,
      pct: restPct,
      muted: true,
    });
  }

  const maxArea = Math.max(...data.map((r) => r.area), 0);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-4)] py-[var(--space-3)]">
      <div className="mb-[var(--space-3)] flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Top polygon contributors
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          share of acq polygon
        </span>
      </div>

      <div className="flex flex-col gap-[var(--space-2)]">
        {data.map((r) => {
          const pctOfMax = maxArea > 0 ? (r.area / maxArea) * 100 : 0;
          return (
            <div
              key={r.key}
              className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-[var(--space-2)]"
            >
              {/* Label */}
              <div
                className={cn(
                  "min-w-0 truncate text-[11px]",
                  r.muted
                    ? "text-[var(--color-text-muted)] italic"
                    : "text-[var(--color-text-primary)]",
                )}
                title={`${r.label}${r.sublabel ? ` — ${r.sublabel}` : ""}`}
              >
                {r.label}
              </div>

              {/* Bar */}
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width]",
                    r.muted
                      ? "bg-[var(--color-border-strong)]"
                      : "bg-[var(--color-accent)]",
                  )}
                  // eslint-disable-next-line template/no-jsx-style-prop -- runtime width
                  style={{ width: `${pctOfMax}%` }}
                />
              </div>

              {/* Value */}
              <div className="text-right font-mono text-[11px] tabular-nums text-[var(--color-text-secondary)]">
                {r.pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TotalCoverageKpi({ result }: { result: LayerAnalysisResult }) {
  // Total coverage = sum of polygon-layer clipped area over the acq polygon area.
  // Can exceed 100% when polygon layers overlap each other (e.g. landuse + buildings).
  const polygonLayers = result.stats.filter((s) => s.geometry_type === "polygon");
  const summedArea = polygonLayers.reduce((acc, s) => acc + s.total_inside, 0);
  const total =
    result.polygon_area_km2 > 0 ? (summedArea / result.polygon_area_km2) * 100 : 0;
  const n = polygonLayers.length;

  return (
    <div className="flex items-baseline justify-between gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-4)] py-[var(--space-3)]">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          Total coverage
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {n} polygon layer{n === 1 ? "" : "s"} · {summedArea.toFixed(1)} km² /{" "}
          {result.polygon_area_km2.toFixed(1)} km²
        </span>
      </div>
      <span className="font-mono text-lg font-semibold text-[var(--color-text-primary)]">
        {total.toFixed(1)}%
      </span>
    </div>
  );
}

/** Backend emits "km^2"; render it with a real superscript. */
function formatUnit(unit: LayerStats["unit"]): string {
  if (unit === "km^2") return "km\u00B2";
  return unit;
}

function LayerSection({ stats }: { stats: LayerStats }) {
  const unitLabel = formatUnit(stats.unit);
  const valueFormatter = React.useMemo(() => {
    if (stats.unit === "count") return (v: number) => String(Math.round(v));
    return (v: number) => v.toFixed(1);
  }, [stats.unit]);

  // Coverage ratio: only meaningful for polygon layers.
  // Equals the sum of clipped polygon surface divided by the acq polygon area.
  const coverageRatio =
    stats.geometry_type === "polygon" && stats.polygon_area_km2 > 0
      ? (stats.total_inside / stats.polygon_area_km2) * 100
      : null;

  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-baseline justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-left",
          open && "border-b border-[var(--color-border-subtle)]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-[var(--space-2)]">
          <span className="mt-[3px] shrink-0 text-[var(--color-text-muted)]">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
              {stats.layer}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              {stats.geometry_type} · {unitLabel}
              {!stats.field_present && " · field missing"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[2px]">
          <span className="font-mono text-[11px] text-[var(--color-text-secondary)]">
            {valueFormatter(stats.total_inside)} {unitLabel}
          </span>
          {coverageRatio !== null && (
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              Coverage: {coverageRatio.toFixed(1)}%
            </span>
          )}
        </div>
      </button>

      {open && (
        stats.by_class.length === 0 ? (
          <p className="p-[var(--space-3)] text-[11px] text-[var(--color-text-muted)]">
            No features inside polygon.
          </p>
        ) : (
          <ClassTable stats={stats} valueFormatter={valueFormatter} />
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Per-class table with a collapsible "other" tail grouping all classes
 * below 1% contribution.
 */
function ClassTable({
  stats,
  valueFormatter,
}: {
  stats: LayerStats;
  valueFormatter: (v: number) => string;
}) {
  const threshold = 1.0; // percent
  const unitLabel = formatUnit(stats.unit);
  const major = stats.by_class.filter((c) => c.pct >= threshold);
  const minor = stats.by_class.filter((c) => c.pct < threshold);

  const [expanded, setExpanded] = React.useState(false);

  const minorTotalValue = minor.reduce((acc, c) => acc + c.value, 0);
  const minorTotalPct = minor.reduce((acc, c) => acc + c.pct, 0);

  return (
    <table className="w-full table-fixed text-left text-[11px]">
      <colgroup>
        <col />
        <col className="w-20" />
        <col className="w-14" />
      </colgroup>
      <thead>
        <tr className="text-[var(--color-text-muted)]">
          <th className="px-[var(--space-3)] py-[var(--space-1)] font-normal">
            {stats.field}
          </th>
          <th className="px-[var(--space-3)] py-[var(--space-1)] text-right font-normal">
            {unitLabel}
          </th>
          <th className="px-[var(--space-3)] py-[var(--space-1)] text-right font-normal">
            %
          </th>
        </tr>
      </thead>
      <tbody>
        {major.map((c) => (
          <tr
            key={c.fclass}
            className={cn(
              "border-t border-[var(--color-border-subtle)]",
              "text-[var(--color-text-secondary)]",
            )}
          >
            <td className="truncate px-[var(--space-3)] py-[var(--space-1)]" title={c.fclass}>{c.fclass}</td>
            <td className="px-[var(--space-3)] py-[var(--space-1)] text-right font-mono">
              {valueFormatter(c.value)}
            </td>
            <td className="px-[var(--space-3)] py-[var(--space-1)] text-right font-mono">
              {c.pct.toFixed(1)}
            </td>
          </tr>
        ))}

        {minor.length > 0 && (
          <tr className="border-t border-[var(--color-border-subtle)]">
            <td
              colSpan={3}
              className="px-[var(--space-3)] py-[var(--space-1)] text-[var(--color-text-muted)]"
            >
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-[var(--space-1)] text-[11px] underline-offset-2 hover:text-[var(--color-text-primary)] hover:underline"
              >
                {expanded ? "▾" : "▸"} other ({minor.length} &lt;{threshold}% ·{" "}
                {valueFormatter(minorTotalValue)} {unitLabel} ·{" "}
                {minorTotalPct.toFixed(1)}%)
              </button>
            </td>
          </tr>
        )}

        {expanded &&
          minor.map((c) => (
            <tr
              key={c.fclass}
              className={cn(
                "border-t border-[var(--color-border-subtle)]",
                "text-[var(--color-text-muted)]",
              )}
            >
              <td className="truncate px-[var(--space-5)] py-[var(--space-1)]" title={c.fclass}>{c.fclass}</td>
              <td className="px-[var(--space-3)] py-[var(--space-1)] text-right font-mono">
                {valueFormatter(c.value)}
              </td>
              <td className="px-[var(--space-3)] py-[var(--space-1)] text-right font-mono">
                {c.pct.toFixed(1)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}
