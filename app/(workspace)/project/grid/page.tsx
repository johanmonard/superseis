"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectDesignOptions } from "@/components/features/project/project-design-options";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { useActiveProject } from "@/lib/use-active-project";
import { usePipelineReport } from "@/lib/use-pipeline-report";
import {
  useGridRegioning,
  useInvalidateGridArtifacts,
} from "@/services/query/project-grid-artifacts";

const DesignGridViewport = dynamic(
  () =>
    import("@/components/features/project/design-grid-viewport").then(
      (m) => m.DesignGridViewport,
    ),
  { ssr: false },
);

export default function GridPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { state: pipelineState } = usePipelineReport();

  // When a grid closure finishes successfully, invalidate the cached
  // artifact queries so the viewport refetches with fresh parquets.
  const invalidateGrid = useInvalidateGridArtifacts();
  const prevGridDoneRef = React.useRef(false);
  React.useEffect(() => {
    const gridDone =
      pipelineState.kind === "done" &&
      pipelineState.target === "grid" &&
      !pipelineState.progress.error;
    if (gridDone && !prevGridDoneRef.current && projectId) {
      invalidateGrid.mutate(projectId);
    }
    prevGridDoneRef.current = gridDone;
  }, [pipelineState, projectId, invalidateGrid]);

  const { data: regioning } = useGridRegioning(projectId);

  const viewport = (
    <DesignGridViewport
      projectId={projectId}
      regionPolygons={regioning?.files ?? []}
    />
  );

  return (
    <ProjectSettingsPage title="Grid" viewport={viewport}>
      <ProjectDesignOptions />
    </ProjectSettingsPage>
  );
}
