import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchProjectSection,
  saveProjectSection,
  type ProjectSectionData,
} from '../api/project-sections'

export const sectionKeys = {
  all: ['project-sections'] as const,
  project: (projectId: number) =>
    [...sectionKeys.all, projectId] as const,
  detail: (projectId: number, section: string) =>
    [...sectionKeys.project(projectId), section] as const,
}

export function useProjectSection(projectId: number | null, section: string) {
  return useQuery({
    queryKey: sectionKeys.detail(projectId ?? 0, section),
    queryFn: ({ signal }) => fetchProjectSection(projectId!, section, signal),
    enabled: projectId !== null && projectId > 0,
  })
}

export function useSaveProjectSection(projectId: number | null, section: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      saveProjectSection(projectId!, section, data),
    onSuccess: (saved) => {
      qc.setQueryData<ProjectSectionData>(
        sectionKeys.detail(projectId ?? 0, section),
        saved,
      )
    },
  })
}
