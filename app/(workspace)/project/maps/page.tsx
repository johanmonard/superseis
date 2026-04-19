"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import {
  ProjectMaps,
  type ActiveMapInfo,
} from "@/components/features/project/project-maps";
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

export default function MapsPage() {
  const [projectId, setProjectId] = React.useState<number | null>(null);
  const [info, setInfo] = React.useState<ActiveMapInfo | null>(null);

  const handleChange = React.useCallback(
    (pid: number | null, next: ActiveMapInfo | null) => {
      setProjectId(pid);
      setInfo(next);
    },
    [],
  );

  // Build one VisibleFile per (layer, source file). Order matters:
  // deck.gl renders earlier entries first (at the bottom) and later
  // entries on top, so the user's list order maps directly to stacking —
  // first layer in the map = bottom, last layer = top.
  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    if (!info) return [];
    const out: VisibleFile[] = [];
    for (const layer of info.layers) {
      if (layer.sourceFiles.length === 0) continue;
      const style: GisLayerStyle = {
        color: layer.color,
        width: 2,
        opacity: 1,
        fillOpacity: 1,
        filled: true,
        visible: true,
      };
      const fclassFilter =
        layer.sourceValues.length > 0 ? layer.sourceValues : undefined;
      for (const stem of layer.sourceFiles) {
        const category: FileCategory = stem.startsWith("osm_edits_")
          ? "osm_edits"
          : "gis_layers";
        out.push({
          category,
          filename: `${stem}.gpkg`,
          style,
          fclassFilter,
        });
      }
    }
    return out;
  }, [info]);

  const hasData = visibleFiles.length > 0;

  return (
    <ProjectSettingsPage
      title="Maps"
      viewport={
        hasData ? (
          <GisViewerViewport
            projectId={projectId}
            visibleFiles={visibleFiles}
            onStyleChange={() => {
              /* legend edits ignored — styling is driven by the Layers page */
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder
              variant="constellation"
              message="Add layers to this map to see them here"
            />
          </div>
        )
      }
    >
      <ProjectMaps onActiveMapChange={handleChange} />
    </ProjectSettingsPage>
  );
}
