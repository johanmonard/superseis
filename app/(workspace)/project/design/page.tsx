"use client";

import * as React from "react";
import { ProjectDesign } from "@/components/features/project/project-design";
import type { DesignGroup } from "@/components/features/project/project-design";
import { PatchViewport } from "@/components/features/project/patch-viewport";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { PatchParams } from "@/components/features/project/patch-viewport";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";

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
  const [params, setParams] = React.useState<PatchParams | null>(null);

  const handleActiveChange = React.useCallback((group: DesignGroup) => {
    setParams(toParams(group));
  }, []);

  const viewport = params ? (
    <PatchViewport params={params} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
      <ViewportPlaceholder />
    </div>
  );

  return (
    <ProjectSettingsPage title="Design" viewport={viewport}>
      <ProjectDesign onActiveChange={handleActiveChange} />
    </ProjectSettingsPage>
  );
}
