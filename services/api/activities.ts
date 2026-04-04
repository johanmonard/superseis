/**
 * In-memory activities store — swap for real API calls when backend is ready.
 */

export type Activity = {
  id: number
  name: string
  slug: string
  created_at: string
}

export type ActivityCreate = {
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
const store: Activity[] = []

export async function fetchActivities(): Promise<Activity[]> {
  return [...store].reverse()
}

export async function fetchActivity(slug: string): Promise<Activity> {
  const activity = store.find((a) => a.slug === slug)
  if (!activity) throw new Error('Activity not found')
  return activity
}

export async function createActivity(payload: ActivityCreate): Promise<Activity> {
  const name = payload.name.trim()
  const slug = slugify(name)
  if (!slug) throw new Error('Name produces an empty slug')
  if (store.some((a) => a.slug === slug)) throw new Error(`Activity "${slug}" already exists`)

  const activity: Activity = {
    id: nextId++,
    name,
    slug,
    created_at: new Date().toISOString(),
  }
  store.push(activity)
  return activity
}

export async function deleteActivity(slug: string): Promise<void> {
  const idx = store.findIndex((a) => a.slug === slug)
  if (idx === -1) throw new Error('Activity not found')
  store.splice(idx, 1)
}
