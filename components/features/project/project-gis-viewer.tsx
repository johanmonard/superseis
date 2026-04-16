"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { useProjectFiles, useUploadProjectFile, useDeleteProjectFile } from "@/services/query/project-files";
import type { FileCategory } from "@/services/api/project-files";
import { ProjectSettingsPage } from "./project-settings-page";
import { Button } from "@/components/ui/button";
import { appIcons } from "@/components/ui/icon";

const { upload: Upload, x: X } = appIcons;

const ACCEPTED_EXTENSIONS = ".gpkg,.kml,.zip";

const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: "polygons", label: "Polygons" },
  { key: "poi", label: "POI" },
  { key: "layers", label: "Layers" },
];

export interface GisLayerStyle {
  color: string;
  width: number;
  opacity: number; // 0–1
  filled: boolean;
  visible: boolean;
}

export type VisibleFile = {
  category: FileCategory;
  filename: string;
  style: GisLayerStyle;
};

const PALETTE = [
  "#f97316", "#3b82f6", "#22c55e", "#ef4444",
  "#a855f7", "#06b6d4", "#f59e0b", "#ec4899",
];

type PersistedStyles = Record<string, { color: string; width: number; opacity: number; filled?: boolean }>;

const GisViewerViewport = dynamic(
  () => import("./gis-viewer-viewport").then((m) => m.GisViewerViewport),
  { ssr: false },
);

export function ProjectGisViewer() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const { data: files } = useProjectFiles(projectId);
  const uploadMutation = useUploadProjectFile(projectId);
  const deleteMutation = useDeleteProjectFile(projectId);

  // Persisted styles from config.json
  const { data: savedStyles, update: updateSavedStyles } = useSectionData<PersistedStyles>(
    projectId, "gis_styles", {},
  );

  const [visibleFiles, setVisibleFiles] = React.useState<VisibleFile[]>([]);
  const colorIdx = React.useRef(0);

  const fileInputRefs = React.useRef<Partial<Record<FileCategory, HTMLInputElement | null>>>({
    polygons: null,
    poi: null,
    layers: null,
  });

  const getStyleForFile = React.useCallback((category: FileCategory, filename: string): GisLayerStyle => {
    const key = `${category}/${filename}`;
    const saved = savedStyles[key];
    if (saved) return { color: saved.color, width: saved.width, opacity: saved.opacity ?? 0.8, filled: saved.filled ?? (category === "polygons"), visible: true };
    const color = PALETTE[colorIdx.current % PALETTE.length];
    colorIdx.current++;
    return { color, width: category === "poi" ? 6 : 2, opacity: 0.8, filled: category === "polygons", visible: true };
  }, [savedStyles]);

  const toggleFile = React.useCallback((category: FileCategory, filename: string) => {
    setVisibleFiles((prev) => {
      const exists = prev.find((f) => f.category === category && f.filename === filename);
      if (exists) {
        return prev.filter((f) => !(f.category === category && f.filename === filename));
      }
      return [...prev, { category, filename, style: getStyleForFile(category, filename) }];
    });
  }, [getStyleForFile]);

  const updateStyle = React.useCallback((category: FileCategory, filename: string, patch: Partial<GisLayerStyle>) => {
    setVisibleFiles((prev) =>
      prev.map((f) =>
        f.category === category && f.filename === filename
          ? { ...f, style: { ...f.style, ...patch } }
          : f
      )
    );
    // Persist to config.json
    const key = `${category}/${filename}`;
    const current = visibleFiles.find((f) => f.category === category && f.filename === filename);
    if (current) {
      const merged = { ...current.style, ...patch };
      updateSavedStyles({ ...savedStyles, [key]: { color: merged.color, width: merged.width, opacity: merged.opacity, filled: merged.filled } });
    }
  }, [visibleFiles, savedStyles, updateSavedStyles]);

  const handleUpload = React.useCallback(
    (category: FileCategory, fileList: FileList) => {
      Array.from(fileList).forEach((file) => {
        uploadMutation.mutate({ category, file });
      });
    },
    [uploadMutation]
  );

  const handleDelete = React.useCallback(
    (category: FileCategory, filename: string) => {
      setVisibleFiles((prev) => prev.filter((f) => !(f.category === category && f.filename === filename)));
      // Remove persisted style
      const key = `${category}/${filename}`;
      const next = { ...savedStyles };
      delete next[key];
      updateSavedStyles(next);
      deleteMutation.mutate({ category, filename });
    },
    [deleteMutation, savedStyles, updateSavedStyles]
  );

  const panel = (
    <div className="flex flex-col gap-[var(--space-4)]">
      {FILE_CATEGORIES.map(({ key, label }) => {
        const categoryFiles = files?.[key] ?? [];
        return (
          <div key={key} className="flex flex-col gap-[var(--space-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {label}
              </span>
              <div className="flex items-center gap-1">
                <input
                  ref={(el) => { fileInputRefs.current[key] = el; }}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXTENSIONS}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleUpload(key, e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploadMutation.isPending}
                  onClick={() => fileInputRefs.current[key]?.click()}
                >
                  <Upload size={12} className="mr-[var(--space-1)]" />
                  Upload
                </Button>
              </div>
            </div>
            {categoryFiles.length === 0 ? (
              <p className="px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
                No files.
              </p>
            ) : (
              <div className="flex flex-col gap-[var(--space-1)]">
                {categoryFiles.map((name) => {
                  const isChecked = visibleFiles.some((f) => f.category === key && f.filename === name);
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleFile(key, name)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">
                        {name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(key, name)}
                        disabled={deleteMutation.isPending}
                        className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {uploadMutation.error ? (
        <p className="text-xs text-[var(--color-status-danger)]">
          {(uploadMutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );

  return (
    <ProjectSettingsPage
      title="Files"
      panelTitle="GIS Files"
      viewport={
        <GisViewerViewport
          projectId={projectId}
          visibleFiles={visibleFiles}
          onStyleChange={updateStyle}
        />
      }
    >
      {panel}
    </ProjectSettingsPage>
  );
}
