import { requestJson } from "./client";

export interface DesignAnalyzeRequest {
  rpi: number;
  rli: number;
  spi: number;
  sli: number;
  active_rl: number;
  active_rp: number;
  sp_salvo: number;
  hist_bins?: number;
  rose_nr?: number;
  rose_ntheta?: number;
}

export interface DesignAnalyzeResponse {
  layout: {
    receiver_count: number;
    source_count: number;
    live_channel_count: number;
    trace_count: number;
    bin_size: [number, number];
    patch_size: [number, number];
    salvo_size: [number, number];
    moveup: [number, number];
    receiver_aspect_ratio: number;
  };
  fold: {
    peak: number;
    nominal: number;
    inline_nominal: number;
    crossline_nominal: number;
  };
  offsets: {
    minimum: number;
    maximum: number;
    maximum_inline: number;
    maximum_crossline: number;
    largest_minimum: number;
    smallest_maximum: number;
  };
  taper: {
    inline_distance: number;
    crossline_distance: number;
  };
  histogram: {
    offset_edges: number[];
    offset_centers: number[];
    counts: number[];
  };
  rose: {
    theta_edges: number[];
    radius_edges: number[];
    counts: number[][];
    r_max: number;
  };
}

export function analyzeDesign(
  projectId: number,
  body: DesignAnalyzeRequest,
  signal?: AbortSignal,
): Promise<DesignAnalyzeResponse> {
  return requestJson<DesignAnalyzeResponse>(
    `/project/${projectId}/design/analyze`,
    { method: "POST", body, signal },
  );
}
