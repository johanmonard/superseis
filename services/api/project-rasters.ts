import { getRuntimeConfig } from "../config/runtimeConfig";
import { ApiError, requestJson } from "./client";

export type RasterKind = "layers" | "mappers";

export interface RasterItem {
  kind: RasterKind;
  key: string;
  name: string;
  file: string;
  shape: number[];
  referential: string;
}

export interface RasterListResponse {
  layers: RasterItem[];
  mappers: RasterItem[];
}

export function listProjectRasters(
  projectId: number,
  signal?: AbortSignal,
): Promise<RasterListResponse> {
  return requestJson<RasterListResponse>(
    `/project/${projectId}/rasters`,
    { signal },
  );
}

export interface RasterPayload {
  shape: [number, number];
  dtype: string;
  min: number;
  max: number;
  data: Int16Array;
}

function parseShape(header: string | null): [number, number] | null {
  if (!header) return null;
  const parts = header.split(",").map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return [parts[0], parts[1]];
}

export async function fetchProjectRaster(
  projectId: number,
  kind: RasterKind,
  name: string,
  signal?: AbortSignal,
): Promise<RasterPayload> {
  const { apiBaseUrl } = getRuntimeConfig();
  const url = new URL(
    `/project/${projectId}/rasters/${kind}/${encodeURIComponent(name)}`,
    apiBaseUrl,
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new ApiError(`Raster fetch failed (${response.status})`, response.status);
  }

  const shape = parseShape(response.headers.get("X-Raster-Shape"));
  if (!shape) {
    throw new ApiError("Raster response missing X-Raster-Shape", 500);
  }
  const dtype = response.headers.get("X-Raster-Dtype") ?? "int16";
  const minHdr = response.headers.get("X-Raster-Min");
  const maxHdr = response.headers.get("X-Raster-Max");
  const min = minHdr !== null ? Number.parseInt(minHdr, 10) : 0;
  const max = maxHdr !== null ? Number.parseInt(maxHdr, 10) : 0;

  if (dtype !== "int16") {
    throw new ApiError(`Unexpected raster dtype: ${dtype}`, 500);
  }

  const buf = await response.arrayBuffer();
  const expected = shape[0] * shape[1] * 2;
  if (buf.byteLength !== expected) {
    throw new ApiError(
      `Raster byte size mismatch: expected ${expected}, got ${buf.byteLength}`,
      500,
    );
  }
  return { shape, dtype, min, max, data: new Int16Array(buf) };
}
