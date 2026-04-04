import type { NavigationChildItem } from "@/config/navigation.config";
import { useActivitiesList } from "@/services/query/activities";

export function useActivityNavChildren(): NavigationChildItem[] {
  const { data: activities } = useActivitiesList();

  if (!activities?.length) return [];

  return activities.map((activity) => ({
    label: activity.name,
    href: `/project/activities/${activity.slug}`,
    icon: "activity" as const,
  }));
}
