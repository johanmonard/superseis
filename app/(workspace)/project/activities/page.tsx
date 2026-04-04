"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon, appIcons } from "@/components/ui/icon";
import { CreateActivityDialog } from "@/components/features/activities/create-activity-dialog";
import { useActivitiesList } from "@/services/query/activities";

export default function ActivitiesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: activities, isLoading } = useActivitiesList();

  return (
    <div className="space-y-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Activities
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Icon icon={appIcons.plus} size={14} className="mr-1" />
          Activity
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : !activities?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No activities yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-1">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                href={`/project/activities/${activity.slug}`}
                className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              >
                {activity.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateActivityDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
