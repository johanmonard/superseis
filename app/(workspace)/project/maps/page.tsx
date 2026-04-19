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
import { useProjectFiles, useProjectFilesGeoJson } from "@/services/query/project-files";
import { appIcons, Icon } from "@/components/ui/icon";

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

  // Loading progress: react-query tracks per-file fetch+parse state. We
  // dedupe `visibleFiles` by source (multiple layers can share a .gpkg) and
  // drop refs to files that don't actually exist in the project's file list
  // — those queries stay pending forever and would peg the bar mid-progress.
  // Tile tessellation continues lazily after data arrives but is fast enough
  // not to need its own indicator.
  const { data: projectFiles } = useProjectFiles(projectId);
  const fileRefs = React.useMemo(() => {
    const seen = new Set<string>();
    const refs: Array<{ category: FileCategory; filename: string }> = [];
    for (const vf of visibleFiles) {
      const key = `${vf.category}/${vf.filename}`;
      if (seen.has(key)) continue;
      if (projectFiles) {
        const list = projectFiles[vf.category] ?? [];
        if (!list.includes(vf.filename)) continue;
      }
      seen.add(key);
      refs.push({ category: vf.category, filename: vf.filename });
    }
    return refs;
  }, [visibleFiles, projectFiles]);
  const queries = useProjectFilesGeoJson(projectId, fileRefs);
  const totalFiles = queries.length;
  const loadedFiles = queries.filter((q) => q.data != null).length;
  const isLoadingLayers = totalFiles > 0 && loadedFiles < totalFiles;
  const progressPct = totalFiles === 0 ? 0 : Math.round((loadedFiles / totalFiles) * 100);

  // Legend rows are one per defined layer in the active map's order — not
  // per source file like the default. Multiple layers can share a .gpkg,
  // and the user thinks in layer names ("motorways", "open_roads"), not
  // file stems.
  const legendItems = React.useMemo(
    () =>
      info?.layers.map((l) => ({
        key: l.name,
        color: l.color,
        label: l.name,
      })) ?? [],
    [info],
  );

  return (
    <ProjectSettingsPage
      title="Maps"
      viewport={
        hasData ? (
          <div className="relative h-full w-full">
            {isLoadingLayers && (
              <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/90 px-[var(--space-3)] py-[var(--space-2)] shadow-[0_4px_12px_var(--color-shadow-alpha)] backdrop-blur">
                <div className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-secondary)]">
                  <Icon icon={appIcons.loader} size={12} className="animate-spin" />
                  <span className="font-mono tabular-nums">
                    Loading layers {loadedFiles} / {totalFiles}
                  </span>
                </div>
                <div className="mt-[var(--space-1)] h-1 w-40 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                  <div
                    className="h-full bg-[var(--color-accent)] transition-[width] duration-200"
                    // eslint-disable-next-line template/no-jsx-style-prop -- runtime progress width
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
            <GisViewerViewport
              projectId={projectId}
              visibleFiles={visibleFiles}
              legendItems={legendItems}
              onStyleChange={() => {
                /* legend edits ignored — styling is driven by the Layers page */
              }}
            />
          </div>
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
