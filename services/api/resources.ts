/**
 * In-memory resources store — swap for real API calls when backend is ready.
 */

export type Resource = {
  id: number
  name: string
  slug: string
  created_at: string
}

export type ResourceCreate = {
  name: string
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

let nextId = 1
const store: Resource[] = []

export async function fetchResources(): Promise<Resource[]> {
  return [...store].reverse()
}

export async function fetchResource(slug: string): Promise<Resource> {
  const resource = store.find((r) => r.slug === slug)
  if (!resource) throw new Error('Resource not found')
  return resource
}

export async function createResource(payload: ResourceCreate): Promise<Resource> {
  const name = payload.name.trim()
  const slug = slugify(name)
  if (!slug) throw new Error('Name produces an empty slug')
  if (store.some((r) => r.slug === slug)) throw new Error(`Resource "${slug}" already exists`)

  const resource: Resource = {
    id: nextId++,
    name,
    slug,
    created_at: new Date().toISOString(),
  }
  store.push(resource)
  return resource
}

export async function deleteResource(slug: string): Promise<void> {
  const idx = store.findIndex((r) => r.slug === slug)
  if (idx === -1) throw new Error('Resource not found')
  store.splice(idx, 1)
}
