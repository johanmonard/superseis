"use client";

import * as React from "react";

import { ActivityParameters } from "@/components/features/activities/activity-parameters";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  useActivitiesList,
  useCreateActivity,
  useDeleteActivity,
  useRenameActivity,
} from "@/services/query/activities";
import type { Activity } from "@/services/api/activities";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } =
  appIcons;

/* -------------------------------------------------------------------------- */
/*  Activity selector — pill bar with +, rename, delete                       */
/* -------------------------------------------------------------------------- */

function ActivitySelector({
  activities,
  activeSlug,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  activities: Activity[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  onAdd: () => void;
  onRename: (slug: string, name: string) => void;
  onDelete: (slug: string) => void;
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

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {activities.map((a) => {
          const isActive = a.slug === activeSlug;
          const isEditing = a.slug === editingSlug;

          if (isEditing) {
            return (
              <div
                key={a.slug}
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
              key={a.slug}
              type="button"
              onClick={() => onSelect(a.slug)}
              className={cn(
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {a.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add activity"
        >
          <Icon icon={Plus} size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = activities.find((a) => a.slug === activeSlug);
            if (active) {
              setEditingSlug(active.slug);
              setEditValue(active.name);
            }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Icon icon={Pencil} size={10} /> Rename
        </button>
        {activities.length > 1 && (
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

export default function CrewActivitiesPage() {
  const { data: activities } = useActivitiesList();
  const createActivity = useCreateActivity();
  const renameActivity = useRenameActivity();
  const deleteActivity = useDeleteActivity();

  const [activeSlug, setActiveSlug] = React.useState<string>("");

  React.useEffect(() => {
    if (activities.length === 0) {
      if (activeSlug !== "") setActiveSlug("");
      return;
    }
    if (!activities.some((a) => a.slug === activeSlug)) {
      setActiveSlug(activities[0].slug);
    }
  }, [activities, activeSlug]);

  const activeActivity = activities.find((a) => a.slug === activeSlug);

  const handleAdd = React.useCallback(async () => {
    const name = `Activity ${activities.length + 1}`;
    try {
      const created = await createActivity.mutateAsync({ name });
      setActiveSlug(created.slug);
    } catch (err) {
      // eslint-disable-next-line no-console -- surfacing failure to the user via console for now
      console.error("[activities] create failed", err);
    }
  }, [activities.length, createActivity]);

  const handleRename = React.useCallback(
    (slug: string, newName: string) => {
      renameActivity.mutate(slug, newName);
    },
    [renameActivity],
  );

  const handleDelete = React.useCallback(
    (slug: string) => {
      deleteActivity.mutate(slug);
      // After deletion, fall back to the first remaining activity.
      const remaining = activities.filter((a) => a.slug !== slug);
      setActiveSlug(remaining[0]?.slug ?? "");
    },
    [activities, deleteActivity],
  );

  return (
    <ProjectSettingsPage title="Activities">
      <div className="flex flex-col gap-[var(--space-4)]">
        {activities.length === 0 ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">
              No activities yet.
            </p>
            <button
              type="button"
              onClick={handleAdd}
              className="self-start inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <Icon icon={Plus} size={12} /> Add activity
            </button>
          </>
        ) : (
          <>
            <ActivitySelector
              activities={activities}
              activeSlug={activeSlug}
              onSelect={setActiveSlug}
              onAdd={handleAdd}
              onRename={handleRename}
              onDelete={handleDelete}
            />

            <div className="h-px bg-[var(--color-border-subtle)]" />

            {activeActivity ? (
              <ActivityParameters
                key={activeActivity.slug}
                activityName={activeActivity.name}
                activitySlug={activeActivity.slug}
              />
            ) : null}
          </>
        )}
      </div>
    </ProjectSettingsPage>
  );
}
