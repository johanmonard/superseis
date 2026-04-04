import { requestJson } from "./client";

// --- Types ---

export type ProjectItem = {
  id: string;
  // Add fields here
};

// --- API calls ---

export function fetchProjectList(signal?: AbortSignal): Promise<ProjectItem[]> {
  return requestJson<ProjectItem[]>("/project", { signal });
}
