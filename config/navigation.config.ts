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
      { label: "GIS", href: "/demo/gis", icon: "layers" },
      { label: "GIS Globe", href: "/demo/gis-globe", icon: "map" },
      { label: "OSM info", href: "/demo/osm-info", icon: "mapPin" },
      { label: "Animate 3D", href: "/demo/animate", icon: "activity" },
      { label: "Workflow", href: "/demo/workflow", icon: "blocks" },
      { label: "Raster", href: "/demo/raster", icon: "grid" },
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
          { label: "Files", href: "/project/files", icon: "folderOpen" },
          { label: "Partitioning", href: "/project/partitioning", icon: "grid" },
          { label: "Design", href: "/project/design", icon: "compass" },
          { label: "Survey", href: "/project/survey", icon: "mountain" },
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
      {
        label: "Resources",
        href: "/project/resources",
        icon: "blocks",
        children: [],
      },
    ],
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
