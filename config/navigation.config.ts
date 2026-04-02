import type { AppIconKey } from "../components/ui/icon";
import type { WorkspaceModuleKey } from "./release.config";

export type NavigationSection = "main" | "system";

export type NavigationChildItem = {
  label: string;
  href: string;
  icon?: AppIconKey;
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
