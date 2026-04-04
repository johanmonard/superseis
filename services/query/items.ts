/**
 * REFERENCE ONLY — this hook demonstrates the TanStack Query pattern:
 * query key factory → useQuery / useMutation → automatic cache invalidation.
 *
 * Replace with your own domain hooks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createItem, deleteItem, fetchItems } from '../api/items'

export const itemKeys = {
  all: ['items'] as const,
  list: () => [...itemKeys.all, 'list'] as const,
}

export function useItemsList() {
  return useQuery({
    queryKey: itemKeys.list(),
    queryFn: ({ signal }) => fetchItems(signal),
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  })
}
