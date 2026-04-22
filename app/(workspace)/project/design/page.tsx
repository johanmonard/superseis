"use client";

import * as React from "react";
import { ProjectDesign } from "@/components/features/project/project-design";
import type { DesignGroup } from "@/components/features/project/project-design";
import { PatchViewport } from "@/components/features/project/patch-viewport";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { PatchParams } from "@/components/features/project/patch-viewport";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { DesignAnalysisPanel } from "@/components/features/project/design-analysis-panel";
import type { DesignAnalyzeRequest } from "@/services/api/project-design-analyze";
import { useActiveProject } from "@/lib/use-active-project";

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

function toAnalyzeRequest(g: DesignGroup): DesignAnalyzeRequest | null {
  const rpi = Number(g.rpi);
  const rli = Number(g.rli);
  const spi = Number(g.spi);
  const sli = Number(g.sli);
  const active_rl = Number(g.activeRl);
  const active_rp = Number(g.activeRp);
  const sp_salvo = Math.max(1, Number(g.spSalvo) || 1);
  if (rpi <= 0 || rli <= 0 || spi <= 0 || sli <= 0 || active_rl < 1 || active_rp < 1) {
    return null;
  }
  return { rpi, rli, spi, sli, active_rl, active_rp, sp_salvo };
}

export default function DesignPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const [params, setParams] = React.useState<PatchParams | null>(null);
  const [activeGroup, setActiveGroup] = React.useState<DesignGroup | null>(null);
  const [groups, setGroups] = React.useState<DesignGroup[]>([]);
  const [analysisOpen, setAnalysisOpen] = React.useState(false);

  const handleActiveChange = React.useCallback((group: DesignGroup) => {
    setParams(toParams(group));
    setActiveGroup(group);
  }, []);

  const handleGroupsChange = React.useCallback((gs: DesignGroup[]) => {
    setGroups(gs);
  }, []);

  const viewport = params ? (
    <PatchViewport params={params} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
      <ViewportPlaceholder />
    </div>
  );

  const analyzeRequests = React.useMemo(
    () =>
      groups
        .map((g) => {
          const req = toAnalyzeRequest(g);
          return req ? { id: g.id, request: req } : null;
        })
        .filter((x): x is { id: string; request: DesignAnalyzeRequest } => x !== null),
    [groups],
  );

  const middlePanel =
    analysisOpen && projectId != null && activeGroup && analyzeRequests.length > 0 ? (
      <DesignAnalysisPanel
        projectId={projectId}
        requests={analyzeRequests}
        activeId={activeGroup.id}
        onClose={() => setAnalysisOpen(false)}
      />
    ) : undefined;

  return (
    <ProjectSettingsPage title="Design" viewport={viewport} middlePanel={middlePanel}>
      <ProjectDesign
        onActiveChange={handleActiveChange}
        onGroupsChange={handleGroupsChange}
        onAnalyzeToggle={() => setAnalysisOpen((v) => !v)}
        analysisOpen={analysisOpen}
      />
    </ProjectSettingsPage>
  );
}
