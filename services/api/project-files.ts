import { getRuntimeConfig } from '../config/runtimeConfig'
import { ApiError } from './client'

export interface ProjectFiles {
  polygons: string[]
  poi: string[]
  layers: string[]
}

export type FileCategory = 'polygons' | 'poi' | 'layers'

export function fetchProjectFiles(
  projectId: number,
  signal?: AbortSignal,
): Promise<ProjectFiles> {
  const { apiBaseUrl } = getRuntimeConfig()
  return fetch(`${apiBaseUrl}/project/${projectId}/files`, {
    credentials: 'include',
    signal,
  }).then(async (r) => {
    if (!r.ok) throw new ApiError('Failed to fetch files', r.status)
    return r.json()
  })
}

export async function uploadProjectFile(
  projectId: number,
  category: FileCategory,
  file: File,
): Promise<{ filename: string; category: string }> {
  const { apiBaseUrl } = getRuntimeConfig()
  const form = new FormData()
  form.append('file', file)
  const r = await fetch(`${apiBaseUrl}/project/${projectId}/files/${category}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new ApiError(
      body?.detail ?? 'Upload failed',
      r.status,
      body,
    )
  }
  return r.json()
}

export async function fetchFileGeoJson(
  projectId: number,
  category: FileCategory,
  filename: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const { apiBaseUrl } = getRuntimeConfig()
  const r = await fetch(
    `${apiBaseUrl}/project/${projectId}/files/${category}/${encodeURIComponent(filename)}/geojson`,
    { credentials: 'include', signal },
  )
  if (!r.ok) throw new ApiError('Failed to fetch GeoJSON', r.status)
  return r.json()
}

export async function deleteProjectFile(
  projectId: number,
  category: FileCategory,
  filename: string,
): Promise<void> {
  const { apiBaseUrl } = getRuntimeConfig()
  const r = await fetch(
    `${apiBaseUrl}/project/${projectId}/files/${category}/${encodeURIComponent(filename)}`,
    { method: 'DELETE', credentials: 'include' },
  )
  if (!r.ok) {
    throw new ApiError('Delete failed', r.status)
  }
}
