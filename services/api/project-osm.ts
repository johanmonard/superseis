import { getRuntimeConfig } from '../config/runtimeConfig'

export interface OsmDownloadRequest {
  polygonFile: string
  skipIfExists: boolean
}

export interface OsmClipRequest {
  polygonFile: string
  layers: string[]
}

export interface OsmProgressEvent {
  progress: number
  total: number
  message: string
  done?: boolean
  ok?: boolean
  layers?: string[]
  files?: string[]
  sizeMb?: number
}

/**
 * Stream an SSE endpoint, calling `onProgress` for each event.
 * Returns the final event (the one with `done: true`).
 */
async function streamOsmAction(
  projectId: number,
  action: 'download' | 'clip',
  body: unknown,
  onProgress: (evt: OsmProgressEvent) => void,
  signal?: AbortSignal,
): Promise<OsmProgressEvent> {
  const { apiBaseUrl } = getRuntimeConfig()
  const url = `${apiBaseUrl}/project/${projectId}/osm/${action}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ||
        `OSM ${action} failed (${response.status})`,
    )
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastEvent: OsmProgressEvent | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Parse SSE lines: "data: {...}\n\n"
    const lines = buffer.split('\n\n')
    buffer = lines.pop()! // keep incomplete chunk
    for (const line of lines) {
      const match = line.match(/^data:\s*(.+)$/m)
      if (match) {
        const evt: OsmProgressEvent = JSON.parse(match[1])
        lastEvent = evt
        onProgress(evt)
      }
    }
  }

  if (!lastEvent) {
    throw new Error(`No events received from OSM ${action}`)
  }
  return lastEvent
}

export function downloadOsmStream(
  projectId: number,
  body: OsmDownloadRequest,
  onProgress: (evt: OsmProgressEvent) => void,
  signal?: AbortSignal,
): Promise<OsmProgressEvent> {
  return streamOsmAction(projectId, 'download', body, onProgress, signal)
}

export function clipOsmStream(
  projectId: number,
  body: OsmClipRequest,
  onProgress: (evt: OsmProgressEvent) => void,
  signal?: AbortSignal,
): Promise<OsmProgressEvent> {
  return streamOsmAction(projectId, 'clip', body, onProgress, signal)
}
