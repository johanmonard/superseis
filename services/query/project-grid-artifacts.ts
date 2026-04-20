import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchGridRegioningFiles,
  fetchGridStations,
  type GridArtifactResponse,
  type Ptype,
  type RegioningFilesResponse,
} from "@/services/api/project-grid-artifacts";

const STALE_FOREVER = Infinity;

export const gridArtifactKeys = {
  all: ["grid-artifacts"] as const,
  project: (projectId: number) => [...gridArtifactKeys.all, projectId] as const,
  stations: (projectId: number, ptype: Ptype) =>
    [...gridArtifactKeys.project(projectId), "stations", ptype] as const,
  regioning: (projectId: number) =>
    [...gridArtifactKeys.project(projectId), "regioning"] as const,
};

/** Cached grid stations for one ptype; kept until the mutation below invalidates. */
export function useGridStations(projectId: number | null, ptype: Ptype) {
  return useQuery<GridArtifactResponse, Error>({
    queryKey: gridArtifactKeys.stations(projectId ?? 0, ptype),
    queryFn: ({ signal }) => fetchGridStations(projectId!, ptype, signal),
    enabled: projectId !== null && projectId > 0,
    staleTime: STALE_FOREVER,
    gcTime: STALE_FOREVER,
    // A missing parquet (404) is a legitimate "no grid yet" state rather
    // than a transient failure — don't hammer the backend retrying.
    retry: false,
  });
}

export function useGridRegioning(projectId: number | null) {
  return useQuery<RegioningFilesResponse, Error>({
    queryKey: gridArtifactKeys.regioning(projectId ?? 0),
    queryFn: ({ signal }) => fetchGridRegioningFiles(projectId!, signal),
    enabled: projectId !== null && projectId > 0,
    staleTime: STALE_FOREVER,
    gcTime: STALE_FOREVER,
    retry: false,
  });
}

/** Invalidate both stations and regioning for a project. */
export function useInvalidateGridArtifacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: number) => {
      await qc.invalidateQueries({
        queryKey: gridArtifactKeys.project(projectId),
      });
    },
  });
}
