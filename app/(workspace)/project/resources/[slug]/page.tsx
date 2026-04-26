"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import { ResourceParameters } from "@/components/features/resources/resource-parameters";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { useResource } from "@/services/query/resources";

export default function ResourcePage() {
  const params = useParams<{ slug: string }>();
  const { data: resource, isLoading, error } = useResource(params.slug);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">Loading resource...</p>
    );
  }

  if (error || !resource) {
    return (
      <p className="text-sm text-[var(--color-status-danger)]">Resource not found.</p>
    );
  }

  return (
    <ProjectSettingsPage title={resource.name} panelTitle={resource.name}>
      <ResourceParameters key={resource.slug} resourceName={resource.name} resourceSlug={resource.slug} />
    </ProjectSettingsPage>
  );
}
