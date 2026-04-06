"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon, appIcons } from "@/components/ui/icon";
import { CreateResourceDialog } from "@/components/features/resources/create-resource-dialog";
import { useResourcesList } from "@/services/query/resources";

export default function ResourcesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { data: resources, isLoading } = useResourcesList();

  return (
    <div className="space-y-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Resources
        </h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Icon icon={appIcons.plus} size={14} className="mr-1" />
          Resource
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : !resources?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No resources yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-1">
          {resources.map((resource) => (
            <li key={resource.id}>
              <Link
                href={`/project/resources/${resource.slug}`}
                className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              >
                {resource.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateResourceDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
