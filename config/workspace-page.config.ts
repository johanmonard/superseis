export type WorkspacePageIdentity = {
  href: string;
  title: string;
  subtitle?: string;
};

export const workspacePageIdentities: WorkspacePageIdentity[] = [
  {
    href: "/",
    title: "Home",
    subtitle: "Starter workspace orientation and system handoff notes.",
  },
  {
    href: "/demo/dashboard",
    title: "Demo Dashboard",
    subtitle: "Stage 2 reference surface with summary cards and a starter dialog flow.",
  },
  {
    href: "/demo/tasks",
    title: "Demo Tasks",
    subtitle: "Stage 3 reference surface with tabs, search, badges, dialog actions, and a canonical data table.",
  },
  {
    href: "/demo/items",
    title: "Demo Items",
    subtitle: "Full-stack integration reference: page → query hook → API service → FastAPI route → SQLAlchemy → SQLite.",
  },
  {
    href: "/demo/primitives",
    title: "Primitives",
    subtitle: "Visual catalog of all available UI primitives with their names, variants, and composition patterns.",
  },
  // [new-module:page-identity]
  {
    href: "/admin",
    title: "Admin",
    subtitle: "Starter admin placeholder driven by the active authenticated session.",
  },
];

export function getWorkspacePageIdentity(pathname: string): WorkspacePageIdentity | null {
  // Exact match first, then longest prefix match for dynamic routes
  const exact = workspacePageIdentities.find((item) => item.href === pathname);
  if (exact) return exact;

  let best: WorkspacePageIdentity | null = null;
  for (const item of workspacePageIdentities) {
    if (item.href === "/") continue;
    if (pathname.startsWith(`${item.href}/`) && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best;
}
