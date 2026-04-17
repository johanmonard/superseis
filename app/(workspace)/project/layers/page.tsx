"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import {
  ProjectLayers,
  type ActiveLayerInfo,
} from "@/components/features/project/project-layers";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type {
  VisibleFile,
  GisLayerStyle,
} from "@/components/features/project/project-gis-viewer";
import type { FileCategory } from "@/services/api/project-files";

const GisViewerViewport = dynamic(
  () =>
    import("@/components/features/project/gis-viewer-viewport").then(
      (m) => m.GisViewerViewport,
    ),
  { ssr: false },
);

export default function LayersPage() {
  const [projectId, setProjectId] = React.useState<number | null>(null);
  const [info, setInfo] = React.useState<ActiveLayerInfo | null>(null);

  const handleChange = React.useCallback(
    (pid: number | null, next: ActiveLayerInfo | null) => {
      setProjectId(pid);
      setInfo(next);
    },
    [],
  );

  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    if (!info || info.sourceFiles.length === 0) return [];
    const style: GisLayerStyle = {
      color: info.color,
      width: 2,
      opacity: 1,
      fillOpacity: 1,
      filled: true,
      visible: true,
    };
    const fclassFilter =
      info.sourceValues.length > 0 ? info.sourceValues : undefined;
    return info.sourceFiles.map<VisibleFile>((stem) => {
      const category: FileCategory = stem.startsWith("osm_edits_")
        ? "osm_edits"
        : "gis_layers";
      return {
        category,
        filename: `${stem}.gpkg`,
        style,
        fclassFilter,
      };
    });
  }, [info]);

  const hasData = visibleFiles.length > 0 && (info?.sourceValues.length ?? 0) > 0;

  return (
    <ProjectSettingsPage
      title="Layers"
      viewport={
        hasData ? (
          <GisViewerViewport
            projectId={projectId}
            visibleFiles={visibleFiles}
            onStyleChange={() => {
              /* legend edits ignored — styling is driven by the form */
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder
              variant="constellation"
              message="Pick source files and fclass values"
            />
          </div>
        )
      }
    >
      <ProjectLayers onActiveLayerChange={handleChange} />
    </ProjectSettingsPage>
  );
}
