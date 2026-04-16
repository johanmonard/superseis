import { getRuntimeConfig } from '../config/runtimeConfig'
import { ApiError } from './client'

export interface ProjectFiles {
  polygons: string[]
  poi: string[]
  layers: string[]
  user_edits: string[]
  dem: string[]
}

export type FileCategory = 'polygons' | 'poi' | 'layers' | 'user_edits' | 'dem'

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

export async function fetchProjectFileRaw(
  projectId: number,
  category: FileCategory,
  filename: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const { apiBaseUrl } = getRuntimeConfig()
  const r = await fetch(
    `${apiBaseUrl}/project/${projectId}/files/${category}/${encodeURIComponent(filename)}/raw`,
    { credentials: 'include', signal },
  )
  if (!r.ok) throw new ApiError(`Failed to fetch ${filename}`, r.status)
  return r.arrayBuffer()
}

export async function saveProjectFileRaw(
  projectId: number,
  category: FileCategory,
  filename: string,
  data: ArrayBuffer,
): Promise<void> {
  const { apiBaseUrl } = getRuntimeConfig()
  const r = await fetch(
    `${apiBaseUrl}/project/${projectId}/files/${category}/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    },
  )
  if (!r.ok) throw new ApiError(`Save failed for ${filename}`, r.status)
}

export function projectDemTileUrl(
  projectId: number,
  demName: string,
): string {
  const { apiBaseUrl } = getRuntimeConfig()
  const base = demName.replace(/\.tif$/i, '')
  return `${apiBaseUrl}/project/${projectId}/files/dem-tiles/${encodeURIComponent(base)}/{z}/{x}/{y}`
}

export function projectDemManifestUrl(
  projectId: number,
  demName: string,
): string {
  const { apiBaseUrl } = getRuntimeConfig()
  const base = demName.replace(/\.tif$/i, '')
  return `${apiBaseUrl}/project/${projectId}/files/dem-tiles/${encodeURIComponent(base)}/manifest`
}
