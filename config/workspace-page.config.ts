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
  {
    href: "/demo/sequence",
    title: "Sequence",
    subtitle: "Workflow visualization with sequential steps, parallel branches, and merge gates.",
  },
  {
    href: "/demo/reactflow",
    title: "React Flow",
    subtitle: "React Flow library test — drag-and-drop workflow with fork/merge topology.",
  },
  {
    href: "/project",
    title: "Settings",
    subtitle: "Project settings and configuration.",
  },
  {
    href: "/project/definition",
    title: "Definition",
    subtitle: "Project base information.",
  },
  {
    href: "/project/files",
    title: "Files",
    subtitle: "Upload and visualize project GIS files (polygons, POI, layers).",
  },
  {
    href: "/project/partitioning",
    title: "Partitioning",
    subtitle: "Partition the project area in regions.",
  },
  {
    href: "/project/design",
    title: "Design",
    subtitle: "Survey design parameters & region assignment.",
  },
  {
    href: "/project/survey",
    title: "Survey",
    subtitle: "Define survey extents and boundaries.",
  },
  {
    href: "/project/osm",
    title: "OSM",
    subtitle: "OpenStreetMap data configuration.",
  },
  {
    href: "/project/layers",
    title: "Layers",
    subtitle: "Layer management and configuration.",
  },
  {
    href: "/project/maps",
    title: "Maps",
    subtitle: "Map layer composition and sorting.",
  },
  {
    href: "/project/offsetters",
    title: "Offsetters",
    subtitle: "Offset relocation parameters.",
  },
  {
    href: "/project/crew",
    title: "Crew",
    subtitle: "Define crew options, activities, and resources.",
  },
  {
    href: "/project/activities",
    title: "Activities",
    subtitle: "Project activities and event log.",
  },
  {
    href: "/project/resources",
    title: "Resources",
    subtitle: "Project resources and equipment.",
  },
  {
    href: "/demo/gis",
    title: "GIS",
    subtitle: "GIS data display and manipulation experiments.",
  },
  {
    href: "/demo/gis-globe",
    title: "GIS Globe",
    subtitle:
      "WebGL globe projection with satellite tiles and GeoJSON features (MapLibre GL).",
  },
  {
    href: "/demo/workflow",
    title: "Workflow",
    subtitle: "Two-panel workflow layout with parameters and viewport.",
  },
  // [new-module:page-identity]
  {
    href: "/admin",
    title: "Admin",
    subtitle: "Starter admin placeholder driven by the active authenticated session.",
  },
  {
    href: "/admin/companies",
    title: "Companies",
    subtitle: "Manage companies, their status, and user limits.",
  },
  {
    href: "/admin/users",
    title: "Users",
    subtitle: "Manage user accounts, roles, and access.",
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
