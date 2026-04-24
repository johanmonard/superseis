import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchFoldMeta,
  runFold,
  type FoldMetaResponse,
  type RunFoldRequest,
} from "@/services/api/project-fold";

const STALE_FOREVER = Infinity;

export const foldKeys = {
  all: ["fold-artifacts"] as const,
  project: (projectId: number) => [...foldKeys.all, projectId] as const,
  meta: (projectId: number) => [...foldKeys.project(projectId), "meta"] as const,
};

export function useFoldMeta(projectId: number | null) {
  return useQuery<FoldMetaResponse, Error>({
    queryKey: foldKeys.meta(projectId ?? 0),
    queryFn: ({ signal }) => fetchFoldMeta(projectId!, signal),
    enabled: projectId !== null && projectId > 0,
    staleTime: STALE_FOREVER,
    gcTime: STALE_FOREVER,
    // Same shape as grid-artifacts: a 404 just means "no fold map yet".
    retry: false,
  });
}

export function useRunFold(projectId: number | null) {
  const qc = useQueryClient();
  return useMutation<FoldMetaResponse, Error, RunFoldRequest>({
    mutationFn: async (body) => {
      if (projectId === null) {
        throw new Error("No active project");
      }
      return runFold(projectId, body);
    },
    onSuccess: async (meta) => {
      if (projectId === null) return;
      qc.setQueryData(foldKeys.meta(projectId), meta);
    },
  });
}

/** Drop the cached fold meta so the viewport refetches for the active option. */
export function useInvalidateFoldArtifacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: number) => {
      await qc.invalidateQueries({
        queryKey: foldKeys.project(projectId),
      });
    },
  });
}
