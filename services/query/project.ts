import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuthSession } from "@/lib/use-auth-session";
import {
  createProject,
  deleteProject,
  fetchProjectList,
  type ProjectCreate,
} from "../api/project";

export const projectKeys = {
  all: ["project"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export function useProjectList() {
  const { data: session, isLoading: isAuthLoading } = useAuthSession();

  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: ({ signal }) => fetchProjectList(signal),
    enabled: !isAuthLoading && !!session,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProjectCreate) => createProject(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
