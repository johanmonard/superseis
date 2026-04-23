"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectPartitions } from "@/components/features/project/project-partitions";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import type { VisibleFile, GisLayerStyle } from "@/components/features/project/project-gis-viewer";
import { useSectionData } from "@/lib/use-autosave";
import type { FileCategory } from "@/services/api/project-files";

const GisViewerViewport = dynamic(
  () =>
    import("@/components/features/project/gis-viewer-viewport").then(
      (m) => m.GisViewerViewport,
    ),
  { ssr: false },
);

const PALETTE = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444",
  "#a855f7", "#06b6d4", "#f59e0b", "#ec4899",
];

type PersistedStyles = Record<
  string,
  { color: string; width: number; opacity: number; filled?: boolean }
>;

export default function PartitionsPage() {
  const [projectId, setProjectId] = React.useState<number | null>(null);
  const [polygonNames, setPolygonNames] = React.useState<string[]>([]);

  // Shared persisted styles (same store as the files page)
  const { data: savedStyles, update: updateSavedStyles } =
    useSectionData<PersistedStyles>(projectId, "gis_styles", {});

  const handlePolygonsChange = React.useCallback(
    (pid: number | null, names: string[]) => {
      setProjectId(pid);
      setPolygonNames(names);
    },
    [],
  );

  // Build VisibleFile[] from polygon names, reading persisted styles
  const visibleFiles: VisibleFile[] = React.useMemo(() => {
    let idx = 0;
    return polygonNames.map((name) => {
      const filename = `${name}.gpkg`;
      const key = `polygons/${filename}`;
      const saved = savedStyles[key];
      let style: GisLayerStyle;
      if (saved) {
        style = {
          color: saved.color,
          width: saved.width,
          opacity: saved.opacity ?? 0.8,
          filled: saved.filled ?? true,
          visible: true,
        };
      } else {
        style = {
          color: PALETTE[idx % PALETTE.length],
          width: 2,
          opacity: 0.8,
          filled: true,
          visible: true,
        };
      }
      idx++;
      return { category: "polygons" as FileCategory, filename, style };
    });
  }, [polygonNames, savedStyles]);

  // Track local overrides so legend changes are reflected immediately
  const [styleOverrides, setStyleOverrides] = React.useState<
    Record<string, Partial<GisLayerStyle>>
  >({});

  const mergedFiles: VisibleFile[] = React.useMemo(
    () =>
      visibleFiles.map((f) => {
        const key = `${f.category}/${f.filename}`;
        const over = styleOverrides[key];
        return over ? { ...f, style: { ...f.style, ...over } } : f;
      }),
    [visibleFiles, styleOverrides],
  );

  const handleStyleChange = React.useCallback(
    (category: FileCategory, filename: string, patch: Partial<GisLayerStyle>) => {
      const key = `${category}/${filename}`;

      // Immediate local update
      setStyleOverrides((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...patch },
      }));

      // Persist to gis_styles (shared with files page)
      const current = visibleFiles.find(
        (f) => f.category === category && f.filename === filename,
      );
      if (current) {
        const merged = { ...current.style, ...styleOverrides[key], ...patch };
        updateSavedStyles({
          ...savedStyles,
          [key]: {
            color: merged.color,
            width: merged.width,
            opacity: merged.opacity,
            filled: merged.filled,
          },
        });
      }
    },
    [visibleFiles, styleOverrides, savedStyles, updateSavedStyles],
  );

  // Clear overrides when polygon set changes (persisted styles take over)
  React.useEffect(() => {
    setStyleOverrides({});
  }, [polygonNames]);

  return (
    <ProjectSettingsPage
      title="Partitions"
      viewport={
        polygonNames.length > 0 ? (
          <GisViewerViewport
            projectId={projectId}
            visibleFiles={mergedFiles}
            onStyleChange={handleStyleChange}
            viewStateKey={projectId != null ? `partitions:${projectId}` : undefined}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder variant="constellation" message="Add polygons" />
          </div>
        )
      }
    >
      <ProjectPartitions onActivePolygonsChange={handlePolygonsChange} />
    </ProjectSettingsPage>
  );
}
