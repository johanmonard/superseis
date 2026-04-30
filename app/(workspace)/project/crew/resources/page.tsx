"use client";

import * as React from "react";

import { ResourceParameters } from "@/components/features/resources/resource-parameters";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { Icon, appIcons } from "@/components/ui/icon";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import {
  useResourcesList,
  useCreateResource,
  useDeleteResource,
  useRenameResource,
} from "@/services/query/resources";
import type { Resource } from "@/services/api/resources";

interface CrewSectionData {
  options: Array<{
    id: string;
    name: string;
    activities: Array<{
      id: string;
      name: string;
      resources: Array<{ name: string }>;
    }>;
  }>;
  activeId: string;
}
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

const UNUSED_GROUP_LABEL = "Unused in activities";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } =
  appIcons;

/* -------------------------------------------------------------------------- */
/*  Resource selector — pill bar with +, rename, delete                       */
/* -------------------------------------------------------------------------- */

interface ResourceGroup {
  label: string;
  resources: Resource[];
}

/** Build groups using the *crew configuration* as the source of truth.
 *  Each activity in the active crew option lists which resources belong
 *  to it (by name); walking that mapping mirrors how the resource detail
 *  page derives `owningActivities`, so the two views stay consistent.
 *  Names are normalized (trim + lowercase) so capitalization typos like
 *  "Lay land" vs "Lay Land" still resolve. */
function buildResourceGroups(
  resources: Resource[],
  crew: CrewSectionData,
): ResourceGroup[] {
  const norm = (s: string) => s.trim().toLowerCase();
  const byNormName = new Map<string, Resource>();
  for (const r of resources) byNormName.set(norm(r.name), r);

  const activeOption =
    crew.options.find((o) => o.id === crew.activeId) ?? crew.options[0];

  const claimed = new Set<string>();
  const groups: ResourceGroup[] = [];

  if (activeOption) {
    for (const a of activeOption.activities) {
      const list: Resource[] = [];
      for (const ref of a.resources) {
        const found = byNormName.get(norm(ref.name));
        if (found && !claimed.has(found.slug)) {
          claimed.add(found.slug);
          list.push(found);
        }
      }
      if (list.length > 0) groups.push({ label: a.name, resources: list });
    }
  }

  const unused = resources.filter((r) => !claimed.has(r.slug));
  if (unused.length > 0) {
    groups.push({ label: UNUSED_GROUP_LABEL, resources: unused });
  }
  return groups;
}

function ResourceSelector({
  groups,
  activeSlug,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  totalCount,
}: {
  groups: ResourceGroup[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  onAdd: () => void;
  onRename: (slug: string, name: string) => void;
  onDelete: (slug: string) => void;
  totalCount: number;
}) {
  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingSlug) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingSlug]);

  const commitEdit = () => {
    if (editingSlug && editValue.trim()) onRename(editingSlug, editValue.trim());
    setEditingSlug(null);
  };

  const renderPill = (r: Resource) => {
    const isActive = r.slug === activeSlug;
    const isEditing = r.slug === editingSlug;
    if (isEditing) {
      return (
        <div
          key={r.slug}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
        >
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditingSlug(null);
            }}
            className="h-6 w-32 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
          />
          <button
            type="button"
            onClick={commitEdit}
            className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]"
          >
            <Icon icon={Check} size={10} />
          </button>
          <button
            type="button"
            onClick={() => setEditingSlug(null)}
            className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"
          >
            <Icon icon={X} size={10} />
          </button>
        </div>
      );
    }
    return (
      <button
        key={r.slug}
        type="button"
        onClick={() => onSelect(r.slug)}
        className={cn(
          "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
          isActive
            ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
            : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
        )}
      >
        {r.name}
      </button>
    );
  };

  // Find the active resource across groups (used to seed the rename input).
  const activeResource = React.useMemo(() => {
    for (const g of groups) {
      const found = g.resources.find((r) => r.slug === activeSlug);
      if (found) return found;
    }
    return undefined;
  }, [groups, activeSlug]);

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex flex-row items-start gap-[var(--space-4)] overflow-x-auto">
        {groups.map((group) => (
          <div
            key={group.label}
            className="flex shrink-0 flex-col gap-[var(--space-1)]"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {group.label}
            </span>
            <div className="flex flex-col items-start gap-[var(--space-1)]">
              {group.resources.map(renderPill)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add resource"
        >
          <Icon icon={Plus} size={10} /> Add
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeResource) {
              setEditingSlug(activeResource.slug);
              setEditValue(activeResource.name);
            }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Icon icon={Pencil} size={10} /> Rename
        </button>
        {totalCount > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeSlug)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Icon icon={Trash2} size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function CrewResourcesPage() {
  const { data: resources } = useResourcesList();
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );
  const createResource = useCreateResource();
  const renameResource = useRenameResource();
  const deleteResource = useDeleteResource();

  const groups = React.useMemo(
    () => buildResourceGroups(resources, crewSection),
    [resources, crewSection],
  );

  const [activeSlug, setActiveSlug] = React.useState<string>("");

  React.useEffect(() => {
    if (resources.length === 0) {
      if (activeSlug !== "") setActiveSlug("");
      return;
    }
    if (!resources.some((r) => r.slug === activeSlug)) {
      setActiveSlug(resources[0].slug);
    }
  }, [resources, activeSlug]);

  const activeResource = resources.find((r) => r.slug === activeSlug);

  const handleAdd = React.useCallback(async () => {
    const name = `Resource ${resources.length + 1}`;
    try {
      const created = await createResource.mutateAsync({ name });
      setActiveSlug(created.slug);
    } catch (err) {
      // eslint-disable-next-line no-console -- surfacing failure to the user via console for now
      console.error("[resources] create failed", err);
    }
  }, [resources.length, createResource]);

  const handleRename = React.useCallback(
    (slug: string, newName: string) => {
      renameResource.mutate(slug, newName);
    },
    [renameResource],
  );

  const handleDelete = React.useCallback(
    (slug: string) => {
      deleteResource.mutate(slug);
      const remaining = resources.filter((r) => r.slug !== slug);
      setActiveSlug(remaining[0]?.slug ?? "");
    },
    [resources, deleteResource],
  );

  return (
    <ProjectSettingsPage title="Resources">
      <div className="flex flex-col gap-[var(--space-4)]">
        {resources.length === 0 ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">
              No resources yet.
            </p>
            <button
              type="button"
              onClick={handleAdd}
              className="self-start inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <Icon icon={Plus} size={12} /> Add resource
            </button>
          </>
        ) : (
          <>
            <ResourceSelector
              groups={groups}
              activeSlug={activeSlug}
              onSelect={setActiveSlug}
              onAdd={handleAdd}
              onRename={handleRename}
              onDelete={handleDelete}
              totalCount={resources.length}
            />

            <div className="h-px bg-[var(--color-border-subtle)]" />

            {activeResource ? (
              <ResourceParameters
                key={activeResource.slug}
                resourceName={activeResource.name}
                resourceSlug={activeResource.slug}
              />
            ) : null}
          </>
        )}
      </div>
    </ProjectSettingsPage>
  );
}
