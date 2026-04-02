import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client'

function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    const isPermanentClientError =
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 408 &&
      error.status !== 429

    if (isPermanentClientError) {
      return false
    }
  }

  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryRequest,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 5_000),
    },
    mutations: {
      retry: false,
    },
  },
})
