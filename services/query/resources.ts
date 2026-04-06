import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createResource,
  deleteResource,
  fetchResource,
  fetchResources,
} from '../api/resources'

export const resourceKeys = {
  all: ['resources'] as const,
  list: () => [...resourceKeys.all, 'list'] as const,
  detail: (slug: string) => [...resourceKeys.all, 'detail', slug] as const,
}

export function useResourcesList() {
  return useQuery({
    queryKey: resourceKeys.list(),
    queryFn: () => fetchResources(),
  })
}

export function useResource(slug: string) {
  return useQuery({
    queryKey: resourceKeys.detail(slug),
    queryFn: () => fetchResource(slug),
  })
}

export function useCreateResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createResource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKeys.all }),
  })
}

export function useDeleteResource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteResource,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKeys.all }),
  })
}
