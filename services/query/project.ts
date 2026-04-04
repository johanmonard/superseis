import { useQuery } from "@tanstack/react-query";
import { fetchProjectList } from "../api/project";

export const projectKeys = {
  all: ["project"] as const,
  list: () => [...projectKeys.all, "list"] as const,
};

export function useProjectList() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: ({ signal }) => fetchProjectList(signal),
  });
}
