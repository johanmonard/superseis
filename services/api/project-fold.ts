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

export interface FoldDesign {
  key: number;
  rpi: number;
  spi: number;
  active_rl: number;
  active_rp: number;
  polygon_stem: string;
  inline_bin: number;
  crossline_bin: number;
  inline_upsample: number;
  crossline_upsample: number;
}

/**
 * Fold raster source. ``grid`` reads the theoretical grid parquets;
 * ``offsets`` reads the post-offset parquets while keeping the BinGrid
 * origin anchored on the theoretical coordinates.
 */
export type FoldSource = "grid" | "offsets";

/** One chunk of the fold raster, anchored at four UTM-projected
 *  [lng, lat] corners (TL/TR/BR/BL pixel order). PNG bytes are fetched
 *  on demand from ``/raster/chunk/{chunk_id}``. */
export interface FoldImageChunk {
  chunk_id: string;
  row_start: number;
  row_end: number;
  col_start: number;
  col_end: number;
  corners_wgs84: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
}

export interface FoldMetaResponse {
  option_name: string;
  source?: FoldSource;
  tif: string;
  tiles_dir: string;
  min_zoom: number;
  max_zoom: number;
  /** [west, south, east, north] WGS84 envelope of the fold raster. */
  bounds: [number, number, number, number];
  /** Four [lng, lat] WGS84 corners of the (rotated) source raster,
   *  TL/TR/BR/BL pixel order. Useful for outlining the survey extent. */
  corners_wgs84?: [number, number][];
  /** 8×8 chunk subdivision used by the Files page's image overlay.
   *  Each chunk is a small UTM-axis-aligned sub-raster anchored at four
   *  UTM-projected corners — that keeps the cells UTM-aligned in the
   *  rendered map (matching the grid mesh) and limits MapLibre's
   *  linear-interpolation error to sub-meter inside any one chunk. */
  image_chunks?: FoldImageChunk[];
  value_min: number;
  value_max: number;
  colormap: FoldColormap;
  width: number;
  height: number;
  tiles_written: number;
  params: FoldParams;
  /** Per-design contributors stacked into the final fold. */
  designs?: FoldDesign[];
  gcd_rpi?: number;
  gcd_spi?: number;
  /** Hash of the bin-count inputs (all but the colormap). */
  data_fingerprint?: string;
  /** Hash of the full render inputs (data + colormap). */
  render_fingerprint?: string;
  /** True when this response came from an existing on-disk fold. */
  cached?: boolean;
}

export interface RunFoldRequest {
  offset_min: number;
  offset_max: number;
  colormap: FoldColormap;
}

function _foldPrefix(source: FoldSource): "fold" | "offsets-fold" {
  return source === "offsets" ? "offsets-fold" : "fold";
}

/** Optional pin to a specific historical render — both fields required
 * together. When omitted, the backend resolves the most recent render
 * for the active option / requested source.
 */
export interface FoldRangeKey {
  omin: number;
  omax: number;
  /** Override the active grid option — Files page picker uses this to
   *  show folds for non-active options. */
  option?: string;
}

function _rangeQuery(range?: FoldRangeKey): string {
  if (!range) return "";
  const params = new URLSearchParams({
    omin: String(range.omin),
    omax: String(range.omax),
  });
  if (range.option) params.set("option", range.option);
  return `?${params.toString()}`;
}

export function runFold(
  projectId: number,
  body: RunFoldRequest,
  signal?: AbortSignal,
  source: FoldSource = "grid",
): Promise<FoldMetaResponse> {
  return requestJson<FoldMetaResponse>(
    `/project/${projectId}/artifacts/${_foldPrefix(source)}`,
    { method: "POST", body, signal, timeoutMs: 600_000 },
  );
}

export function fetchFoldMeta(
  projectId: number,
  signal?: AbortSignal,
  source: FoldSource = "grid",
  range?: FoldRangeKey,
): Promise<FoldMetaResponse> {
  return requestJson<FoldMetaResponse>(
    `/project/${projectId}/artifacts/${_foldPrefix(source)}/meta${_rangeQuery(range)}`,
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
/**
 * URL of one chunk of the fold raster (a colourised PNG at native
 * source resolution). Combined with the chunk's four UTM-projected
 * corners (from ``meta.image_chunks``), the Files page anchors each
 * chunk as its own MapLibre ``image`` source — UTM-aligned cells,
 * sub-meter projection error per chunk.
 */
export function foldRasterChunkUrl(
  projectId: number,
  chunkId: string,
  version: string,
  source: FoldSource = "grid",
  range?: FoldRangeKey,
): string {
  const { apiBaseUrl } = getRuntimeConfig();
  const params = new URLSearchParams({ v: version });
  if (range) {
    params.set("omin", String(range.omin));
    params.set("omax", String(range.omax));
    if (range.option) params.set("option", range.option);
  }
  return (
    `${apiBaseUrl}/project/${projectId}/artifacts/${_foldPrefix(source)}/raster/chunk/${chunkId}`
    + `?${params.toString()}`
  );
}

export function foldTilesUrlTemplate(
  projectId: number,
  version: string,
  source: FoldSource = "grid",
  range?: FoldRangeKey,
): string {
  const { apiBaseUrl } = getRuntimeConfig();
  const params = new URLSearchParams({ v: version });
  if (range) {
    params.set("omin", String(range.omin));
    params.set("omax", String(range.omax));
    if (range.option) params.set("option", range.option);
  }
  return (
    `${apiBaseUrl}/project/${projectId}/artifacts/${_foldPrefix(source)}/tiles/{z}/{x}/{y}` +
    `?${params.toString()}`
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
