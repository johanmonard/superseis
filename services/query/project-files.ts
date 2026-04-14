import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteProjectFile,
  fetchProjectFiles,
  uploadProjectFile,
  type FileCategory,
} from '../api/project-files'

export const projectFileKeys = {
  all: ['project-files'] as const,
  project: (projectId: number) => [...projectFileKeys.all, projectId] as const,
}

export function useProjectFiles(projectId: number | null) {
  return useQuery({
    queryKey: projectFileKeys.project(projectId ?? 0),
    queryFn: ({ signal }) => fetchProjectFiles(projectId!, signal),
    enabled: projectId !== null && projectId > 0,
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: projectFileKeys.project(projectId ?? 0) }),
  })
}
