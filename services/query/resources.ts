"use client";

/**
 * Resources store — per-project, persisted in `config.json` under the
 * `resources` section. Mirror of `services/query/activities.ts` —
 * see that file for the rationale on `getLive` and the public hook
 * surface compatibility.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import type {
  Resource,
  ResourceCreate,
  ResourceParameters,
} from "../api/resources";
import type { ProjectSectionData } from "../api/project-sections";
import { sectionKeys } from "./project-sections";

const SECTION = "resources";

interface ResourcesStore {
  items: Resource[];
  nextId: number;
}

const DEFAULT_STORE: ResourcesStore = { items: [], nextId: 1 };

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const resourceKeys = {
  all: ["resources"] as const,
  list: () => [...resourceKeys.all, "list"] as const,
  detail: (slug: string) => [...resourceKeys.all, "detail", slug] as const,
};

function useStore() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const queryClient = useQueryClient();
  const { data, update } = useSectionData<ResourcesStore>(
    projectId,
    SECTION,
    DEFAULT_STORE,
  );

  // Important: deps must NOT include `data` — see services/query/activities.ts
  // for the rationale (this matches that fix).
  const getLive = React.useCallback((): ResourcesStore => {
    if (!projectId) return DEFAULT_STORE;
    const cached = queryClient.getQueryData<ProjectSectionData>(
      sectionKeys.detail(projectId, SECTION),
    );
    const live = cached?.data as ResourcesStore | undefined;
    return live && Object.keys(live).length > 0 ? live : DEFAULT_STORE;
  }, [projectId, queryClient]);

  return { data, update, getLive, projectId };
}

export function useResourcesList() {
  const { data, projectId } = useStore();
  return {
    data: projectId ? data.items : [],
    isLoading: false,
  } as const;
}

export function useResource(slug: string) {
  const { data, projectId } = useStore();
  const found = projectId
    ? data.items.find((r) => r.slug === slug)
    : undefined;
  return {
    data: found,
    isLoading: false,
    error: !projectId ? new Error("No active project") : null,
  } as const;
}

export function useCreateResource() {
  const { update, getLive, projectId } = useStore();

  const mutateAsync = React.useCallback(
    async (payload: ResourceCreate): Promise<Resource> => {
      if (!projectId) throw new Error("No active project");
      const name = payload.name.trim();
      const slug = slugify(name);
      if (!slug) throw new Error("Name produces an empty slug");
      const live = getLive();
      if (live.items.some((r) => r.slug === slug)) {
        throw new Error(`Resource "${slug}" already exists`);
      }
      const created: Resource = {
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
      payload: ResourceCreate,
      opts?: {
        onSuccess?: (resource: Resource) => void;
        onError?: (error: unknown) => void;
      },
    ) => {
      mutateAsync(payload).then(opts?.onSuccess).catch(opts?.onError);
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending: false } as const;
}

export function useDeleteResource() {
  const { update, getLive, projectId } = useStore();

  const mutate = React.useCallback(
    (slug: string) => {
      if (!projectId) return;
      const live = getLive();
      update({
        items: live.items.filter((r) => r.slug !== slug),
        nextId: live.nextId,
      });
    },
    [projectId, update, getLive],
  );

  return { mutate } as const;
}

/**
 * Update the `parameters` blob on a single resource. Mirror of
 * `useUpdateActivityParameters` — see the activities file for context.
 */
export function useUpdateResourceParameters() {
  const { update, getLive, projectId } = useStore();
  return React.useCallback(
    (slug: string, parameters: ResourceParameters) => {
      if (!projectId) return;
      const live = getLive();
      const target = live.items.find((r) => r.slug === slug);
      if (!target) return;
      update({
        ...live,
        items: live.items.map((r) =>
          r.slug === slug ? { ...r, parameters } : r,
        ),
      });
    },
    [projectId, update, getLive],
  );
}
