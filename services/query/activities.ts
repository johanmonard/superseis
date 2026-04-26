"use client";

/**
 * Activities store — per-project, persisted in `config.json` under the
 * `activities` section via `useSectionData`. Public hook surface mirrors
 * the previous React Query API so existing consumers keep working.
 *
 * Mutations read the *live* cache value via `queryClient.getQueryData`
 * before computing the next state. This keeps sequential `mutateAsync`
 * calls (e.g. the bootstrap loop in project-crew.tsx) consistent within
 * a single tick — the closed-over render snapshot would otherwise be
 * stale and clobber prior writes.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import type {
  Activity,
  ActivityCreate,
  ActivityParameters,
} from "../api/activities";
import type { ProjectSectionData } from "../api/project-sections";
import { sectionKeys } from "./project-sections";

const SECTION = "activities";

interface ActivitiesStore {
  items: Activity[];
  nextId: number;
}

const DEFAULT_STORE: ActivitiesStore = { items: [], nextId: 1 };

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Kept for back-compat with any callers expecting the old key shape.
export const activityKeys = {
  all: ["activities"] as const,
  list: () => [...activityKeys.all, "list"] as const,
  detail: (slug: string) => [...activityKeys.all, "detail", slug] as const,
};

function useStore() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const queryClient = useQueryClient();
  const { data, update } = useSectionData<ActivitiesStore>(
    projectId,
    SECTION,
    DEFAULT_STORE,
  );

  // Read latest cache (post-optimistic update) so back-to-back mutations
  // build on each other instead of racing the snapshot from this render.
  // Important: deps must NOT include `data` — otherwise getLive's reference
  // changes on every save, which cascades through `useUpdateActivityParameters`
  // into the parameter page's persist effect, causing an infinite re-save
  // loop that resets the autosave debounce timer (so nothing ever flushes).
  const getLive = React.useCallback((): ActivitiesStore => {
    if (!projectId) return DEFAULT_STORE;
    const cached = queryClient.getQueryData<ProjectSectionData>(
      sectionKeys.detail(projectId, SECTION),
    );
    const live = cached?.data as ActivitiesStore | undefined;
    return live && Object.keys(live).length > 0 ? live : DEFAULT_STORE;
  }, [projectId, queryClient]);

  return { data, update, getLive, projectId };
}

export function useActivitiesList() {
  const { data, projectId } = useStore();
  return {
    data: projectId ? data.items : [],
    isLoading: false,
  } as const;
}

export function useActivity(slug: string) {
  const { data, projectId } = useStore();
  const found = projectId
    ? data.items.find((a) => a.slug === slug)
    : undefined;
  return {
    data: found,
    isLoading: false,
    error: !projectId ? new Error("No active project") : null,
  } as const;
}

export function useCreateActivity() {
  const { update, getLive, projectId } = useStore();

  const mutateAsync = React.useCallback(
    async (payload: ActivityCreate): Promise<Activity> => {
      if (!projectId) throw new Error("No active project");
      const name = payload.name.trim();
      const slug = slugify(name);
      if (!slug) throw new Error("Name produces an empty slug");
      const live = getLive();
      if (live.items.some((a) => a.slug === slug)) {
        throw new Error(`Activity "${slug}" already exists`);
      }
      const created: Activity = {
        id: live.nextId,
        name,
        slug,
        created_at: new Date().toISOString(),
      };
      update({
        items: [...live.items, created],
        nextId: live.nextId + 1,
      });
      return created;
    },
    [projectId, update, getLive],
  );

  const mutate = React.useCallback(
    (
      payload: ActivityCreate,
      opts?: {
        onSuccess?: (activity: Activity) => void;
        onError?: (error: unknown) => void;
      },
    ) => {
      mutateAsync(payload).then(opts?.onSuccess).catch(opts?.onError);
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending: false } as const;
}

export function useDeleteActivity() {
  const { update, getLive, projectId } = useStore();

  const mutate = React.useCallback(
    (slug: string) => {
      if (!projectId) return;
      const live = getLive();
      update({
        items: live.items.filter((a) => a.slug !== slug),
        nextId: live.nextId,
      });
    },
    [projectId, update, getLive],
  );

  return { mutate } as const;
}

/**
 * Update the `parameters` blob on a single activity. Called from
 * `activity-parameters.tsx` whenever any field changes — relies on
 * `useSectionData`'s built-in 2 s debounce, so chatty field-by-field
 * updates collapse into one save.
 */
export function useUpdateActivityParameters() {
  const { update, getLive, projectId } = useStore();
  return React.useCallback(
    (slug: string, parameters: ActivityParameters) => {
      if (!projectId) return;
      const live = getLive();
      const target = live.items.find((a) => a.slug === slug);
      if (!target) return;
      update({
        ...live,
        items: live.items.map((a) =>
          a.slug === slug ? { ...a, parameters } : a,
        ),
      });
    },
    [projectId, update, getLive],
  );
}
