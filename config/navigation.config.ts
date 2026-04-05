import type { AppIconKey } from "../components/ui/icon";
import type { WorkspaceModuleKey } from "./release.config";

export type NavigationSection = "main" | "system";

export type NavigationChildItem = {
  label: string;
  href?: string;
  icon?: AppIconKey;
  children?: NavigationChildItem[];
};

export type NavigationItem = {
  label: string;
  href?: string;
  module: WorkspaceModuleKey;
  icon: AppIconKey;
  section: NavigationSection;
  adminOnly?: boolean;
  children?: NavigationChildItem[];
};

export const navigation: NavigationItem[] = [
  { label: "Home", href: "/", module: "home", icon: "home", section: "main" },
  {
    label: "Demo",
    module: "demo",
    icon: "blocks",
    section: "main",
    children: [
      { label: "Dashboard", href: "/demo/dashboard", icon: "barChart3" },
      { label: "Tasks", href: "/demo/tasks", icon: "listChecks" },
      { label: "Items", href: "/demo/items", icon: "projectManagement" },
      { label: "Primitives", href: "/demo/primitives", icon: "dashboards" },
      { label: "Sequence", href: "/demo/sequence", icon: "listChecks" },
      { label: "React Flow", href: "/demo/reactflow", icon: "blocks" },
      { label: "Maps", href: "/demo/maps", icon: "map" },
      { label: "Wireframes", href: "/demo/wireframes", icon: "compass" },
    ],
  },
  {
    label: "Project",
    module: "project",
    icon: "projectManagement",
    section: "main",
    children: [
      {
        label: "Settings",
        icon: "settings",
        children: [
          { label: "Definition", href: "/project/definition", icon: "dashboards" },
          { label: "Partitioning", href: "/project/partitioning", icon: "grid" },
          { label: "Design", href: "/project/design", icon: "compass" },
          { label: "Terrain", href: "/project/terrain", icon: "mountain" },
          { label: "OSM", href: "/project/osm", icon: "map" },
          { label: "Layers", href: "/project/layers", icon: "layers" },
          { label: "Maps", href: "/project/maps", icon: "mapPin" },
          { label: "Offsetters", href: "/project/offsetters", icon: "sliders" },
        ],
      },
      {
        label: "Crew",
        href: "/project/crew",
        icon: "users",
      },
      {
        label: "Activities",
        href: "/project/activities",
        icon: "activity",
        children: [],
      },
    ],
  },
  // [new-module:insert-navigation]
  {
    label: "Admin",
    href: "/admin",
    module: "admin",
    icon: "admin",
    section: "system",
    adminOnly: true,
  },
];
