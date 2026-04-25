import type { AppIconKey } from "../components/ui/icon";
import type { WorkspaceModuleKey } from "./release.config";

export type NavigationSection = "main" | "system";

export type NavigationChildItem = {
  label: string;
  href?: string;
  icon?: AppIconKey;
  children?: NavigationChildItem[];
  /** Render a hairline divider after this child in the sidebar. */
  separatorAfter?: boolean;
};

export type NavigationItem = {
  label: string;
  href?: string;
  module: WorkspaceModuleKey;
  icon: AppIconKey;
  section: NavigationSection;
  adminOnly?: boolean;
  children?: NavigationChildItem[];
  /** Render a hairline divider after this item in the sidebar. */
  separatorAfter?: boolean;
};

export function getNavigationIconForPathname(pathname: string): AppIconKey | null {
  let bestIcon: AppIconKey | null = null;
  let bestHrefLength = -1;
  const walk = (items: (NavigationItem | NavigationChildItem)[]) => {
    for (const item of items) {
      if (item.icon && item.href) {
        const matches =
          item.href === pathname ||
          (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        if (matches && item.href.length > bestHrefLength) {
          bestIcon = item.icon;
          bestHrefLength = item.href.length;
        }
      }
      if (item.children) walk(item.children);
    }
  };
  walk(navigation);
  return bestIcon;
}

export const navigation: NavigationItem[] = [
  {
    label: "Settings",
    module: "project",
    icon: "settings",
    section: "main",
    children: [
      { label: "GIS Studio", href: "/project/files", icon: "map", separatorAfter: true },
      { label: "Definition", href: "/project/definition", icon: "info" },
      { label: "Partitions", href: "/project/partitions", icon: "dashboards" },
      { label: "Design", href: "/project/design", icon: "compass" },
      { label: "Survey", href: "/project/survey", icon: "mountain" },
      { label: "Grid", href: "/project/grid", icon: "grid" },
      { label: "Layers", href: "/project/layers", icon: "layers" },
      { label: "Maps", href: "/project/maps", icon: "mapPin" },
      { label: "Offsets", href: "/project/offsets", icon: "sliders" },
    ],
  },
  {
    label: "Crew",
    module: "project",
    icon: "users",
    section: "main",
    href: "/project/crew",
  },
  {
    label: "Activities",
    module: "project",
    icon: "activity",
    section: "main",
    href: "/project/activities",
    children: [],
  },
  {
    label: "Resources",
    module: "project",
    icon: "blocks",
    section: "main",
    href: "/project/resources",
    children: [],
  },
  // [new-module:insert-navigation]
  {
    label: "Admin",
    module: "admin",
    icon: "admin",
    section: "system",
    adminOnly: true,
    children: [
      { label: "Overview", href: "/admin", icon: "home" },
      { label: "Companies", href: "/admin/companies", icon: "blocks" },
      { label: "Users", href: "/admin/users", icon: "users" },
    ],
  },
];

export interface DemoLink {
  label: string;
  href: string;
  icon: AppIconKey;
}

export const DEMO_LINKS: DemoLink[] = [
  { label: "Dashboard", href: "/demo/dashboard", icon: "barChart3" },
  { label: "Tasks", href: "/demo/tasks", icon: "listChecks" },
  { label: "Items", href: "/demo/items", icon: "projectManagement" },
  { label: "Primitives", href: "/demo/primitives", icon: "dashboards" },
  { label: "Sequence", href: "/demo/sequence", icon: "listChecks" },
  { label: "React Flow", href: "/demo/reactflow", icon: "blocks" },
  { label: "Maps", href: "/demo/maps", icon: "map" },
  { label: "Wireframes", href: "/demo/wireframes", icon: "compass" },
  { label: "GIS", href: "/demo/gis", icon: "layers" },
  { label: "GIS Globe", href: "/demo/gis-globe", icon: "map" },
  { label: "OSM info", href: "/demo/osm-info", icon: "mapPin" },
  { label: "Animate 3D", href: "/demo/animate", icon: "activity" },
  { label: "Workflow", href: "/demo/workflow", icon: "blocks" },
  { label: "Raster", href: "/demo/raster", icon: "grid" },
];
