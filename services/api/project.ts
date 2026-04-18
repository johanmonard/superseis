import { requestJson } from "./client";

export type ProjectItem = {
  id: number;
  name: string;
  created_at: string;
};

export type ProjectCreate = {
  name: string;
};

export function fetchProjectList(signal?: AbortSignal): Promise<ProjectItem[]> {
  return requestJson<ProjectItem[]>("/project", { signal });
}

export function createProject(payload: ProjectCreate): Promise<ProjectItem> {
  return requestJson<ProjectItem>("/project", { method: "POST", body: payload });
}

export function deleteProject(id: number): Promise<void> {
  return requestJson<void>(`/project/${id}`, { method: "DELETE" });
}

export type ReloadProjectResponse = {
  project_id: number;
  project_name: string;
};

export function reloadProjectConfig(id: number): Promise<ReloadProjectResponse> {
  return requestJson<ReloadProjectResponse>(`/project/${id}/reload`, {
    method: "POST",
  });
}
