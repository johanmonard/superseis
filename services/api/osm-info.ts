import { requestJson } from "./client";

export type OsmFclassInfoResponse = {
  theme: string;
  fclass: string;
  osm_key: string;
  osm_value: string;
  description: string | null;
  wiki_url: string;
  image_url: string | null;
  usage_count: number | null;
  on_node: boolean;
  on_way: boolean;
  on_area: boolean;
  on_relation: boolean;
  fetched_at: string;
  cached: boolean;
};

export function fetchOsmFclassInfo(
  theme: string,
  fclass: string,
  signal?: AbortSignal,
): Promise<OsmFclassInfoResponse> {
  return requestJson<OsmFclassInfoResponse>("/osm/fclass-info", {
    query: { theme, fclass },
    signal,
    authMode: "hybrid",
  });
}

export function batchFetchOsmFclassInfo(
  items: Array<{ theme: string; fclass: string }>,
  signal?: AbortSignal,
): Promise<{ items: OsmFclassInfoResponse[] }> {
  return requestJson<{ items: OsmFclassInfoResponse[] }>(
    "/osm/fclass-info/batch",
    {
      method: "POST",
      body: { items },
      signal,
      authMode: "hybrid",
    },
  );
}

export function listCachedOsmFclassInfo(
  signal?: AbortSignal,
): Promise<{ items: OsmFclassInfoResponse[] }> {
  return requestJson<{ items: OsmFclassInfoResponse[] }>(
    "/osm/fclass-info/all",
    { signal, authMode: "hybrid" },
  );
}
