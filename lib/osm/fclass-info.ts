/**
 * Client-side access to the backend OSM fclass info cache.
 *
 * The backend (see api/routes/osm_info.py) owns the resolution logic +
 * persistent cache. This module:
 *   - normalizes a Geofabrik layer id → theme,
 *   - calls GET /osm/fclass-info (or POST /osm/fclass-info/batch),
 *   - keeps an in-memory Map<(theme|fclass), FclassInfo> so repeat hovers
 *     in the same session don't round-trip to the backend.
 *
 * Used by:
 *   - app/(workspace)/demo/osm-info/page.tsx (reference grid)
 *   - components/features/demo/gis-globe-viewport.tsx (legend hover + clip prefetch)
 */

import {
  batchFetchOsmFclassInfo,
  fetchOsmFclassInfo,
  type OsmFclassInfoResponse,
} from "@/services/api/osm-info";

export type Geometry = "point" | "line" | "polygon" | "unknown";

export interface FclassInfo {
  description: string | null;
  wikiUrl: string;
  imageUrl: string | null;
  usageCount: number | null;
  onNode: boolean;
  onWay: boolean;
  onArea: boolean;
  onRelation: boolean;
  osmKey: string;
  osmValue: string;
}

export type FclassInfoState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: FclassInfo };

/* ------------------------------------------------------------------
   Theme derivation from a Geofabrik layer id
   ------------------------------------------------------------------ */

export function themeFromLayerId(layerId: string): string | null {
  const slash = layerId.indexOf("/");
  const filename = slash >= 0 ? layerId.slice(slash + 1) : layerId;
  let stem = filename
    .replace(/\.(gpkg|tif|shp|geojson)$/i, "")
    .toLowerCase();
  // Geofabrik shapefiles follow "gis_osm_<theme>[_a]_free_1". Strip both
  // ends so "gis_osm_landuse_a_free_1" resolves to "landuse".
  stem = stem.replace(/^gis_osm_/, "").replace(/_free(_\d+)?$/i, "");
  stem = stem.replace(/_a$/i, "");
  return stem || null;
}

/* ------------------------------------------------------------------
   Response mapping + session cache
   ------------------------------------------------------------------ */

function toFclassInfo(r: OsmFclassInfoResponse): FclassInfo {
  return {
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
  };
}

function cacheKey(theme: string, fclass: string): string {
  return `${theme.toLowerCase()}|${fclass.toLowerCase()}`;
}

const session = new Map<
  string,
  | { status: "pending"; promise: Promise<FclassInfo> }
  | { status: "ready"; info: FclassInfo }
  | { status: "error"; message: string }
>();

export function getCachedFclassInfo(
  theme: string | null,
  fclass: string,
): FclassInfo | undefined {
  if (!theme) return undefined;
  const entry = session.get(cacheKey(theme, fclass));
  return entry?.status === "ready" ? entry.info : undefined;
}

export function loadFclassInfo(
  theme: string | null,
  fclass: string,
): Promise<FclassInfo> {
  if (!theme) return Promise.reject(new Error("Unknown theme"));
  const key = cacheKey(theme, fclass);
  const existing = session.get(key);
  if (existing?.status === "ready") return Promise.resolve(existing.info);
  if (existing?.status === "pending") return existing.promise;
  const promise = fetchOsmFclassInfo(theme, fclass)
    .then((res) => {
      const info = toFclassInfo(res);
      session.set(key, { status: "ready", info });
      return info;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to load";
      session.set(key, { status: "error", message });
      throw err;
    });
  session.set(key, { status: "pending", promise });
  return promise;
}

/**
 * Prefetch a batch of (theme, fclass) pairs in one backend round-trip.
 * Used right after clipping, when the full set of layer+fclass values is
 * known — so every subsequent hover is a local cache hit.
 *
 * Pairs already resolved in this session are skipped.
 */
export async function prefetchFclassInfos(
  pairs: Array<{ theme: string; fclass: string }>,
  signal?: AbortSignal,
): Promise<void> {
  const pending = pairs.filter((p) => {
    const k = cacheKey(p.theme, p.fclass);
    const entry = session.get(k);
    return !entry || entry.status === "error";
  });
  if (pending.length === 0) return;

  // Mark as pending so concurrent hover requests piggy-back on the batch.
  const deferreds = new Map<
    string,
    { resolve: (info: FclassInfo) => void; reject: (err: unknown) => void }
  >();
  for (const p of pending) {
    const k = cacheKey(p.theme, p.fclass);
    const promise = new Promise<FclassInfo>((resolve, reject) => {
      deferreds.set(k, { resolve, reject });
    });
    session.set(k, { status: "pending", promise });
  }

  try {
    // Chunk to stay under the backend's 500-item cap, with some headroom.
    const CHUNK = 200;
    for (let i = 0; i < pending.length; i += CHUNK) {
      const chunk = pending.slice(i, i + CHUNK);
      const res = await batchFetchOsmFclassInfo(chunk, signal);
      for (const item of res.items) {
        const info = toFclassInfo(item);
        const k = cacheKey(item.theme, item.fclass);
        session.set(k, { status: "ready", info });
        deferreds.get(k)?.resolve(info);
        deferreds.delete(k);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prefetch failed";
    for (const [k, d] of deferreds) {
      session.set(k, { status: "error", message });
      d.reject(err);
    }
  } finally {
    // Any remaining deferreds (e.g. backend silently dropped an item) — fail them.
    for (const [k, d] of deferreds) {
      session.set(k, { status: "error", message: "Not returned by backend" });
      d.reject(new Error("Not returned by backend"));
    }
  }
}
