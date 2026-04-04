/**
 * REFERENCE ONLY — this service demonstrates the API client pattern:
 * typed functions → requestJson → backend route.
 *
 * Replace with your own domain API calls.
 */

import { requestJson } from './client'

export type Item = {
  id: number
  name: string
  created_at: string
}

export type ItemCreate = {
  name: string
}

export function fetchItems(signal?: AbortSignal): Promise<Item[]> {
  return requestJson<Item[]>('/items', { signal })
}

export function createItem(payload: ItemCreate): Promise<Item> {
  return requestJson<Item>('/items', { method: 'POST', body: payload })
}

export function deleteItem(id: number): Promise<void> {
  return requestJson<void>(`/items/${id}`, { method: 'DELETE' })
}
