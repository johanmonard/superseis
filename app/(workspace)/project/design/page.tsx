"use client";

import * as React from "react";
import { ProjectDesign } from "@/components/features/project/project-design";
import type { DesignGroup } from "@/components/features/project/project-design";
import { ProjectDesignOptions } from "@/components/features/project/project-design-options";
import { PatchViewport } from "@/components/features/project/patch-viewport";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { PatchParams } from "@/components/features/project/patch-viewport";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  const handleActiveChange = React.useCallback((group: DesignGroup) => {
    setParams(toParams(group));
  }, []);

  const viewport =
    tab === "attributes" && params ? (
      <PatchViewport params={params} />
    ) : (
      <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
        <ViewportPlaceholder />
      </div>
    );

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
