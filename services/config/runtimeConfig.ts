export type RuntimeConfig = {
  apiBaseUrl: string
  apiKey: string
  requestTimeoutMs: number
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'
const DEFAULT_TIMEOUT_MS = 15000

let runtimeConfig: RuntimeConfig | null = null

export type RuntimeConfigResolution =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; message: string }

function parsePositiveInteger(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue
  }

  const parsedValue = Number.parseInt(value, 10)
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return defaultValue
  }

  return parsedValue
}

export function resolveRuntimeConfig(
  env: Record<string, string | boolean | undefined>,
): RuntimeConfigResolution {
  const apiKeyRaw = env.NEXT_PUBLIC_API_KEY
  const apiBaseUrlRaw = env.NEXT_PUBLIC_API_BASE_URL
  const timeoutRaw = env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS

  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : ''

  const apiBaseUrl =
    typeof apiBaseUrlRaw === 'string' && apiBaseUrlRaw.trim().length > 0
      ? apiBaseUrlRaw.trim()
      : DEFAULT_API_BASE_URL

  try {
    new URL(apiBaseUrl)
  } catch {
    return {
      ok: false,
      message: `Invalid NEXT_PUBLIC_API_BASE_URL: "${apiBaseUrl}". Provide a full URL (e.g. http://127.0.0.1:8000).`,
    }
  }

  const requestTimeoutMs = parsePositiveInteger(
    typeof timeoutRaw === 'string' ? timeoutRaw : undefined,
    DEFAULT_TIMEOUT_MS,
  )

  return {
    ok: true,
    config: {
      apiBaseUrl,
      apiKey,
      requestTimeoutMs,
    },
  }
}

export function initializeRuntimeConfig(config: RuntimeConfig): void {
  runtimeConfig = config
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) {
    throw new Error('Runtime configuration was not initialized')
  }

  return runtimeConfig
}
