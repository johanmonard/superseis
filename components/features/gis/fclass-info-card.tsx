"use client";

import * as React from "react";
import Link from "next/link";
import { appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { FclassInfo, Geometry } from "@/lib/osm/fclass-info";

const { loader: Loader, alertTriangle: AlertTriangle } = appIcons;

export type FclassCardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: FclassInfo | null };

interface FclassInfoCardProps {
  fclass: string;
  theme?: string;
  geometry?: Geometry;
  state: FclassCardState;
  className?: string;
}

export function FclassInfoCard({
  fclass,
  theme,
  geometry,
  state,
  className,
}: FclassInfoCardProps) {
  const info = state.status === "ready" ? state.info : null;
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-bg-elevated)]">
        {state.status === "ready" && info?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={info.imageUrl}
            alt={`${info.osmKey}=${info.osmValue}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : state.status === "loading" ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader
              size={18}
              className="animate-spin text-[var(--color-text-muted)]"
            />
          </div>
        ) : state.status === "error" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-[var(--space-1)] text-[var(--color-text-muted)]">
            <AlertTriangle size={16} />
            <span className="text-[10px]">{state.message}</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--color-text-muted)]">
            no image
          </div>
        )}

        {geometry && (
          <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] backdrop-blur">
            {geometry}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-[var(--space-2)] p-[var(--space-3)]">
        <div className="flex items-baseline justify-between gap-[var(--space-2)]">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {fclass}
          </h2>
          {theme && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              {theme}
            </span>
          )}
        </div>

        {info && (
          <code className="font-mono text-[11px] text-[var(--color-text-secondary)]">
            {info.osmKey}={info.osmValue}
          </code>
        )}

        <p className="line-clamp-4 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          {state.status === "ready" ? (
            info?.description ?? (
              <span className="italic text-[var(--color-text-muted)]">
                No English description available on the OSM wiki.
              </span>
            )
          ) : state.status === "loading" ? (
            "Fetching definition…"
          ) : (
            state.message
          )}
        </p>

        {info && (
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["node", info.onNode],
                ["way", info.onWay],
                ["area", info.onArea],
                ["relation", info.onRelation],
              ] as const
            ).map(([label, on]) => (
              <span
                key={label}
                className={cn(
                  "rounded-[var(--radius-sm)] px-1.5 py-0.5 font-mono text-[10px]",
                  on
                    ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]"
                    : "text-[var(--color-text-muted)] opacity-50",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-[var(--space-1)] text-[10px]">
          <span className="text-[var(--color-text-muted)]">
            {info && info.usageCount != null
              ? `${formatCount(info.usageCount)} features worldwide`
              : "—"}
          </span>
          {info && (
            <Link
              href={info.wikiUrl}
              target="_blank"
              className="text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              OSM wiki ↗
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
