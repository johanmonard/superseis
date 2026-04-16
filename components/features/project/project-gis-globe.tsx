"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveProject } from "@/lib/use-active-project";
import { useProjectFiles, projectFileKeys } from "@/services/query/project-files";
import {
  fetchProjectFileRaw,
  saveProjectFileRaw,
  projectDemTileUrl,
  projectDemManifestUrl,
} from "@/services/api/project-files";
import type { FileCategory } from "@/services/api/project-files";
import { getRuntimeConfig } from "@/services/config/runtimeConfig";
import { ProjectSettingsPage } from "./project-settings-page";
import { appIcons } from "@/components/ui/icon";

const { pencil: Pencil } = appIcons;
import {
  gpkgToGeoJSON,
  insertGpkgFeatures,
  deleteGpkgFeatures,
  updateGpkgFeatures,
  exportDatabase,
  initializeGpkgSchema,
  ensureGpkgColumns,
} from "@/lib/gpkg";
import type {
  GeoJSONFeatureCollection,
  GpkgMeta,
  GpkgInitGeomType,
} from "@/lib/gpkg";
import type {
  RampName,
  LayerStyle,
} from "@/components/features/demo/gis-globe-viewport";

const GisGlobeViewport = dynamic(
  () =>
    import("@/components/features/demo/gis-globe-viewport").then(
      (m) => m.GisGlobeViewport
    ),
  { ssr: false }
);

// --------------------------------------------------------------------------
// Palettes (same as demo)
// --------------------------------------------------------------------------

const LAYER_PALETTE: ReadonlyArray<string> = [
  "#facc15", "#60a5fa", "#f472b6", "#34d399", "#f97316", "#a855f7",
  "#22d3ee", "#fb7185", "#84cc16", "#eab308", "#38bdf8", "#c084fc",
];

const FCLASS_PALETTE: ReadonlyArray<string> = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#64748b",
  "#78716c", "#a3a3a3",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFor(file: string): string {
  return LAYER_PALETTE[hashString(file) % LAYER_PALETTE.length];
}

function fclassColorFor(value: string): string {
  return FCLASS_PALETTE[hashString(value) % FCLASS_PALETTE.length];
}

// --------------------------------------------------------------------------
// User-edit files
// --------------------------------------------------------------------------

type LoadedEntry = { data: GeoJSONFeatureCollection; meta: GpkgMeta };

const EDIT_FILES = {
  point: "user_edits_points.gpkg",
  line: "user_edits_lines.gpkg",
  polygon: "user_edits_polygons.gpkg",
} as const;
type EditKind = keyof typeof EDIT_FILES;
const EDIT_KINDS: ReadonlyArray<EditKind> = ["point", "line", "polygon"];

const EDIT_GEOMETRY_TYPE: Record<EditKind, GpkgInitGeomType> = {
  point: "POINT",
  line: "LINESTRING",
  polygon: "POLYGON",
};

// The 3 user_edits file keys in the regular selectedFiles/dbsRef system.
const EDIT_FILE_KEYS: Record<EditKind, string> = {
  point: `user_edits/${EDIT_FILES.point}`,
  line: `user_edits/${EDIT_FILES.line}`,
  polygon: `user_edits/${EDIT_FILES.polygon}`,
};
const ALL_EDIT_FILE_KEYS = new Set(Object.values(EDIT_FILE_KEYS));

function editKindForGeometry(
  geom: GeoJSON.Geometry | null | undefined
): EditKind | null {
  if (!geom) return null;
  const t = geom.type;
  if (t === "Point" || t === "MultiPoint") return "point";
  if (t === "LineString" || t === "MultiLineString") return "line";
  if (t === "Polygon" || t === "MultiPolygon") return "polygon";
  return null;
}

/** Polygons, POI, and user_edits are edited inline (source DB mutated
 *  directly). OSM Layers use the separate user_edits files. */
const INLINE_EDIT_CATEGORIES = new Set<string>(["polygons", "poi", "user_edits"]);

function isInlineEditKey(fileKey: string): boolean {
  const cat = fileKey.split("/")[0];
  return INLINE_EDIT_CATEGORIES.has(cat);
}

// --------------------------------------------------------------------------
// Sidebar section config
// --------------------------------------------------------------------------

type SidebarSection = {
  key: "polygons" | "poi" | "layers";
  label: string;
  category: FileCategory;
};

const SIDEBAR_SECTIONS: SidebarSection[] = [
  { key: "polygons", label: "Polygons", category: "polygons" },
  { key: "poi", label: "Points Of Interest", category: "poi" },
  { key: "layers", label: "OSM Layers", category: "layers" },
];

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function ProjectGisGlobe() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const queryClient = useQueryClient();
  const { data: fileList } = useProjectFiles(projectId);

  // Selected files keyed as "category/filename" for uniqueness
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
  const [hiddenFiles, setHiddenFiles] = React.useState<Set<string>>(
    () => new Set()
  );
  const [hiddenFclasses, setHiddenFclasses] = React.useState<Set<string>>(
    () => new Set()
  );
  const [layerData, setLayerData] = React.useState<Map<string, LoadedEntry>>(
    () => new Map()
  );
  const [selectedDem, setSelectedDem] = React.useState<string>("");
  const [terrainOn, setTerrainOn] = React.useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = React.useState(1.4);
  const [demOpacity, setDemOpacity] = React.useState(0.85);
  const [demColorRamp, setDemColorRamp] =
    React.useState<RampName>("hypsometric");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [freehand, setFreehand] = React.useState(false);
  const [autoPoly, setAutoPoly] = React.useState(false);
  const [autoVessel, setAutoVessel] = React.useState(false);
  const [autoSegment, setAutoSegment] = React.useState(false);
  const [simplifying, setSimplifying] = React.useState(false);
  const [smoothing, setSmoothing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [reclassifying, setReclassifying] = React.useState(false);
  const [importingDem, setImportingDem] = React.useState(false);
  const [demStatus, setDemStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "fetching" }
    | { kind: "ok"; file: string; tiles: number; zoom: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dirty, setDirty] = React.useState(false);
  const [loadId, setLoadId] = React.useState(0);
  const [discardId, setDiscardId] = React.useState(0);

  const dbsRef = React.useRef<Map<string, Database>>(new Map());
  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);
  // OSM layer files with deferred deletions (applied at save time).
  const deletedPksByFileRef = React.useRef<
    Map<string, Set<number | string>>
  >(new Map());
  // Source files whose in-memory DB has been mutated and needs PUT on save.
  const dirtySourceFilesRef = React.useRef<Set<string>>(new Set());


  // The file designated for editing (independent of visibility selection).
  const [editingFileKey, setEditingFileKey] = React.useState<string | null>(
    null
  );

  // The active file is the one with the edit button toggled on.
  const activeFile =
    editingFileKey && selectedFiles.includes(editingFileKey)
      ? editingFileKey
      : null;
  const canEdit = activeFile != null;

  // Resolve category + filename from a composite key like "polygons/my.gpkg"
  const parseFileKey = React.useCallback(
    (key: string): { category: FileCategory; filename: string } | null => {
      const idx = key.indexOf("/");
      if (idx < 0) return null;
      return {
        category: key.slice(0, idx) as FileCategory,
        filename: key.slice(idx + 1),
      };
    },
    []
  );

  // ------------------------------------------------------------------
  // Bootstrap the 3 user_edits files into dbsRef/layerData on mount.
  // Fetches from disk; creates empty GPKGs if they don't exist yet.
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      if (cancelled) return;

      const results: { key: string; db: Database; data: GeoJSONFeatureCollection; meta: GpkgMeta }[] = [];

      await Promise.all(
        EDIT_KINDS.map(async (kind) => {
          const key = EDIT_FILE_KEYS[kind];
          const fileName = EDIT_FILES[kind];
          let db: Database;
          try {
            const buf = await fetchProjectFileRaw(projectId, "user_edits", fileName);
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            db = new SQL.Database();
            initializeGpkgSchema(db, {
              tableName: fileName.replace(/\.gpkg$/i, ""),
              geometryType: EDIT_GEOMETRY_TYPE[kind],
            });
          }
          const { geojson, meta } = gpkgToGeoJSON(db);
          results.push({ key, db, data: geojson, meta });
        })
      );

      if (cancelled) {
        for (const { db } of results) db.close();
        return;
      }

      for (const { key, db } of results) {
        dbsRef.current.get(key)?.close();
        dbsRef.current.set(key, db);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const { key, data, meta } of results) {
          next.set(key, { data, meta });
        }
        return next;
      });
      // Auto-select edit files that have features
      const nonEmpty = results
        .filter((r) => r.data.features.length > 0)
        .map((r) => r.key);
      if (nonEmpty.length > 0) {
        setSelectedFiles((prev) => {
          const toAdd = nonEmpty.filter((k) => !prev.includes(k));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }
      setLoadId((n) => n + 1);
    })().catch((e) => {
      if (!cancelled) setError(`Failed to initialize edit files: ${String(e)}`);
    });

    return () => { cancelled = true; };
  }, [projectId]);

  // ------------------------------------------------------------------
  // Load/unload GPKG files as selection changes
  // ------------------------------------------------------------------

  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const currentKeys = new Set(layerData.keys());
    const toRemove = [...currentKeys].filter(
      (f) => !selectedFiles.includes(f) && !ALL_EDIT_FILE_KEYS.has(f)
    );
    const toAdd = selectedFiles.filter((f) => !currentKeys.has(f));

    if (toRemove.length > 0) {
      for (const f of toRemove) {
        dbsRef.current.get(f)?.close();
        dbsRef.current.delete(f);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const f of toRemove) next.delete(f);
        return next;
      });
      setHiddenFiles((prev) => {
        if (toRemove.every((f) => !prev.has(f))) return prev;
        const next = new Set(prev);
        for (const f of toRemove) next.delete(f);
        return next;
      });
      setHiddenFclasses((prev) => {
        const removedPrefixes = toRemove.map((f) => `${f}::`);
        let changed = false;
        const next = new Set(prev);
        for (const key of prev) {
          if (removedPrefixes.some((p) => key.startsWith(p))) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // Skip files already loaded (includes edit files bootstrapped above)
    const reallyToAdd = toAdd.filter((f) => !currentKeys.has(f));
    if (reallyToAdd.length === 0) {
      if (toRemove.length > 0) setLoadId((n) => n + 1);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      if (cancelled) return;

      const results = await Promise.all(
        reallyToAdd.map(async (key) => {
          const parsed = parseFileKey(key);
          if (!parsed) throw new Error(`Bad key: ${key}`);
          // For user_edits files, create empty GPKG on 404
          const kind = EDIT_KINDS.find((k) => EDIT_FILE_KEYS[k] === key);
          let db: Database;
          try {
            const buf = await fetchProjectFileRaw(
              projectId,
              parsed.category,
              parsed.filename
            );
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            if (kind) {
              db = new SQL.Database();
              initializeGpkgSchema(db, {
                tableName: parsed.filename.replace(/\.gpkg$/i, ""),
                geometryType: EDIT_GEOMETRY_TYPE[kind],
              });
            } else {
              throw new Error(`Failed to load ${key}`);
            }
          }
          const { geojson, meta } = gpkgToGeoJSON(db);
          return { key, db, data: geojson, meta };
        })
      );

      if (cancelled) {
        for (const { db } of results) db.close();
        return;
      }

      for (const { key, db } of results) {
        dbsRef.current.set(key, db);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const { key, data, meta } of results) {
          next.set(key, { data, meta });
        }
        return next;
      });
      setLoading(false);
      setLoadId((n) => n + 1);
    })().catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles, projectId]);

  // Keep active-file refs in sync
  React.useEffect(() => {
    if (activeFile) {
      dbRef.current = dbsRef.current.get(activeFile) ?? null;
      metaRef.current = layerData.get(activeFile)?.meta ?? null;
    } else {
      dbRef.current = null;
      metaRef.current = null;
      setEditing(false);
      setAdding(false);
      setFreehand(false);
      setAutoPoly(false);
      setAutoVessel(false);
      setAutoSegment(false);
      setSimplifying(false);
      setSmoothing(false);
      setDeleting(false);
    }
  }, [activeFile, layerData]);

  // Clean up on unmount
  React.useEffect(() => {
    const dbs = dbsRef.current;
    return () => {
      for (const db of dbs.values()) db.close();
      dbs.clear();
    };
  }, []);

  // ------------------------------------------------------------------
  // File selection
  // ------------------------------------------------------------------

  const toggleFileSelected = React.useCallback(
    (key: string) => {
      setSelectedFiles((prev) => {
        const removing = prev.includes(key);
        if (removing) {
          // If unchecking the file that is currently designated for editing,
          // clear the edit target.
          setEditingFileKey((cur) => (cur === key ? null : cur));
          return prev.filter((f) => f !== key);
        }
        return [...prev, key];
      });
      setDirty(false);
    },
    []
  );

  const editModesActive =
    editing || adding || freehand || autoPoly || autoVessel || autoSegment ||
    simplifying || smoothing || deleting || reclassifying;

  const toggleEditTarget = React.useCallback(
    (key: string) => {
      // Don't switch edit target while an edit mode is active.
      if (editModesActive) return;
      setEditingFileKey((cur) => (cur === key ? null : key));
    },
    [editModesActive]
  );

  const toggleLayerVisibility = React.useCallback((file: string) => {
    setHiddenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  const toggleFclassVisibility = React.useCallback(
    (file: string, fclass: string) => {
      const key = `${file}::${fclass}`;
      setHiddenFclasses((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const uniqueFclasses = React.useCallback(
    (fc: GeoJSONFeatureCollection | undefined): string[] => {
      if (!fc) return [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const f of fc.features) {
        const raw = f.properties?.fclass;
        if (raw == null) continue;
        const v = String(raw);
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
      }
      out.sort((a, b) => a.localeCompare(b));
      return out;
    },
    []
  );

  // ------------------------------------------------------------------
  // Combined GeoJSON for viewport
  // ------------------------------------------------------------------

  const combinedData =
    React.useMemo<GeoJSONFeatureCollection | null>(() => {
      const features: GeoJSONFeatureCollection["features"] = [];
      for (const key of selectedFiles) {
        const entry = layerData.get(key);
        if (!entry) continue;
        for (const f of entry.data.features) {
          features.push({
            ...f,
            properties: { ...f.properties, __layer: key },
          });
        }
      }
      if (features.length === 0) return null;
      return { type: "FeatureCollection", features };
    }, [selectedFiles, layerData]);

  const layers = React.useMemo<LayerStyle[]>(() => {
    const buildFclasses = (file: string, values: string[]) =>
      values.map((value) => ({
        value,
        color: fclassColorFor(value),
        visible: !hiddenFclasses.has(`${file}::${value}`),
      }));

    // Map category prefix to legend group label
    const GROUP_LABELS: Record<string, string> = {
      polygons: "Polygons",
      poi: "Points Of Interest",
      layers: "OSM Layers",
      user_edits: "OSM Layers",
    };

    // Strip "category/" prefix and ".gpkg"/".tif" extension for display
    const cleanName = (key: string): string => {
      const slash = key.indexOf("/");
      const filename = slash >= 0 ? key.slice(slash + 1) : key;
      return filename.replace(/\.(gpkg|tif)$/i, "");
    };

    // Sort: polygons first, poi, layers, user_edits last (within OSM group)
    const ORDER: Record<string, number> = {
      polygons: 0, poi: 1, layers: 2, user_edits: 3,
    };

    return [...selectedFiles]
      .sort((a, b) => {
        const catA = a.split("/")[0];
        const catB = b.split("/")[0];
        return (ORDER[catA] ?? 99) - (ORDER[catB] ?? 99);
      })
      .map((key) => {
        const entry = layerData.get(key);
        const values = uniqueFclasses(entry?.data);
        const cat = key.split("/")[0];
        return {
          id: key,
          displayName: cleanName(key),
          group: GROUP_LABELS[cat],
          color: colorFor(key),
          visible: !hiddenFiles.has(key),
          fclasses: buildFclasses(key, values),
        };
      });
  }, [
    selectedFiles,
    layerData,
    hiddenFiles,
    hiddenFclasses,
    uniqueFclasses,
  ]);

  // ------------------------------------------------------------------
  // Insert into a user_edits file (via dbsRef/layerData)
  // ------------------------------------------------------------------

  const insertIntoUserEditsFile = React.useCallback(
    (kind: EditKind, feature: GeoJSON.Feature): number | null => {
      const key = EDIT_FILE_KEYS[kind];
      const db = dbsRef.current.get(key);
      const entry = layerData.get(key);
      if (!db || !entry) {
        console.error(`[GIS] insertIntoUserEditsFile: DB or entry missing for "${key}" (kind=${kind}, db=${!!db}, entry=${!!entry})`);
        return null;
      }
      const pks = insertGpkgFeatures(
        db,
        entry.meta,
        [
          {
            type: "Feature",
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: { ...(feature.properties ?? {}) },
          },
        ]
      );
      const newPk = pks[0];
      if (newPk == null) return null;
      const stored = {
        type: "Feature" as const,
        geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
        properties: {
          ...(feature.properties ?? {}),
          [entry.meta.pkCol]: newPk,
        },
      };
      setLayerData((prev) => {
        const next = new Map(prev);
        const cur = next.get(key);
        if (!cur) return prev;
        next.set(key, {
          ...cur,
          data: {
            ...cur.data,
            features: [...cur.data.features, stored],
          },
        });
        return next;
      });
      dirtySourceFilesRef.current.add(key);
      // Auto-select the edit file so it appears on the map
      setSelectedFiles((prev) =>
        prev.includes(key) ? prev : [...prev, key]
      );
      return newPk;
    },
    [layerData]
  );

  // ------------------------------------------------------------------
  // Editing callbacks
  // ------------------------------------------------------------------

  const handleEdited = React.useCallback(
    (features: GeoJSON.Feature[]) => {
      // Separate features by origin: inline-edit source vs OSM source.
      const inlineByFile = new Map<string, GeoJSON.Feature[]>();
      const osmFeatures: GeoJSON.Feature[] = [];

      for (const edited of features) {
        const sourceFile =
          (edited.properties?.__layer as string | undefined) ?? null;
        if (sourceFile && isInlineEditKey(sourceFile)) {
          const list = inlineByFile.get(sourceFile) ?? [];
          list.push(edited);
          inlineByFile.set(sourceFile, list);
        } else {
          osmFeatures.push(edited);
        }
      }

      // --- Inline-edit features (polygons/poi/user_edits): update source DB directly ---
      for (const [file, edits] of inlineByFile) {
        const db = dbsRef.current.get(file);
        const srcEntry = layerData.get(file);
        if (!db || !srcEntry) continue;
        const meta = srcEntry.meta;

        const updateBatch: GeoJSON.Feature[] = [];
        for (const edited of edits) {
          const pk = edited.properties?.[meta.pkCol];
          if (pk == null) continue;
          const srcFeature = srcEntry.data.features.find(
            (f) => f.properties[meta.pkCol] === pk
          );
          const mergedProps: Record<string, unknown> = {
            ...(srcFeature?.properties ?? {}),
            ...(edited.properties ?? {}),
            [meta.pkCol]: pk,
          };
          delete mergedProps.__dirty;
          delete mergedProps.__layer;
          updateBatch.push({
            type: "Feature",
            geometry: edited.geometry,
            properties: mergedProps,
          });
        }
        if (updateBatch.length > 0) {
          updateGpkgFeatures(
            db,
            meta,
            updateBatch as unknown as GeoJSONFeatureCollection["features"]
          );
          dirtySourceFilesRef.current.add(file);
          const updatedPks = new Set(
            updateBatch.map((f) => f.properties![meta.pkCol])
          );
          setLayerData((prev) => {
            const entry = prev.get(file);
            if (!entry) return prev;
            const updated = entry.data.features.map((f) => {
              const fPk = f.properties[meta.pkCol];
              if (!updatedPks.has(fPk)) return f;
              const batch = updateBatch.find(
                (b) => b.properties![meta.pkCol] === fPk
              );
              if (!batch) return f;
              return {
                ...f,
                geometry: batch.geometry as typeof f.geometry,
                properties: { ...batch.properties! },
              };
            });
            const next = new Map(prev);
            next.set(file, {
              ...entry,
              data: { ...entry.data, features: updated },
            });
            return next;
          });
        }
      }

      // --- OSM Layers features: move to user_edits file ---
      if (osmFeatures.length > 0) {
        const file = activeFile;
        const meta = metaRef.current;
        if (!file || !meta) return;

        const srcEntry = layerData.get(file);
        if (!srcEntry) return;

        const movedPks: (number | string)[] = [];
        const insertsByKind = new Map<EditKind, GeoJSON.Feature[]>();

        for (const edited of osmFeatures) {
          const pk = edited.properties?.[meta.pkCol];
          if (pk == null) continue;
          const srcFeature = srcEntry.data.features.find(
            (f) => f.properties[meta.pkCol] === pk
          );
          const mergedProps: Record<string, unknown> = {
            ...(srcFeature?.properties ?? {}),
            ...(edited.properties ?? {}),
          };
          delete mergedProps[meta.pkCol];
          delete mergedProps.__dirty;
          delete mergedProps.__layer;

          const merged: GeoJSON.Feature = {
            type: "Feature",
            geometry: edited.geometry,
            properties: mergedProps,
          };
          const kind = editKindForGeometry(edited.geometry);
          if (!kind) continue;
          const list = insertsByKind.get(kind) ?? [];
          list.push(merged);
          insertsByKind.set(kind, list);
          movedPks.push(pk as number | string);
        }

        for (const [kind, list] of insertsByKind) {
          for (const f of list) insertIntoUserEditsFile(kind, f);
        }

        if (movedPks.length > 0) {
          const movedSet = new Set(movedPks);
          setLayerData((prev) => {
            const entry = prev.get(file);
            if (!entry) return prev;
            const filtered = entry.data.features.filter(
              (f) =>
                !movedSet.has(
                  f.properties[meta.pkCol] as number | string
                )
            );
            if (filtered.length === entry.data.features.length) return prev;
            const next = new Map(prev);
            next.set(file, {
              ...entry,
              data: { ...entry.data, features: filtered },
            });
            return next;
          });
          let set = deletedPksByFileRef.current.get(file);
          if (!set) {
            set = new Set();
            deletedPksByFileRef.current.set(file, set);
          }
          for (const pk of movedPks) set.add(pk);
        }
      }

      setDirty(true);
    },
    [activeFile, layerData, insertIntoUserEditsFile]
  );

  const handleAdded = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const cleanProps: Record<string, unknown> = {
        ...(feature.properties ?? {}),
      };
      delete cleanProps.__dirty;
      delete cleanProps.__layer;

      const file = activeFile;
      const inline = file && isInlineEditKey(file);

      if (inline) {
        // Polygons/POI/user_edits: insert directly into source DB
        const db = dbsRef.current.get(file);
        const entry = layerData.get(file);
        if (!db || !entry) {
          setAdding(false);
          setFreehand(false);
          return;
        }
        const pks = insertGpkgFeatures(db, entry.meta, [
          {
            type: "Feature",
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: cleanProps,
          },
        ]);
        const newPk = pks[0];
        if (newPk != null) {
          const stored = {
            type: "Feature" as const,
            geometry: feature.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: { ...cleanProps, [entry.meta.pkCol]: newPk },
          };
          setLayerData((prev) => {
            const cur = prev.get(file);
            if (!cur) return prev;
            const next = new Map(prev);
            next.set(file, {
              ...cur,
              data: { ...cur.data, features: [...cur.data.features, stored] },
            });
            return next;
          });
          dirtySourceFilesRef.current.add(file);
        }
      } else {
        // OSM Layers: insert into user_edits file
        const kind = editKindForGeometry(feature.geometry);
        if (!kind) {
          setAdding(false);
          setFreehand(false);
          return;
        }
        insertIntoUserEditsFile(kind, {
          type: "Feature",
          geometry: feature.geometry,
          properties: cleanProps,
        });
      }

      setDirty(true);
      setAdding(false);
      setFreehand(false);
    },
    [activeFile, layerData, insertIntoUserEditsFile]
  );

  const handleReclassify = React.useCallback(
    (feature: GeoJSON.Feature, newFclass: string) => {
      const sourceFile = (feature.properties?.__layer as string | undefined) ??
        null;
      if (!sourceFile) return;

      const buildProps = (
        src: Record<string, unknown>,
        stripPk: string | null
      ): Record<string, unknown> => {
        const out: Record<string, unknown> = { ...src };
        delete out.__dirty;
        delete out.__layer;
        if (stripPk) delete out[stripPk];
        out.fclass = newFclass || null;
        return out;
      };

      if (isInlineEditKey(sourceFile)) {
        // Polygons/POI/user_edits: update fclass in source DB directly
        const db = dbsRef.current.get(sourceFile);
        const srcEntry = layerData.get(sourceFile);
        if (!db || !srcEntry) return;
        const srcMeta = srcEntry.meta;
        const pk = feature.properties?.[srcMeta.pkCol] as
          | number | string | undefined;
        if (pk == null) return;

        const columnType = new Map<string, string>([["fclass", "TEXT"]]);
        ensureGpkgColumns(db, srcMeta.tableName, columnType);
        db.run(
          `UPDATE "${srcMeta.tableName}" SET "fclass" = ? WHERE "${srcMeta.pkCol}" = ?`,
          [newFclass || null, pk as number | string]
        );
        dirtySourceFilesRef.current.add(sourceFile);
        setLayerData((prev) => {
          const entry = prev.get(sourceFile);
          if (!entry) return prev;
          const updated = entry.data.features.map((f) => {
            if (f.properties[srcMeta.pkCol] !== pk) return f;
            return {
              ...f,
              properties: { ...f.properties, fclass: newFclass || null },
            };
          });
          const next = new Map(prev);
          next.set(sourceFile, {
            ...entry,
            data: { ...entry.data, features: updated },
          });
          return next;
        });
      } else {
        // OSM Layers: transfer to user_edits file
        const srcEntry = layerData.get(sourceFile);
        if (!srcEntry) return;
        const srcMeta = srcEntry.meta;
        const pk = feature.properties?.[srcMeta.pkCol] as
          | number | string | undefined;
        if (pk == null) return;
        const srcFeature = srcEntry.data.features.find(
          (f) => f.properties[srcMeta.pkCol] === pk
        );
        if (!srcFeature?.geometry) return;

        const kind = editKindForGeometry(srcFeature.geometry);
        if (!kind) return;

        const merged: GeoJSON.Feature = {
          type: "Feature",
          geometry: srcFeature.geometry as GeoJSON.Geometry,
          properties: buildProps(srcFeature.properties, srcMeta.pkCol),
        };
        insertIntoUserEditsFile(kind, merged);

        setLayerData((prev) => {
          const entry = prev.get(sourceFile);
          if (!entry) return prev;
          const filtered = entry.data.features.filter(
            (f) => f.properties[srcMeta.pkCol] !== pk
          );
          if (filtered.length === entry.data.features.length) return prev;
          const next = new Map(prev);
          next.set(sourceFile, {
            ...entry,
            data: { ...entry.data, features: filtered },
          });
          return next;
        });
        let set = deletedPksByFileRef.current.get(sourceFile);
        if (!set) {
          set = new Set();
          deletedPksByFileRef.current.set(sourceFile, set);
        }
        set.add(pk);
      }
      setDirty(true);
    },
    [layerData, insertIntoUserEditsFile]
  );

  const handleDeleted = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const sourceLayer = (feature.properties?.__layer as string) ?? null;

      if (sourceLayer && isInlineEditKey(sourceLayer)) {
        // Polygons/POI/user_edits: delete from source DB directly
        const db = dbsRef.current.get(sourceLayer);
        const entry = layerData.get(sourceLayer);
        if (!db || !entry) return;
        const pk = feature.properties?.[entry.meta.pkCol] as
          | number | string | undefined;
        if (pk != null) {
          deleteGpkgFeatures(db, entry.meta, [pk]);
          dirtySourceFilesRef.current.add(sourceLayer);
        }
        setLayerData((prev) => {
          const cur = prev.get(sourceLayer);
          if (!cur) return prev;
          const filtered = cur.data.features.filter((f) => {
            if (pk == null) return f !== feature;
            return f.properties[entry.meta.pkCol] !== pk;
          });
          if (filtered.length === cur.data.features.length) return prev;
          const next = new Map(prev);
          next.set(sourceLayer, {
            ...cur,
            data: { ...cur.data, features: filtered },
          });
          return next;
        });
        setDirty(true);
        return;
      }

      // OSM layers: defer deletion to save time
      const file = activeFile;
      const meta = metaRef.current;
      if (!file || !meta) return;
      const pk = feature.properties?.[meta.pkCol] as
        | number | string | undefined;
      setLayerData((prev) => {
        const entry = prev.get(file);
        if (!entry) return prev;
        const filtered = entry.data.features.filter((f) => {
          if (pk == null) return f !== feature;
          return f.properties[meta.pkCol] !== pk;
        });
        if (filtered.length === entry.data.features.length) return prev;
        const next = new Map(prev);
        next.set(file, {
          ...entry,
          data: { ...entry.data, features: filtered },
        });
        return next;
      });
      if (pk != null) {
        let set = deletedPksByFileRef.current.get(file);
        if (!set) {
          set = new Set();
          deletedPksByFileRef.current.set(file, set);
        }
        set.add(pk);
      }
      setDirty(true);
    },
    [activeFile, layerData]
  );

  // ------------------------------------------------------------------
  // Toggle callbacks
  // ------------------------------------------------------------------

  const handleToggleEdit = React.useCallback(() => {
    if (!canEdit) return;
    setEditing((e) => !e);
  }, [canEdit]);

  const handleToggleAdd = React.useCallback(() => {
    if (!canEdit) return;
    setAdding((a) => !a);
  }, [canEdit]);

  const handleToggleFreehand = React.useCallback(() => {
    if (!canEdit) return;
    setFreehand((f) => !f);
  }, [canEdit]);

  const handleToggleAutoPoly = React.useCallback(() => {
    if (!canEdit) return;
    setAutoPoly((v) => !v);
  }, [canEdit]);

  const handleToggleAutoVessel = React.useCallback(() => {
    if (!canEdit) return;
    setAutoVessel((v) => !v);
  }, [canEdit]);

  const handleToggleAutoSegment = React.useCallback(() => {
    if (!canEdit) return;
    setAutoSegment((v) => !v);
  }, [canEdit]);

  const handleToggleSimplify = React.useCallback(() => {
    if (!canEdit) return;
    setSimplifying((s) => !s);
  }, [canEdit]);

  const handleToggleSmooth = React.useCallback(() => {
    if (!canEdit) return;
    setSmoothing((s) => !s);
  }, [canEdit]);

  const handleToggleDelete = React.useCallback(() => {
    if (!canEdit) return;
    setDeleting((d) => !d);
  }, [canEdit]);

  const handleToggleReclassify = React.useCallback(() => {
    setReclassifying((r) => !r);
  }, []);

  const handleToggleImportDem = React.useCallback(() => {
    setImportingDem((v) => {
      if (v) setDemStatus({ kind: "idle" });
      return !v;
    });
  }, []);

  const handleToggleTerrain = React.useCallback(() => {
    setTerrainOn((v) => !v);
  }, []);

  // ------------------------------------------------------------------
  // DEM confirm download (uses demo's Next.js endpoint for now)
  // ------------------------------------------------------------------

  const demNameSuggestion = React.useMemo(() => {
    const parsed = activeFile ? parseFileKey(activeFile) : null;
    const base = (parsed?.filename ?? "dem").replace(/\.gpkg$/i, "");
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    return `${base}_dem_${stamp}.tif`;
  }, [activeFile, parseFileKey]);

  const handleConfirmDemDownload = React.useCallback(
    async (params: {
      bbox: [number, number, number, number];
      name: string;
      maxZoom: number;
    }) => {
      setDemStatus({ kind: "fetching" });
      try {
        const res = await fetch("/api/gis/dem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          file: string;
          tiles: number;
          zoom: number;
        };
        setDemStatus({
          kind: "ok",
          file: json.file,
          tiles: json.tiles,
          zoom: json.zoom,
        });
        setImportingDem(false);
        setSelectedDem(json.file);
      } catch (e) {
        setDemStatus({ kind: "error", message: String(e) });
      }
    },
    []
  );

  // ------------------------------------------------------------------
  // Discard
  // ------------------------------------------------------------------

  const handleDiscard = React.useCallback(async () => {
    if (!projectId) return;

    // 1. OSM layers with deferred deletions — re-read from untouched DB
    const osmAffected = new Set<string>(
      deletedPksByFileRef.current.keys()
    );
    if (osmAffected.size > 0) {
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const file of osmAffected) {
          const db = dbsRef.current.get(file);
          if (!db) continue;
          const { geojson, meta } = gpkgToGeoJSON(db);
          next.set(file, { data: geojson, meta });
        }
        return next;
      });
      deletedPksByFileRef.current.clear();
    }

    // 2. Inline-edited source files (polygons/poi/user_edits) — reload from disk
    const inlineDirty = [...dirtySourceFilesRef.current];
    if (inlineDirty.length > 0) {
      try {
        const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
        for (const key of inlineDirty) {
          const parsed = parseFileKey(key);
          if (!parsed) continue;
          // Close old DB
          dbsRef.current.get(key)?.close();
          // Re-fetch from disk (or bootstrap empty for user_edits)
          const kind = EDIT_KINDS.find((k) => EDIT_FILE_KEYS[k] === key);
          let db: Database;
          try {
            const buf = await fetchProjectFileRaw(
              projectId,
              parsed.category,
              parsed.filename
            );
            db = new SQL.Database(new Uint8Array(buf));
          } catch {
            if (kind) {
              db = new SQL.Database();
              initializeGpkgSchema(db, {
                tableName: parsed.filename.replace(/\.gpkg$/i, ""),
                geometryType: EDIT_GEOMETRY_TYPE[kind],
              });
            } else {
              continue;
            }
          }
          dbsRef.current.set(key, db);
          const { geojson, meta } = gpkgToGeoJSON(db);
          setLayerData((prev) => {
            const next = new Map(prev);
            next.set(key, { data: geojson, meta });
            return next;
          });
        }
      } catch (e) {
        setError(`Failed to reload source files: ${String(e)}`);
      }
      dirtySourceFilesRef.current.clear();
    }

    setDirty(false);
    setDiscardId((n) => n + 1);
  }, [projectId, parseFileKey]);

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------

  const handleSave = React.useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Inline-edited source files (polygons/poi/user_edits) — already
      //    mutated, just export and PUT
      console.log(`[GIS] handleSave: ${dirtySourceFilesRef.current.size} dirty source files:`, [...dirtySourceFilesRef.current]);
      for (const key of dirtySourceFilesRef.current) {
        const db = dbsRef.current.get(key);
        if (!db) continue;
        const bytes = exportDatabase(db);
        const parsed = parseFileKey(key);
        if (!parsed) continue;
        await saveProjectFileRaw(
          projectId,
          parsed.category,
          parsed.filename,
          bytes.buffer as ArrayBuffer
        );
      }

      // 2. OSM layers with pending deletions — apply then PUT
      const osmFiles = [...deletedPksByFileRef.current.keys()];
      for (const key of osmFiles) {
        const pks = deletedPksByFileRef.current.get(key);
        if (!pks || pks.size === 0) continue;
        const db = dbsRef.current.get(key);
        const entry = layerData.get(key);
        if (!db || !entry) continue;
        deleteGpkgFeatures(db, entry.meta, [...pks]);
        const bytes = exportDatabase(db);
        const parsed = parseFileKey(key);
        if (!parsed) continue;
        await saveProjectFileRaw(
          projectId,
          parsed.category,
          parsed.filename,
          bytes.buffer as ArrayBuffer
        );
      }

      dirtySourceFilesRef.current.clear();
      deletedPksByFileRef.current.clear();
      setDirty(false);
      // Refresh sidebar file list so newly created files (e.g. user_edits) appear
      queryClient.invalidateQueries({ queryKey: projectFileKeys.project(projectId) });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [projectId, layerData, parseFileKey, queryClient]);

  // ------------------------------------------------------------------
  // DEM URL overrides for viewport
  // ------------------------------------------------------------------

  const demFileUrl = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    const { apiBaseUrl } = getRuntimeConfig();
    return `${apiBaseUrl}/project/${projectId}/files/dem/${encodeURIComponent(selectedDem)}/raw`;
  }, [projectId, selectedDem]);

  const demTileUrlTemplate = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    return projectDemTileUrl(projectId, selectedDem);
  }, [projectId, selectedDem]);

  const demManifestUrlValue = React.useMemo(() => {
    if (!projectId || !selectedDem) return undefined;
    return projectDemManifestUrl(projectId, selectedDem);
  }, [projectId, selectedDem]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const featureCount = combinedData?.features.length ?? 0;
  const demFiles = fileList?.dem ?? [];
  const userEditFiles = fileList?.user_edits ?? [];

  return (
    <ProjectSettingsPage
      title="Files"
      panelTitle="GIS Files"
      viewport={
        <GisGlobeViewport
          data={combinedData}
          layers={layers}
          onToggleLayerVisibility={toggleLayerVisibility}
          onToggleFclassVisibility={toggleFclassVisibility}
          dataKey={`project:${loadId}`}
          discardKey={discardId}
          editing={editing}
          adding={adding}
          freehand={freehand}
          autoPoly={autoPoly}
          autoVessel={autoVessel}
          autoSegment={autoSegment}
          simplifying={simplifying}
          smoothing={smoothing}
          importingDem={importingDem}
          deleting={deleting}
          reclassifying={reclassifying}
          demFile={selectedDem}
          demOpacity={demOpacity}
          demColorRamp={demColorRamp}
          terrainOn={terrainOn}
          terrainExaggeration={terrainExaggeration}
          dirty={dirty}
          saving={saving}
          canEdit={canEdit}
          geometryType={metaRef.current?.geometryType ?? "GEOMETRY"}
          onToggleEdit={handleToggleEdit}
          onToggleAdd={handleToggleAdd}
          onToggleFreehand={handleToggleFreehand}
          onToggleAutoPoly={handleToggleAutoPoly}
          onToggleAutoVessel={handleToggleAutoVessel}
          onToggleAutoSegment={handleToggleAutoSegment}
          onToggleSimplify={handleToggleSimplify}
          onToggleSmooth={handleToggleSmooth}
          onToggleDelete={handleToggleDelete}
          onToggleReclassify={handleToggleReclassify}
          onToggleImportDem={handleToggleImportDem}
          onToggleTerrain={handleToggleTerrain}
          onSetTerrainExaggeration={setTerrainExaggeration}
          onSetDemOpacity={setDemOpacity}
          onSetDemColorRamp={setDemColorRamp}
          demNameSuggestion={demNameSuggestion}
          onConfirmDemDownload={handleConfirmDemDownload}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onEdited={handleEdited}
          onAdded={handleAdded}
          onDeleted={handleDeleted}
          onReclassify={handleReclassify}
          demFileUrl={demFileUrl}
          demTileUrlTemplate={demTileUrlTemplate}
          demManifestUrl={demManifestUrlValue}
        />
      }
    >
      <div className="space-y-[var(--space-4)]">
        {/* Polygons, POI sections */}
        {SIDEBAR_SECTIONS.filter(({ key }) => key !== "layers").map(({ key, label, category }) => {
          const files = fileList?.[key] ?? [];
          return (
            <div key={key} className="flex flex-col gap-[var(--space-2)]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {label}
              </span>
              <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
                {files.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    No files
                  </p>
                ) : (
                  files.map((f) => {
                    const fileKey = `${category}/${f}`;
                    const checked = selectedFiles.includes(fileKey);
                    const isEditTarget = editingFileKey === fileKey;
                    return (
                      <div
                        key={f}
                        className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFileSelected(fileKey)}
                          className="shrink-0 cursor-pointer"
                        />
                        <span
                          className={`block size-3 shrink-0 rounded-[3px] border border-slate-900/25 ${checked ? "opacity-100" : "opacity-35"}`}
                          // eslint-disable-next-line template/no-jsx-style-prop
                          style={{ backgroundColor: colorFor(fileKey) }}
                        />
                        <span className="min-w-0 flex-1 truncate">{f}</span>
                        {checked && (
                          <button
                            type="button"
                            title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                            disabled={!isEditTarget && editModesActive}
                            onClick={() => toggleEditTarget(fileKey)}
                            className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* OSM Layers section + user edit files after separator */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            OSM Layers
          </span>
          <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
            {(fileList?.layers ?? []).length === 0 && userEditFiles.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              <>
                {(fileList?.layers ?? []).map((f) => {
                  const fileKey = `layers/${f}`;
                  const checked = selectedFiles.includes(fileKey);
                  const isEditTarget = editingFileKey === fileKey;
                  return (
                    <div
                      key={f}
                      className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFileSelected(fileKey)}
                        className="shrink-0 cursor-pointer"
                      />
                      <span
                        className={`block size-3 shrink-0 rounded-[3px] border border-slate-900/25 ${checked ? "opacity-100" : "opacity-35"}`}
                        // eslint-disable-next-line template/no-jsx-style-prop
                        style={{ backgroundColor: colorFor(fileKey) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{f}</span>
                      {checked && (
                        <button
                          type="button"
                          title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                          disabled={!isEditTarget && editModesActive}
                          onClick={() => toggleEditTarget(fileKey)}
                          className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Separator + user edit files */}
                {userEditFiles.length > 0 && (fileList?.layers ?? []).length > 0 && (
                  <hr className="my-1 border-[var(--color-border-subtle)]" />
                )}
                {userEditFiles.map((f) => {
                  const fileKey = `user_edits/${f}`;
                  const checked = selectedFiles.includes(fileKey);
                  const isEditTarget = editingFileKey === fileKey;
                  return (
                    <div
                      key={f}
                      className="flex min-w-0 items-center gap-2 text-xs leading-tight"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFileSelected(fileKey)}
                        className="shrink-0 cursor-pointer"
                      />
                      <span
                        className={`block size-3 shrink-0 rounded-[3px] border border-slate-900/25 ${checked ? "opacity-100" : "opacity-35"}`}
                        // eslint-disable-next-line template/no-jsx-style-prop
                        style={{ backgroundColor: colorFor(fileKey) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{f}</span>
                      {checked && (
                        <button
                          type="button"
                          title={isEditTarget ? "Stop editing this layer" : "Edit this layer"}
                          disabled={!isEditTarget && editModesActive}
                          onClick={() => toggleEditTarget(fileKey)}
                          className={`shrink-0 rounded p-0.5 ${isEditTarget ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* DEM section */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            DEM
          </span>
          <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
            {demFiles.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              demFiles.map((f) => {
                const checked = selectedDem === f;
                return (
                  <label
                    key={f}
                    className="flex min-w-0 cursor-pointer items-center gap-2 text-xs leading-tight"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedDem((prev) => (prev === f ? "" : f))
                      }
                      className="shrink-0 cursor-pointer"
                    />
                    <span className="min-w-0 truncate">{f}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {loading && (
          <p className="text-xs text-[var(--color-text-muted)]">Loading...</p>
        )}
        {error && (
          <p className="text-xs text-[var(--color-text-danger)]">{error}</p>
        )}
        {combinedData && !loading && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {featureCount} feature{featureCount !== 1 ? "s" : ""} loaded across{" "}
            {selectedFiles.length} layer{selectedFiles.length !== 1 ? "s" : ""}
          </p>
        )}
        {importingDem && demStatus.kind === "idle" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            DEM import: click a feature to fetch its terrain.
          </p>
        )}
        {demStatus.kind === "fetching" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Fetching DEM tiles...
          </p>
        )}
        {demStatus.kind === "ok" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            DEM saved: {demStatus.file} (z{demStatus.zoom},{" "}
            {demStatus.tiles} tile{demStatus.tiles !== 1 ? "s" : ""})
          </p>
        )}
        {demStatus.kind === "error" && (
          <p className="text-xs text-[var(--color-text-danger)]">
            DEM error: {demStatus.message}
          </p>
        )}
      </div>
    </ProjectSettingsPage>
  );
}
