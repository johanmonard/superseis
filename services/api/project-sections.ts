import { requestJson } from './client'

export interface ProjectSectionData {
  section: string
  data: Record<string, unknown>
  updated_at: string | null
}

export interface SaveProjectSectionOptions {
  keepalive?: boolean
}

export function fetchProjectSection(
  projectId: number,
  section: string,
  signal?: AbortSignal,
): Promise<ProjectSectionData> {
  return requestJson<ProjectSectionData>(
    `/project/${projectId}/sections/${section}`,
    { signal },
  )
}

export function saveProjectSection(
  projectId: number,
  section: string,
  data: Record<string, unknown>,
  options: SaveProjectSectionOptions = {},
): Promise<ProjectSectionData> {
  return requestJson<ProjectSectionData>(
    `/project/${projectId}/sections/${section}`,
    { method: 'PUT', body: data, keepalive: options.keepalive },
  )
}

export function fetchAllProjectSections(
  projectId: number,
  signal?: AbortSignal,
): Promise<ProjectSectionData[]> {
  return requestJson<ProjectSectionData[]>(
    `/project/${projectId}/sections`,
    { signal },
  )
}
