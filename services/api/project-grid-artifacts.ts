import { requestJson } from "./client";

export type Ptype = "r" | "s";

export interface GridPoint {
  lon: number;
  lat: number;
  i_theo: number;
  j_theo: number;
  design_reg: number;
}

export interface GridArtifactResponse {
  ptype: Ptype;
  count: number;
  bbox: [number, number, number, number] | null;
  points: GridPoint[];
}

export function fetchGridStations(
  projectId: number,
  ptype: Ptype,
  signal?: AbortSignal,
): Promise<GridArtifactResponse> {
  return requestJson<GridArtifactResponse>(
    `/project/${projectId}/artifacts/grid/${ptype}`,
    { signal },
  );
}

export interface RegioningFilesResponse {
  active_grid: string | null;
  files: string[];
}

export function fetchGridRegioningFiles(
  projectId: number,
  signal?: AbortSignal,
): Promise<RegioningFilesResponse> {
  return requestJson<RegioningFilesResponse>(
    `/project/${projectId}/artifacts/grid/regioning-files`,
    { signal },
  );
}
