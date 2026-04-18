"use client";

/**
 * Demo: every fclass card currently in the backend cache.
 *
 * The backend persists one row per resolved (theme, fclass) pair (see
 * api/routes/osm_info.py). Rows are populated by:
 *   - hovering an fclass in the Files page legend, or
 *   - the post-clip prefetch that scans each clipped .gpkg for its
 *     distinct fclass values.
 *
 * This page groups the full cached set by theme so we can see at a glance
 * which OSM wiki content has been resolved across all projects.
 */

import * as React from "react";
import Link from "next/link";
import {
  FclassInfoCard,
  type FclassCardState,
} from "@/components/features/gis/fclass-info-card";
import {
  listCachedOsmFclassInfo,
  type OsmFclassInfoResponse,
} from "@/services/api/osm-info";

function toCardState(r: OsmFclassInfoResponse): FclassCardState {
  return {
    status: "ready",
    info: {
      description: r.description,
      wikiUrl: r.wiki_url,
      imageUrl: r.image_url,
      usageCount: r.usage_count,
      onNode: r.on_node,
      onWay: r.on_way,
      onArea: r.on_area,
      onRelation: r.on_relation,
      osmKey: r.osm_key,
      osmValue: r.osm_value,
    },
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: OsmFclassInfoResponse[] };

export default function OsmInfoDemoPage() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  React.useEffect(() => {
    const ctrl = new AbortController();
    listCachedOsmFclassInfo(ctrl.signal)
      .then((res) => setState({ status: "ready", items: res.items }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load cache",
        });
      });
    return () => ctrl.abort();
  }, []);

  const grouped = React.useMemo(() => {
    if (state.status !== "ready") return [];
    const byTheme = new Map<string, OsmFclassInfoResponse[]>();
    for (const item of state.items) {
      const list = byTheme.get(item.theme) ?? [];
      list.push(item);
      byTheme.set(item.theme, list);
    }
    return [...byTheme.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state]);

  return (
    <div className="flex h-full flex-col gap-[var(--space-4)] overflow-y-auto p-[var(--space-5)]">
      <header className="flex flex-col gap-[var(--space-2)]">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          fclass cache
        </h1>
        <p className="max-w-3xl text-sm text-[var(--color-text-secondary)]">
          Every (theme, fclass) pair the backend has resolved via{" "}
          <Link
            href="https://taginfo.openstreetmap.org"
            target="_blank"
            className="underline hover:text-[var(--color-text-primary)]"
          >
            taginfo
          </Link>{" "}
          and the OSM wiki. New rows are populated when the post-clip
          prefetch scans fresh Geofabrik layers, or on first hover in the
          Files page legend.
        </p>
        {state.status === "ready" && (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {state.items.length} entries · {grouped.length} themes
          </p>
        )}
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-[var(--color-text-muted)]">Loading cache…</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-[var(--color-text-danger)]">
          {state.message}
        </p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">
          Cache is empty. Clip an OSM dataset or hover an fclass in the Files
          page legend to populate it.
        </p>
      )}

      {state.status === "ready" && grouped.map(([theme, items]) => (
        <section key={theme} className="flex flex-col gap-[var(--space-3)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {theme} · {items.length}
          </h2>
          <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((r) => (
              <FclassInfoCard
                key={`${r.theme}/${r.fclass}`}
                fclass={r.fclass}
                theme={r.theme}
                state={toCardState(r)}
              />
            ))}
          </div>
        </section>
      ))}

      <footer className="mt-[var(--space-2)] text-[11px] text-[var(--color-text-muted)]">
        Images and descriptions © OpenStreetMap contributors, via taginfo and
        the OSM wiki.
      </footer>
    </div>
  );
}
