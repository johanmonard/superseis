import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createActivity,
  deleteActivity,
  fetchActivities,
  fetchActivity,
} from '../api/activities'

export const activityKeys = {
  all: ['activities'] as const,
  list: () => [...activityKeys.all, 'list'] as const,
  detail: (slug: string) => [...activityKeys.all, 'detail', slug] as const,
}

export function useActivitiesList() {
  return useQuery({
    queryKey: activityKeys.list(),
    queryFn: () => fetchActivities(),
  })
}

export function useActivity(slug: string) {
  return useQuery({
    queryKey: activityKeys.detail(slug),
    queryFn: () => fetchActivity(slug),
  })
}

export function useCreateActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.all }),
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activityKeys.all }),
  })
}
