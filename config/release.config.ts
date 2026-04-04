export type WorkspaceModuleKey =
  | "home"
  | "demo"
  | "project"
  // [new-module:module-key]
  | "admin";

// All modules enabled by default.
// Expand to profile-based gating when you need staging/beta/GA distinctions.
const enabledModules = new Set<WorkspaceModuleKey>([
  "home",
  "demo",
  "project",
  // [new-module:all-modules]
  "admin",
]);

const WORKSPACE_ROUTE_PREFIXES: Array<{
  prefix: string;
  module: WorkspaceModuleKey;
}> = [
  { prefix: "/demo", module: "demo" },
  { prefix: "/project", module: "project" },
  // [new-module:route-prefix]
  { prefix: "/admin", module: "admin" },
  { prefix: "/", module: "home" },
];

export const defaultWorkspaceHref = "/";

export function isWorkspaceModuleEnabled(module: WorkspaceModuleKey): boolean {
  return enabledModules.has(module);
}

export function filterNavigationForWorkspaceRelease<T extends { module: WorkspaceModuleKey }>(
  items: T[],
): T[] {
  return items.filter((item) => isWorkspaceModuleEnabled(item.module));
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function getWorkspaceModuleForPathname(pathname: string): WorkspaceModuleKey | null {
  const normalizedPathname = normalizePathname(pathname);

  for (const entry of WORKSPACE_ROUTE_PREFIXES) {
    if (entry.prefix === "/") {
      if (normalizedPathname === "/") {
        return entry.module;
      }

      continue;
    }

    if (
      normalizedPathname === entry.prefix ||
      normalizedPathname.startsWith(`${entry.prefix}/`)
    ) {
      return entry.module;
    }
  }

  return null;
}

export function isWorkspacePathReleased(pathname: string): boolean {
  const moduleKey = getWorkspaceModuleForPathname(pathname);
  return moduleKey === null ? true : isWorkspaceModuleEnabled(moduleKey);
}
