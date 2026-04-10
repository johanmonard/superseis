import { requestJson } from './client'

export type AdminUser = {
  id: number
  email: string
  company_id: number
  role: string
  is_active: boolean
  created_at: string
}

export type AdminUserCreate = {
  email: string
  password: string
  company_id: number
  role?: string
}

export type AdminUserUpdate = {
  is_active?: boolean
  role?: string
}

export function fetchUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  return requestJson<AdminUser[]>('/admin/users', { signal })
}

export function createUser(payload: AdminUserCreate): Promise<AdminUser> {
  return requestJson<AdminUser>('/admin/users', { method: 'POST', body: payload })
}

export function updateUser(id: number, payload: AdminUserUpdate): Promise<AdminUser> {
  return requestJson<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: payload })
}
