import { requestJson } from "./client";

export type Ptype = "r" | "s";

export interface OffsetPoint {
  lon_theo: number;
  lat_theo: number;
  lon_offs: number;
  lat_offs: number;
  /** Snapped coords; null when the point wasn't snapped to a GIS feature. */
  lon_offs_snap: number | null;
  lat_offs_snap: number | null;
  i_theo: number;
  j_theo: number;
  design_reg: number;
  offset: boolean;
  skipped: boolean;
}

export interface OffsetArtifactResponse {
  ptype: Ptype;
  count: number;
  offset_count: number;
  skipped_count: number;
  snapped_count: number;
  bbox: [number, number, number, number] | null;
  points: OffsetPoint[];
}

export function fetchOffsetStations(
  projectId: number,
  ptype: Ptype,
  signal?: AbortSignal,
): Promise<OffsetArtifactResponse> {
  return requestJson<OffsetArtifactResponse>(
    `/project/${projectId}/artifacts/offsets/${ptype}`,
    { signal },
  );
}
