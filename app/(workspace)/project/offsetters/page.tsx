"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectOffsetters } from "@/components/features/project/project-offsetters";
import { useActiveProject } from "@/lib/use-active-project";
import { usePipelineReport } from "@/lib/use-pipeline-report";
import {
  gridArtifactKeys,
  useGridRegioning,
} from "@/services/query/project-grid-artifacts";
import { offsetArtifactKeys } from "@/services/query/project-offset-artifacts";

const OffsetsGridViewport = dynamic(
  () =>
    import("@/components/features/project/offsets-grid-viewport").then(
      (m) => m.OffsetsGridViewport,
    ),
  { ssr: false },
);

export default function OffsettersPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { state: pipelineState } = usePipelineReport();
  const qc = useQueryClient();
  const { data: regioning } = useGridRegioning(projectId);

  // When an offsets closure finishes successfully, invalidate the cached
  // artifact queries so the viewport refetches the fresh parquets. The
  // grid parquet may also have been rewritten upstream of offsets, so
  // refresh both. Keyed off the pipeline context only — avoiding mutation
  // objects as effect deps because their identity churns each render and
  // would otherwise fire this effect on every 800 ms poll tick.
  const prevOffsetsDone = React.useRef(false);
  React.useEffect(() => {
    const done =
      pipelineState.kind === "done" &&
      pipelineState.target === "offsets" &&
      !pipelineState.progress.error;
    if (done && !prevOffsetsDone.current && projectId) {
      qc.invalidateQueries({ queryKey: offsetArtifactKeys.project(projectId) });
      qc.invalidateQueries({ queryKey: gridArtifactKeys.project(projectId) });
    }
    prevOffsetsDone.current = done;
  }, [pipelineState, projectId, qc]);

  // Memoize the viewport element and the `regionPolygons` prop so the
  // pipeline report context's 800 ms polling cadence doesn't cascade new
  // array / JSX identities into GisViewerViewport — the tile selector
  // dropdown and the MapLibre instance below it both reset when their
  // host element churns, which reads as "blinking" to the user.
  const regionFiles = React.useMemo(
    () => regioning?.files ?? [],
    [regioning],
  );
  const viewport = React.useMemo(
    () => (
      <OffsetsGridViewport projectId={projectId} regionPolygons={regionFiles} />
    ),
    [projectId, regionFiles],
  );

  return (
    <ProjectSettingsPage title="Offsetters" viewport={viewport}>
      <ProjectOffsetters />
    </ProjectSettingsPage>
  );
}
