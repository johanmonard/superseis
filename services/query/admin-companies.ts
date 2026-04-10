import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createCompany,
  fetchCompanies,
  updateCompany,
  type CompanyCreate,
  type CompanyUpdate,
} from '../api/admin-companies'

export const companyKeys = {
  all: ['admin-companies'] as const,
  list: () => [...companyKeys.all, 'list'] as const,
}

export function useCompaniesList() {
  return useQuery({
    queryKey: companyKeys.list(),
    queryFn: ({ signal }) => fetchCompanies(signal),
  })
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CompanyCreate) => createCompany(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.all }),
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: CompanyUpdate & { id: number }) =>
      updateCompany(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companyKeys.all }),
  })
}
