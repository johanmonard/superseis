import { getRuntimeConfig } from "../config/runtimeConfig";
import { requestJson } from "./client";

export const FOLD_COLORMAPS = [
  "viridis",
  "plasma",
  "inferno",
  "magma",
  "turbo",
  "seismic",
] as const;
export type FoldColormap = (typeof FOLD_COLORMAPS)[number];

export interface FoldParams {
  inline_bin: number;
  crossline_bin: number;
  offset_min: number;
  offset_max: number;
  active_lines: number | null;
  active_stations: number | null;
}

export interface FoldMetaResponse {
  option_name: string;
  tif: string;
  tiles_dir: string;
  min_zoom: number;
  max_zoom: number;
  /** [west, south, east, north] WGS84 envelope of the fold raster. */
  bounds: [number, number, number, number];
  value_min: number;
  value_max: number;
  colormap: FoldColormap;
  width: number;
  height: number;
  tiles_written: number;
  params: FoldParams;
}

export interface RunFoldRequest {
  inline_bin: number;
  crossline_bin: number;
  offset_min: number;
  offset_max: number;
  colormap: FoldColormap;
}

export function runFold(
  projectId: number,
  body: RunFoldRequest,
  signal?: AbortSignal,
): Promise<FoldMetaResponse> {
  return requestJson<FoldMetaResponse>(
    `/project/${projectId}/artifacts/fold`,
    { method: "POST", body, signal, timeoutMs: 600_000 },
  );
}

export function fetchFoldMeta(
  projectId: number,
  signal?: AbortSignal,
): Promise<FoldMetaResponse> {
  return requestJson<FoldMetaResponse>(
    `/project/${projectId}/artifacts/fold/meta`,
    { signal },
  );
}

/**
 * Build the ``{z}/{x}/{y}`` tile URL template for deck.gl ``TileLayer``.
 *
 * ``version`` is appended as ``?v=…`` so a re-run of Process fold — which
 * keeps the URL path but overwrites the tile PNGs — invalidates the
 * browser + TileLayer caches instantly instead of serving stale tiles.
 */
export function foldTilesUrlTemplate(
  projectId: number,
  version: string,
): string {
  const { apiBaseUrl } = getRuntimeConfig();
  return (
    `${apiBaseUrl}/project/${projectId}/artifacts/fold/tiles/{z}/{x}/{y}` +
    `?v=${encodeURIComponent(version)}`
  );
}

/**
 * Authenticated tile fetch that returns an ImageBitmap deck.gl can render.
 * The browser's built-in image loader doesn't forward session cookies, so
 * TileLayer's default URL-based fetch would 403. Pull bytes through the
 * session-cookie-carrying path and hand the bitmap to the layer.
 *
 * TileLayer cancels in-flight requests when a tile scrolls off-screen —
 * the abort surfaces as an ``AbortError`` / ``TypeError('Failed to fetch')``
 * depending on the browser. Treat either as "gone, nothing to draw" and
 * return ``null`` so the error boundary doesn't flag a normal cancel as
 * a render-breaking failure. Real HTTP errors still throw.
 *
 * 404 is the documented "no data on this tile" signal (see backend) —
 * also returned as ``null`` so TileLayer renders it as transparent.
 */
export async function fetchFoldTileBitmap(
  url: string,
  signal?: AbortSignal,
): Promise<ImageBitmap | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      signal,
    });
  } catch (err) {
    if (
      err instanceof DOMException && err.name === "AbortError"
      || (err instanceof TypeError && signal?.aborted)
    ) {
      return null;
    }
    throw err;
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Fold tile fetch failed (${response.status})`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob);
}
