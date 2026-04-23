import { requestJson } from "./client";

export interface CrsProjectionParam {
  name: string;
  value: number | string | null;
  unit: string | null;
}

export interface CrsInfoResponse {
  epsg: number;
  name: string;
  type_name: string;
  unit: string;
  is_projected: boolean;
  is_deprecated: boolean;
  area_name: string | null;
  area_west: number | null;
  area_south: number | null;
  area_east: number | null;
  area_north: number | null;
  datum_name: string | null;
  datum_type: string | null;
  ellipsoid_name: string | null;
  ellipsoid_a: number | null;
  ellipsoid_b: number | null;
  ellipsoid_inv_flat: number | null;
  prime_meridian_name: string | null;
  prime_meridian_lon: number | null;
  projection_method: string | null;
  projection_params: CrsProjectionParam[] | null;
  proj4text: string | null;
  fetched_at: string;
  cached: boolean;
}

export function fetchCrsInfo(
  epsg: number,
  signal?: AbortSignal,
): Promise<CrsInfoResponse> {
  return requestJson<CrsInfoResponse>(`/crs/${epsg}`, {
    signal,
    authMode: "hybrid",
  });
}
