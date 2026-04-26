"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import { ActivityParameters } from "@/components/features/activities/activity-parameters";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { useActivity } from "@/services/query/activities";

export default function ActivityPage() {
  const params = useParams<{ slug: string }>();
  const { data: activity, isLoading, error } = useActivity(params.slug);

  if (isLoading) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">Loading activity...</p>
    );
  }

  if (error || !activity) {
    return (
      <p className="text-sm text-[var(--color-status-danger)]">Activity not found.</p>
    );
  }

  return (
    <ProjectSettingsPage title={activity.name} panelTitle={activity.name}>
      <ActivityParameters key={activity.slug} activityName={activity.name} activitySlug={activity.slug} />
    </ProjectSettingsPage>
  );
}
