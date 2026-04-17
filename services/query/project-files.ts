import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import {
  deleteProjectFile,
  fetchProjectFileRaw,
  fetchProjectFiles,
  fetchFileGeoJsonWithSize,
  saveProjectFileRaw,
  uploadProjectFile,
  type FileCategory,
  type FileGeoJsonBundle,
} from '../api/project-files'

export const projectFileKeys = {
  all: ['project-files'] as const,
  project: (projectId: number) => [...projectFileKeys.all, projectId] as const,
}

export const fileGeoJsonKey = (
  projectId: number,
  category: FileCategory,
  filename: string,
) => ['fileGeoJson', projectId, category, filename] as const

export const fileRawKey = (
  projectId: number,
  category: FileCategory,
  filename: string,
) => ['fileRaw', projectId, category, filename] as const

const CACHED_FILE_KEYS = new Set(['fileGeoJson', 'fileRaw'])

export function useProjectFiles(projectId: number | null) {
  return useQuery({
    queryKey: projectFileKeys.project(projectId ?? 0),
    queryFn: ({ signal }) => fetchProjectFiles(projectId!, signal),
    enabled: projectId !== null && projectId > 0,
  })
}

export interface FileRef {
  category: FileCategory
  filename: string
}

export function useProjectFilesGeoJson(
  projectId: number | null,
  files: readonly FileRef[],
) {
  return useQueries({
    queries: files.map((f) => ({
      queryKey: fileGeoJsonKey(projectId ?? 0, f.category, f.filename),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchFileGeoJsonWithSize(projectId!, f.category, f.filename, signal),
      enabled: projectId !== null && projectId > 0,
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  })
}

export function useUploadProjectFile(projectId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, file }: { category: FileCategory; file: File }) =>
      uploadProjectFile(projectId!, category, file),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectFileKeys.project(projectId ?? 0) }),
  })
}

export function useDeleteProjectFile(projectId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, filename }: { category: FileCategory; filename: string }) =>
      deleteProjectFile(projectId!, category, filename),
    onSuccess: (_, { category, filename }) => {
      qc.invalidateQueries({ queryKey: projectFileKeys.project(projectId ?? 0) })
      if (projectId != null && projectId > 0) {
        qc.removeQueries({ queryKey: fileGeoJsonKey(projectId, category, filename) })
        qc.removeQueries({ queryKey: fileRawKey(projectId, category, filename) })
      }
    },
  })
}

export function useSaveProjectFileRaw(projectId: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ category, filename, data }: { category: FileCategory; filename: string; data: ArrayBuffer }) =>
      saveProjectFileRaw(projectId!, category, filename, data),
    onSuccess: (_, { category, filename }) => {
      if (projectId != null && projectId > 0) {
        qc.invalidateQueries({ queryKey: fileGeoJsonKey(projectId, category, filename) })
        qc.invalidateQueries({ queryKey: fileRawKey(projectId, category, filename) })
      }
    },
  })
}

/**
 * Fetches (or returns from cache) the raw .gpkg bytes for a file. Lives in the
 * same react-query cache as the geojson variant so the preload toggle and
 * cross-page persistence apply uniformly. ArrayBuffer payloads are large but
 * only a single reference per key is kept.
 */
export async function ensureProjectFileRaw(
  qc: ReturnType<typeof useQueryClient>,
  projectId: number,
  category: FileCategory,
  filename: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return qc.ensureQueryData({
    queryKey: fileRawKey(projectId, category, filename),
    queryFn: ({ signal: s }) => fetchProjectFileRaw(projectId, category, filename, s ?? signal),
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/**
 * Prunes cached GeoJSON and raw-file entries that belong to projects other
 * than the active one. Keeps memory usage bounded when the user hops between
 * projects.
 */
export function useGeoJsonProjectScopePrune(activeProjectId: number | null) {
  const qc = useQueryClient()
  useEffect(() => {
    qc.removeQueries({
      predicate: (query) => {
        const [root, pid] = query.queryKey as [unknown, unknown, ...unknown[]]
        return (
          typeof root === 'string' &&
          CACHED_FILE_KEYS.has(root) &&
          pid !== (activeProjectId ?? 0)
        )
      },
    })
  }, [activeProjectId, qc])
}

export type { FileGeoJsonBundle }
