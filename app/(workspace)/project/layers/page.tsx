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
import { useProjectSection } from "@/services/query/project-sections";
import { useProjectFiles } from "@/services/query/project-files";

interface SurveyGroupShape {
  acquisitionPolygon?: string;
}

interface PersistedGisStyle {
  color: string;
  width: number;
  opacity: number;
  filled?: boolean;
}

const POLYGON_DEFAULT_STYLE: GisLayerStyle = {
  color: "#94a3b8",
  width: 2,
  opacity: 0.9,
  filled: false,
  visible: true,
};

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

  const { data: surveySection } = useProjectSection(projectId, "survey");
  const { data: gisStylesSection } = useProjectSection(projectId, "gis_styles");
  const { data: projectFiles } = useProjectFiles(projectId);

  // Polygons (without .gpkg) referenced by any survey option, deduped in
  // first-seen order. Shared polygons across options only appear once.
  const acqPolygonNames = React.useMemo(() => {
    const groups = (surveySection?.data as { groups?: SurveyGroupShape[] } | undefined)?.groups;
    if (!Array.isArray(groups)) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of groups) {
      const name = typeof g?.acquisitionPolygon === "string" ? g.acquisitionPolygon.trim() : "";
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }, [surveySection]);

  const [addedPolygons, setAddedPolygons] = React.useState<string[]>([]);
  const [polygonVisibility, setPolygonVisibility] = React.useState<
    Record<string, boolean>
  >({});
  // fclass values the user hid for visual check — local only, doesn't touch
  // the Source Value selection on the left panel.
  const [hiddenFclasses, setHiddenFclasses] = React.useState<Set<string>>(
    () => new Set(),
  );

  // Reset hidden fclasses whenever the active layer's selection changes so a
  // stale hide doesn't suppress a newly-selected fclass from view.
  const sourceValuesKey = info?.sourceValues.join("|") ?? "";
  React.useEffect(() => {
    setHiddenFclasses(new Set());
  }, [sourceValuesKey]);

  const polygonFiles: VisibleFile[] = React.useMemo(() => {
    const savedStyles =
      (gisStylesSection?.data as Record<string, PersistedGisStyle> | undefined) ?? {};
    const seen = new Set<string>();
    const out: VisibleFile[] = [];
    const push = (name: string) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      const filename = `${name}.gpkg`;
      const key = `polygons/${filename}`;
      const saved = savedStyles[key];
      const visible = polygonVisibility[key] ?? true;
      const style: GisLayerStyle = saved
        ? {
            color: saved.color,
            width: saved.width,
            opacity: saved.opacity ?? POLYGON_DEFAULT_STYLE.opacity,
            filled: false,
            visible,
          }
        : { ...POLYGON_DEFAULT_STYLE, visible };
      out.push({ category: "polygons" as FileCategory, filename, style });
    };
    for (const n of addedPolygons) push(n);
    for (const n of acqPolygonNames) push(n);
    return out;
  }, [acqPolygonNames, addedPolygons, gisStylesSection, polygonVisibility]);

  // Effective fclass filter drops values the user hid in the legend; an empty
  // result hides the file entirely (visible: false).
  const layerFiles: VisibleFile[] = React.useMemo(() => {
    if (!info || info.sourceFiles.length === 0) return [];
    const effective = info.sourceValues.filter((v) => !hiddenFclasses.has(v));
    const allHidden = info.sourceValues.length > 0 && effective.length === 0;
    const style: GisLayerStyle = {
      color: info.color,
      width: 2,
      opacity: 1,
      fillOpacity: 1,
      filled: true,
      visible: !allHidden,
    };
    const fclassFilter = effective.length > 0 ? effective : undefined;
    return info.sourceFiles.map<VisibleFile>((stem) => {
      const category: FileCategory =
        info.sourceCategory === "polygons"
          ? "polygons"
          : stem.startsWith("osm_edits_")
            ? "osm_edits"
            : "gis_layers";
      return {
        category,
        filename: `${stem}.gpkg`,
        style,
        fclassFilter,
      };
    });
  }, [info, hiddenFclasses]);

  // Layer files first (bottom), polygons last so they stay on top.
  const visibleFiles = React.useMemo(
    () => [...layerFiles, ...polygonFiles],
    [layerFiles, polygonFiles],
  );

  // Polygon files available to add — excludes ones already shown.
  const addPolygonOptions = React.useMemo(() => {
    const all = (projectFiles?.polygons ?? []).map((f) => f.replace(/\.gpkg$/, ""));
    const shown = new Set<string>([...acqPolygonNames, ...addedPolygons]);
    return all.filter((n) => !shown.has(n));
  }, [projectFiles?.polygons, acqPolygonNames, addedPolygons]);

  const handleAddPolygon = React.useCallback((name: string) => {
    setAddedPolygons((prev) => (prev.includes(name) ? prev : [...prev, name]));
  }, []);

  const togglePolygonVisibility = React.useCallback((key: string) => {
    setPolygonVisibility((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  }, []);

  const removeAddedPolygon = React.useCallback((name: string) => {
    setAddedPolygons((prev) => prev.filter((n) => n !== name));
    setPolygonVisibility((prev) => {
      const next = { ...prev };
      delete next[`polygons/${name}.gpkg`];
      return next;
    });
  }, []);

  const toggleFclass = React.useCallback((value: string) => {
    setHiddenFclasses((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  // Legend items: one row per fclass, then polygon rows. A divider sits
  // between the two groups only when both are present.
  const legendItems = React.useMemo(() => {
    const items: Array<{
      key: string;
      color: string;
      label: string;
      visible?: boolean;
      onToggle?: () => void;
      onRemove?: () => void;
      separator?: boolean;
    }> = [];
    const fclassValues = info?.sourceValues ?? [];
    for (const fclass of fclassValues) {
      items.push({
        key: `fclass/${fclass}`,
        color: info!.color,
        label: fclass,
        visible: !hiddenFclasses.has(fclass),
        onToggle: () => toggleFclass(fclass),
      });
    }
    if (fclassValues.length > 0 && polygonFiles.length > 0) {
      items.push({ key: "sep/polygons", color: "", label: "", separator: true });
    }
    // Legend order differs from map stacking: list acquisition polygons
    // first, then user-added ones (newest at the bottom), regardless of how
    // `polygonFiles` is ordered for rendering.
    const byName = new Map<string, (typeof polygonFiles)[number]>();
    for (const f of polygonFiles) {
      byName.set(f.filename.replace(/\.gpkg$/, ""), f);
    }
    const pushPolygonItem = (name: string, removable: boolean) => {
      const f = byName.get(name);
      if (!f) return;
      const key = `polygons/${f.filename}`;
      items.push({
        key,
        color: f.style.color,
        label: name,
        visible: f.style.visible !== false,
        onToggle: () => togglePolygonVisibility(key),
        onRemove: removable ? () => removeAddedPolygon(name) : undefined,
      });
    };
    for (const n of acqPolygonNames) pushPolygonItem(n, false);
    for (const n of addedPolygons) pushPolygonItem(n, true);
    return items;
  }, [
    info,
    hiddenFclasses,
    polygonFiles,
    acqPolygonNames,
    addedPolygons,
    toggleFclass,
    togglePolygonVisibility,
    removeAddedPolygon,
  ]);

  const hasLayerData =
    layerFiles.length > 0 && (info?.sourceValues.length ?? 0) > 0;
  const hasData = hasLayerData || polygonFiles.length > 0;

  return (
    <ProjectSettingsPage
      title="Layers"
      viewport={
        hasData ? (
          <GisViewerViewport
            projectId={projectId}
            visibleFiles={visibleFiles}
            onStyleChange={() => {
              /* legend styling handled through dedicated state */
            }}
            legendItems={legendItems}
            addPolygonOptions={addPolygonOptions}
            onAddPolygon={handleAddPolygon}
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
