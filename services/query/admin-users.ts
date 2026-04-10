import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createUser,
  fetchUsers,
  updateUser,
  type AdminUserCreate,
  type AdminUserUpdate,
} from '../api/admin-users'

export const adminUserKeys = {
  all: ['admin-users'] as const,
  list: () => [...adminUserKeys.all, 'list'] as const,
}

export function useAdminUsersList() {
  return useQuery({
    queryKey: adminUserKeys.list(),
    queryFn: ({ signal }) => fetchUsers(signal),
  })
}

export function useCreateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AdminUserCreate) => createUser(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
  })
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: AdminUserUpdate & { id: number }) =>
      updateUser(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
  })
}
