"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";

export default function SimulatorAutoPage() {
  return (
    <ProjectSettingsPage
      title="Auto"
      viewport={
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder
            variant="wave-mesh"
            message="Auto simulator viewport"
          />
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        Auto simulator parameters will go here.
      </p>
    </ProjectSettingsPage>
  );
}
