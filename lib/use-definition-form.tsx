"use client";

import { useQueryClient } from "@tanstack/react-query";

import { sectionKeys, useProjectSection } from "@/services/query/project-sections";
import type { ProjectSectionData } from "@/services/api/project-sections";
import { useActiveProject } from "./use-active-project";

export interface DefinitionFormData {
  client: string;
  country: string;
  epsg: string;
  second: string;
}

const REQUIRED_FIELDS: (keyof DefinitionFormData)[] = ["client", "country", "epsg", "second"];

export type DefinitionStatus = "todo" | "ongoing" | "completed";

export function getDefinitionStatus(data: DefinitionFormData): DefinitionStatus {
  const filled = REQUIRED_FIELDS.filter((k) => data[k].trim() !== "").length;
  if (filled === REQUIRED_FIELDS.length) return "completed";
  if (filled > 0) return "ongoing";
  return "todo";
}

const EMPTY: DefinitionFormData = {
  client: "",
  country: "",
  epsg: "",
  second: "",
};

/**
 * Read definition form data directly from the React Query cache.
 *
 * No local state — the query cache (populated by `useSectionData` in the
 * Definition page) is the single source of truth.
 */
export function useDefinitionForm(): { definition: DefinitionFormData } {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { data: serverData } = useProjectSection(projectId, "definition");

  if (!serverData?.data || Object.keys(serverData.data).length === 0) {
    return { definition: EMPTY };
  }

  const d = serverData.data as Record<string, string>;
  return {
    definition: {
      client: d.client ?? "",
      country: d.country ?? "",
      epsg: d.epsg ?? "",
      second: d.second ?? "",
    },
  };
}
