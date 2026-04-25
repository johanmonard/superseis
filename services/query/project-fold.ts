import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchFoldMeta,
  runFold,
  type FoldMetaResponse,
  type FoldRangeKey,
  type FoldSource,
  type RunFoldRequest,
} from "@/services/api/project-fold";
import { projectFileKeys } from "@/services/query/project-files";

const STALE_FOREVER = Infinity;

/** Stable string for a range key so React Query keys stay shallow-comparable. */
function _rangeKeyPart(range?: FoldRangeKey): string {
  if (!range) return "latest";
  const opt = range.option ? `:${range.option}` : "";
  return `${range.omin}-${range.omax}${opt}`;
}

export const foldKeys = {
  all: ["fold-artifacts"] as const,
  project: (projectId: number) => [...foldKeys.all, projectId] as const,
  source: (projectId: number, source: FoldSource) =>
    [...foldKeys.project(projectId), source] as const,
  meta: (
    projectId: number,
    source: FoldSource,
    range?: FoldRangeKey,
  ) =>
    [...foldKeys.source(projectId, source), "meta", _rangeKeyPart(range)] as const,
};

export function useFoldMeta(
  projectId: number | null,
  source: FoldSource = "grid",
  range?: FoldRangeKey,
  enabled: boolean = true,
) {
  return useQuery<FoldMetaResponse, Error>({
    queryKey: foldKeys.meta(projectId ?? 0, source, range),
    queryFn: ({ signal }) =>
      fetchFoldMeta(projectId!, signal, source, range),
    enabled: enabled && projectId !== null && projectId > 0,
    staleTime: STALE_FOREVER,
    gcTime: STALE_FOREVER,
    // Same shape as grid-artifacts: a 404 just means "no fold map yet".
    retry: false,
  });
}

export function useRunFold(
  projectId: number | null,
  source: FoldSource = "grid",
) {
  const qc = useQueryClient();
  return useMutation<FoldMetaResponse, Error, RunFoldRequest>({
    mutationFn: async (body) => {
      if (projectId === null) {
        throw new Error("No active project");
      }
      return runFold(projectId, body, undefined, source);
    },
    onSuccess: async (meta, body) => {
      if (projectId === null) return;
      // Mirror the result into both cache slots: the unkeyed "latest"
      // entry the grid + offsets viewports read, and the range-keyed
      // entry the Files page picker reads. Saves a refetch after
      // Process fold lands.
      qc.setQueryData(foldKeys.meta(projectId, source), meta);
      qc.setQueryData(
        foldKeys.meta(projectId, source, {
          omin: body.offset_min,
          omax: body.offset_max,
        }),
        meta,
      );
      // Bust the file-list cache so the new range-stamped fold .tif
      // shows up in the Files page seismic section without needing a
      // page reload.
      await qc.invalidateQueries({
        queryKey: projectFileKeys.project(projectId),
      });
    },
  });
}

/** Drop cached fold metas (both sources) so the viewport refetches. */
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
