import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchOffsetStations,
  type OffsetArtifactResponse,
  type Ptype,
} from "@/services/api/project-offset-artifacts";

const STALE_FOREVER = Infinity;

export const offsetArtifactKeys = {
  all: ["offset-artifacts"] as const,
  project: (projectId: number) => [...offsetArtifactKeys.all, projectId] as const,
  stations: (projectId: number, ptype: Ptype) =>
    [...offsetArtifactKeys.project(projectId), "stations", ptype] as const,
};

/** Cached offset stations for one ptype; kept until explicitly invalidated. */
export function useOffsetStations(projectId: number | null, ptype: Ptype) {
  return useQuery<OffsetArtifactResponse, Error>({
    queryKey: offsetArtifactKeys.stations(projectId ?? 0, ptype),
    queryFn: ({ signal }) => fetchOffsetStations(projectId!, ptype, signal),
    enabled: projectId !== null && projectId > 0,
    staleTime: STALE_FOREVER,
    gcTime: STALE_FOREVER,
    // A missing parquet (404) is a legitimate "no offsets yet" state rather
    // than a transient failure — don't hammer the backend retrying.
    retry: false,
  });
}

export function useInvalidateOffsetArtifacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: number) => {
      await qc.invalidateQueries({
        queryKey: offsetArtifactKeys.project(projectId),
      });
    },
  });
}
