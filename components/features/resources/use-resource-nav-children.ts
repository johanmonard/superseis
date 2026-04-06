import type { NavigationChildItem } from "@/config/navigation.config";
import { useResourcesList } from "@/services/query/resources";

export function useResourceNavChildren(): NavigationChildItem[] {
  const { data: resources } = useResourcesList();

  if (!resources?.length) return [];

  return resources.map((resource) => ({
    label: resource.name,
    href: `/project/resources/${resource.slug}`,
    icon: "blocks" as const,
  }));
}
