import { getRuntimeConfig } from '../config/runtimeConfig'

type QueryValue = string | number | boolean
type QueryParams = Record<string, QueryValue | QueryValue[] | undefined>

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: QueryParams
  body?: unknown
  authMode?: 'session' | 'apiKey' | 'hybrid'
  keepalive?: boolean
  signal?: AbortSignal
  timeoutMs?: number
}

export class ApiError extends Error {
  public readonly status: number
  public readonly details: unknown

  public constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

function buildUrl(path: string, query: QueryParams | undefined): string {
  const { apiBaseUrl } = getRuntimeConfig()
  const url = new URL(path.startsWith('/') ? path : `/${path}`, apiBaseUrl)

  if (query) {
    Object.entries(query).forEach(([key, rawValue]) => {
      if (rawValue === undefined) {
        return
      }

      if (Array.isArray(rawValue)) {
        rawValue.forEach((entry) => {
          url.searchParams.append(key, String(entry))
        })
      } else {
        url.searchParams.set(key, String(rawValue))
      }
    })
  }

  return url.toString()
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { apiKey, requestTimeoutMs } = getRuntimeConfig()
  const controller = new AbortController()
  const timeout = options.timeoutMs ?? requestTimeoutMs
  const timeoutId = window.setTimeout(() => controller.abort(), timeout)

  const abortListener = () => controller.abort()
  options.signal?.addEventListener('abort', abortListener, { once: true })

  const method = options.method ?? 'GET'
  const authMode = options.authMode ?? 'session'
  const headers = new Headers({
    Accept: 'application/json',
  })

  const includeApiKeyHeader = authMode === 'apiKey' || authMode === 'hybrid'
  if (includeApiKeyHeader && apiKey.trim()) {
    headers.set('X-API-Key', apiKey)
  }

  if (method !== 'GET' && options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    if (authMode === 'apiKey' && !apiKey.trim()) {
      throw new ApiError(
        'API key authentication mode was requested but NEXT_PUBLIC_API_KEY is not configured.',
        500,
      )
    }

    const response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: authMode === 'session' || authMode === 'hybrid' ? 'include' : 'omit',
      keepalive: options.keepalive,
      signal: controller.signal,
      body:
        method === 'GET' || options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    })

    if (!response.ok) {
      const details = await parseErrorBody(response)
      const message = `API request failed with status ${response.status}`
      throw new ApiError(message, response.status, details)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('API request timed out before completion', 408)
    }

    throw new ApiError('Network request failed', 0, error)
  } finally {
    window.clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', abortListener)
  }
}
