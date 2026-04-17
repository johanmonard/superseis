import { requestJson } from "./client";

export interface LayerClassStat {
  fclass: string;
  value: number;
  pct: number;
}

export interface LayerStats {
  layer: string;
  geometry_type: "polygon" | "line" | "point" | "unknown";
  field: string;
  field_present: boolean;
  unit: "km^2" | "km" | "count";
  total_inside: number;
  polygon_area_km2: number;
  by_class: LayerClassStat[];
}

export interface LayerAnalysisResult {
  epsg_used: number;
  epsg_auto: boolean;
  polygon_area_km2: number;
  stats: LayerStats[];
}

export interface AnalyzeLayersRequest {
  polygon_file?: string | null;
  layers?: string[] | null;
  source_field?: string;
}

export function analyzeLayers(
  projectId: number,
  body: AnalyzeLayersRequest = {},
  signal?: AbortSignal,
): Promise<LayerAnalysisResult> {
  return requestJson<LayerAnalysisResult>(`/project/${projectId}/layers/analyze`, {
    method: "POST",
    body: {
      polygon_file: body.polygon_file ?? null,
      layers: body.layers ?? null,
      source_field: body.source_field ?? "fclass",
    },
    signal,
    timeoutMs: 120_000,
  });
}
