"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectDesign } from "@/components/features/project/project-design";
import type { DesignGroup } from "@/components/features/project/project-design";
import { ProjectDesignOptions } from "@/components/features/project/project-design-options";
import { PatchViewport } from "@/components/features/project/patch-viewport";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { PatchParams } from "@/components/features/project/patch-viewport";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

type DesignTab = "attributes" | "region";

function toParams(g: DesignGroup): PatchParams {
  return {
    rpi: Number(g.rpi) || 0,
    rli: Number(g.rli) || 0,
    spi: Number(g.spi) || 0,
    sli: Number(g.sli) || 0,
    activeRl: Number(g.activeRl) || 0,
    activeRp: Number(g.activeRp) || 0,
    spSalvo: Number(g.spSalvo) || 0,
    roll: Number(g.roll) || 0,
  };
}

export default function DesignPage() {
  const [tab, setTab] = React.useState<DesignTab>("attributes");
  const [params, setParams] = React.useState<PatchParams | null>(null);
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { state: pipelineState } = usePipelineReport();

  const handleActiveChange = React.useCallback((group: DesignGroup) => {
    setParams(toParams(group));
  }, []);

  // When a grid closure finishes successfully, invalidate the cached
  // artifact queries so the viewport refetches with the fresh parquets.
  // The cache otherwise survives tab switches and page revisits, which
  // is the "persist grid after creation" behaviour we want.
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

  const viewport = React.useMemo(() => {
    if (tab === "attributes") {
      return params ? (
        <PatchViewport params={params} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder />
        </div>
      );
    }
    return (
      <DesignGridViewport
        projectId={projectId}
        regionPolygons={regioning?.files ?? []}
      />
    );
  }, [tab, params, projectId, regioning]);

  return (
    <ProjectSettingsPage title="Design" panelTitle="Design" viewport={viewport}>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DesignTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="region">Options</TabsTrigger>
        </TabsList>
        <TabsContent value="attributes" className="min-h-0 flex-1 overflow-y-auto">
          <ProjectDesign onActiveChange={handleActiveChange} />
        </TabsContent>
        <TabsContent value="region" className="min-h-0 flex-1 overflow-y-auto">
          <ProjectDesignOptions />
        </TabsContent>
      </Tabs>
    </ProjectSettingsPage>
  );
}
