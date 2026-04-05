"use client";

import * as React from "react";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectDesign } from "@/components/features/project/project-design";
import type { DesignGroup } from "@/components/features/project/project-design";
import { ProjectDesignOptions } from "@/components/features/project/project-design-options";
import { PatchViewport } from "@/components/features/project/patch-viewport";
import type { PatchParams } from "@/components/features/project/patch-viewport";

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

  return (
    <ProjectSettingsPage
      title="Design"
      panelTitle="Attributes"
      viewport={params ? <PatchViewport params={params} /> : undefined}
    >
      <ProjectDesign onActiveChange={handleActiveChange} />
      <div className="mt-[var(--control-height-md)]">
        <h2 className="mb-[var(--space-4)] text-sm font-semibold text-[var(--color-text-primary)]">
          Options
        </h2>
        <ProjectDesignOptions />
      </div>
    </ProjectSettingsPage>
  );
}
