"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CrsInfoResponse } from "@/services/api/crs";

const { x: X, alertTriangle: AlertTriangle, loader: Loader } = appIcons;

const CrsAreaMap = dynamic(() => import("./crs-area-map").then((m) => m.CrsAreaMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
      <Loader size={16} className="animate-spin" />
    </div>
  ),
});

export type CrsPanelState =
  | { status: "loading"; epsg: number }
  | { status: "error"; epsg: number; message: string }
  | { status: "ready"; info: CrsInfoResponse };

export function CrsInfoPanel({
  state,
  onClose,
}: {
  state: CrsPanelState;
  onClose: () => void;
}) {
  const title =
    state.status === "ready"
      ? `EPSG:${state.info.epsg}`
      : `EPSG:${state.epsg}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--space-4)] py-[var(--space-3)]">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          {state.status === "ready" && (
            <p className="truncate text-xs text-[var(--color-text-muted)]">
              {state.info.name}
            </p>
          )}
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

      {state.status === "loading" && (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
          <Loader size={16} className="mr-2 animate-spin" />
          Loading…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-[var(--space-2)] p-[var(--space-4)] text-center">
          <AlertTriangle size={20} className="text-[var(--color-status-danger)]" />
          <p className="text-sm text-[var(--color-text-primary)]">
            EPSG:{state.epsg} — not found
          </p>
          <p className="max-w-sm text-xs text-[var(--color-text-muted)]">
            {state.message}
          </p>
        </div>
      )}

      {state.status === "ready" && <CrsDetails info={state.info} />}
    </div>
  );
}

function CrsDetails({ info }: { info: CrsInfoResponse }) {
  const areaBounds: [number, number, number, number] | null =
    info.area_west != null &&
    info.area_south != null &&
    info.area_east != null &&
    info.area_north != null
      ? [info.area_west, info.area_south, info.area_east, info.area_north]
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)] overflow-y-auto p-[var(--space-4)]">
      {/* Type + unit + flags */}
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Pill label={info.type_name} accent />
        {info.unit && <Pill label={info.unit} />}
        {info.is_deprecated && <Pill label="deprecated" danger />}
        {info.unit && info.unit.toLowerCase() !== "metre" && (
          <Pill label="non-metric" danger />
        )}
      </div>

      {/* Area map */}
      {areaBounds && (
        <div className="flex flex-col gap-[var(--space-2)]">
          <SectionTitle>Area of use</SectionTitle>
          <div className="h-40 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]">
            <CrsAreaMap bounds={areaBounds} />
          </div>
          {info.area_name && (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              {info.area_name}
            </p>
          )}
          <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
            W {fmt(info.area_west)}  S {fmt(info.area_south)}  E {fmt(info.area_east)}  N {fmt(info.area_north)}
          </p>
        </div>
      )}

      {/* Datum */}
      {info.datum_name && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <SectionTitle>Datum</SectionTitle>
          <Row label="Name" value={info.datum_name} />
          {info.datum_type && <Row label="Type" value={info.datum_type} />}
        </div>
      )}

      {/* Ellipsoid */}
      {info.ellipsoid_name && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <SectionTitle>Ellipsoid</SectionTitle>
          <Row label="Name" value={info.ellipsoid_name} />
          {info.ellipsoid_a != null && (
            <Row label="Semi-major (a)" value={`${fmtMeters(info.ellipsoid_a)} m`} />
          )}
          {info.ellipsoid_b != null && (
            <Row label="Semi-minor (b)" value={`${fmtMeters(info.ellipsoid_b)} m`} />
          )}
          {info.ellipsoid_inv_flat != null && (
            <Row label="1 / flattening" value={info.ellipsoid_inv_flat.toFixed(6)} />
          )}
        </div>
      )}

      {/* Prime meridian */}
      {info.prime_meridian_name && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <SectionTitle>Prime meridian</SectionTitle>
          <Row label="Name" value={info.prime_meridian_name} />
          {info.prime_meridian_lon != null && (
            <Row label="Longitude" value={`${info.prime_meridian_lon}°`} />
          )}
        </div>
      )}

      {/* Projection */}
      {info.projection_method && (
        <div className="flex flex-col gap-[var(--space-1)]">
          <SectionTitle>Projection</SectionTitle>
          <Row label="Method" value={info.projection_method} />
          {(info.projection_params ?? []).map((p) => (
            <Row
              key={p.name}
              label={p.name}
              value={formatParam(p.value, p.unit)}
            />
          ))}
        </div>
      )}

      <p className="pt-[var(--space-2)] text-[10px] text-[var(--color-text-muted)]">
        Resolved {info.cached ? "from cache" : "via pyproj"} ·{" "}
        {new Date(info.fetched_at).toLocaleString()}
      </p>
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--space-2)] text-xs">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className="truncate text-right font-mono text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function Pill({
  label,
  accent,
  danger,
}: {
  label: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-[var(--radius-sm)] px-[var(--space-2)] py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        accent
          ? "bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]"
          : danger
            ? "bg-[color-mix(in_srgb,var(--color-status-danger)_12%,transparent)] text-[var(--color-status-danger)]"
            : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]",
      )}
    >
      {label}
    </span>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}°`;
}

function fmtMeters(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatParam(
  value: number | string | null,
  unit: string | null,
): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    const rounded =
      Math.abs(value) >= 1000
        ? value.toLocaleString(undefined, { maximumFractionDigits: 3 })
        : value.toString();
    return unit ? `${rounded} ${unit}` : rounded;
  }
  return unit ? `${value} ${unit}` : value;
}
