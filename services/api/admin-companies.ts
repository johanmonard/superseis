import { requestJson } from './client'

export type Company = {
  id: number
  name: string
  is_active: boolean
  max_users: number
  created_at: string
}

export type CompanyCreate = {
  name: string
  max_users?: number
}

export type CompanyUpdate = {
  name?: string
  is_active?: boolean
  max_users?: number
}

export function fetchCompanies(signal?: AbortSignal): Promise<Company[]> {
  return requestJson<Company[]>('/admin/companies', { signal })
}

export function createCompany(payload: CompanyCreate): Promise<Company> {
  return requestJson<Company>('/admin/companies', { method: 'POST', body: payload })
}

export function updateCompany(id: number, payload: CompanyUpdate): Promise<Company> {
  return requestJson<Company>(`/admin/companies/${id}`, { method: 'PATCH', body: payload })
}
