"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import {
  gpkgToGeoJSON,
  insertGpkgFeatures,
  deleteGpkgFeatures,
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

// 12-color categorical palette. Each loaded GPKG gets a deterministic slot
// based on its file name so colors are stable across reloads.
const LAYER_PALETTE: ReadonlyArray<string> = [
  "#facc15",
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#f97316",
  "#a78bfa",
  "#22d3ee",
  "#fb7185",
  "#84cc16",
  "#eab308",
  "#38bdf8",
  "#c084fc",
];

// Wider palette for per-fclass colors. Hashed by value so the same fclass
// always gets the same color across reloads and across layers.
const FCLASS_PALETTE: ReadonlyArray<string> = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#78716c",
  "#a3a3a3",
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

type LoadedEntry = { data: GeoJSONFeatureCollection; meta: GpkgMeta };

// Features added via the add/freehand tools are written to these files
// rather than the source GPKG. Features edited in-place are also moved
// here (and deleted from the source). Each kind is a separate GPKG so
// downstream tooling can consume lines/polygons/points independently.
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

function isEditFile(file: string): boolean {
  return (Object.values(EDIT_FILES) as string[]).includes(file);
}

export default function GisGlobePage() {
  const [files, setFiles] = React.useState<string[]>([]);
  const [dems, setDems] = React.useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = React.useState<string[]>([]);
  const [hiddenFiles, setHiddenFiles] = React.useState<Set<string>>(
    () => new Set()
  );
  // Keys are "<file>::<fclass>". A pair in the set is hidden on the map.
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
  const [simplifying, setSimplifying] = React.useState(false);
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
  const [editLayerData, setEditLayerData] = React.useState<
    Map<EditKind, LoadedEntry>
  >(() => new Map());
  const [editDirty, setEditDirty] = React.useState<Set<EditKind>>(
    () => new Set()
  );

  const dbsRef = React.useRef<Map<string, Database>>(new Map());
  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);
  // Primary keys of features the user removed in delete mode, keyed by
  // file. Applied to each GPKG at save time.
  const deletedPksByFileRef = React.useRef<
    Map<string, Set<number | string>>
  >(new Map());
  // The three "user_edits_*" DBs live in a ref (they are mutated in place
  // as features are added/moved) and only their GeoJSON projection is kept
  // in React state via `editLayerData`.
  const editDbsRef = React.useRef<Map<EditKind, Database>>(new Map());

  const activeFile =
    selectedFiles.length === 1 ? selectedFiles[0] : null;
  const canEdit = activeFile != null;

  const refreshFileList = React.useCallback(() => {
    fetch("/api/gis")
      .then((r) => r.json())
      .then((json: { files: string[]; dems: string[] }) => {
        setFiles(json.files);
        setDems(json.dems ?? []);
      })
      .catch(() => setError("Failed to list GIS files"));
  }, []);

  React.useEffect(() => {
    refreshFileList();
  }, [refreshFileList]);

  // Load or bootstrap the three "user_edits_*" GPKGs. Runs once on mount,
  // and again from handleDiscard to roll back in-session edits.
  const loadOrCreateEditDbs = React.useCallback(async () => {
    const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
    const fresh = new Map<EditKind, Database>();
    const freshEntries = new Map<EditKind, LoadedEntry>();

    await Promise.all(
      EDIT_KINDS.map(async (kind) => {
        const fileName = EDIT_FILES[kind];
        let db: Database;
        try {
          const res = await fetch(`/api/gis/${encodeURIComponent(fileName)}`);
          if (res.ok) {
            const buf = await res.arrayBuffer();
            db = new SQL.Database(new Uint8Array(buf));
          } else {
            db = new SQL.Database();
            initializeGpkgSchema(db, {
              tableName: fileName.replace(/\.gpkg$/i, ""),
              geometryType: EDIT_GEOMETRY_TYPE[kind],
            });
          }
        } catch {
          db = new SQL.Database();
          initializeGpkgSchema(db, {
            tableName: fileName.replace(/\.gpkg$/i, ""),
            geometryType: EDIT_GEOMETRY_TYPE[kind],
          });
        }
        fresh.set(kind, db);
        const { geojson, meta } = gpkgToGeoJSON(db);
        freshEntries.set(kind, { data: geojson, meta });
      })
    );

    // Close any previously-held DBs before swapping the ref.
    for (const db of editDbsRef.current.values()) db.close();
    editDbsRef.current = fresh;
    setEditLayerData(freshEntries);
    setEditDirty(new Set());
  }, []);

  React.useEffect(() => {
    loadOrCreateEditDbs().catch((e) =>
      setError(`Failed to initialize edit files: ${String(e)}`)
    );
  }, [loadOrCreateEditDbs]);

  // Load/unload GPKG files as the selection changes. New files are fetched
  // in parallel; removed files have their in-memory DB closed and dropped
  // from the loaded map.
  React.useEffect(() => {
    let cancelled = false;

    const currentKeys = new Set(layerData.keys());
    const toRemove = [...currentKeys].filter(
      (f) => !selectedFiles.includes(f)
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

    if (toAdd.length === 0) {
      if (toRemove.length > 0) setLoadId((n) => n + 1);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      if (cancelled) return;

      const results = await Promise.all(
        toAdd.map(async (file) => {
          const res = await fetch(`/api/gis/${encodeURIComponent(file)}`);
          if (!res.ok) throw new Error(`Failed to load ${file}`);
          const buf = await res.arrayBuffer();
          const db = new SQL.Database(new Uint8Array(buf));
          const { geojson, meta } = gpkgToGeoJSON(db);
          return { file, db, data: geojson, meta };
        })
      );

      if (cancelled) {
        for (const { db } of results) db.close();
        return;
      }

      for (const { file, db } of results) {
        dbsRef.current.set(file, db);
      }
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const { file, data, meta } of results) {
          next.set(file, { data, meta });
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
    // Intentionally only depend on selectedFiles — layerData is computed
    // here and re-running on its own change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles]);

  // Keep the active-file refs in sync so editing/save paths always read
  // the correct DB/meta for the single-selected layer.
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
      setSimplifying(false);
      setDeleting(false);
    }
  }, [activeFile, layerData]);

  // Clean up all DBs on unmount
  React.useEffect(() => {
    const dbs = dbsRef.current;
    const editDbs = editDbsRef.current;
    return () => {
      for (const db of dbs.values()) db.close();
      dbs.clear();
      for (const db of editDbs.values()) db.close();
      editDbs.clear();
    };
  }, []);

  const toggleFileSelected = React.useCallback(
    (file: string) => {
      if (
        editing ||
        adding ||
        freehand ||
        simplifying ||
        deleting ||
        reclassifying
      )
        return;
      setSelectedFiles((prev) =>
        prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
      );
      setDirty(false);
    },
    [editing, adding, freehand, simplifying, deleting, reclassifying]
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

  // Helper: derive the sorted unique fclass list from a feature collection.
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

  // Combined GeoJSON passed to the viewport. Each feature is tagged with
  // `__layer` so the viewport can color it by its source file. The three
  // user_edits_*.gpkg files are always included so previously-saved edits
  // stay visible without the user having to tick them in the source list.
  const combinedData =
    React.useMemo<GeoJSONFeatureCollection | null>(() => {
      const features: GeoJSONFeatureCollection["features"] = [];
      for (const file of selectedFiles) {
        const entry = layerData.get(file);
        if (!entry) continue;
        for (const f of entry.data.features) {
          features.push({
            ...f,
            properties: { ...f.properties, __layer: file },
          });
        }
      }
      for (const kind of EDIT_KINDS) {
        const entry = editLayerData.get(kind);
        if (!entry) continue;
        const file = EDIT_FILES[kind];
        for (const f of entry.data.features) {
          features.push({
            ...f,
            properties: { ...f.properties, __layer: file },
          });
        }
      }
      if (features.length === 0) return null;
      return { type: "FeatureCollection", features };
    }, [selectedFiles, layerData, editLayerData]);

  const layers = React.useMemo<LayerStyle[]>(() => {
    const buildFclasses = (file: string, values: string[]) =>
      values.map((value) => ({
        value,
        color: fclassColorFor(value),
        visible: !hiddenFclasses.has(`${file}::${value}`),
      }));

    const result: LayerStyle[] = selectedFiles.map((file) => {
      const entry = layerData.get(file);
      const values = uniqueFclasses(entry?.data);
      return {
        id: file,
        color: colorFor(file),
        visible: !hiddenFiles.has(file),
        fclasses: buildFclasses(file, values),
      };
    });

    for (const kind of EDIT_KINDS) {
      const entry = editLayerData.get(kind);
      if (!entry || entry.data.features.length === 0) continue;
      const file = EDIT_FILES[kind];
      const values = uniqueFclasses(entry.data);
      result.push({
        id: file,
        color: colorFor(file),
        visible: !hiddenFiles.has(file),
        fclasses: buildFclasses(file, values),
      });
    }
    return result;
  }, [
    selectedFiles,
    layerData,
    editLayerData,
    hiddenFiles,
    hiddenFclasses,
    uniqueFclasses,
  ]);

  // Insert a feature into the appropriate user_edits_*.gpkg (in memory)
  // and mirror it into editLayerData so the map redraws immediately. The
  // caller is expected to strip any source-specific pk from the feature
  // properties so the edit DB auto-assigns a fresh fid.
  const insertIntoEditDb = React.useCallback(
    (kind: EditKind, feature: GeoJSON.Feature): number | null => {
      const db = editDbsRef.current.get(kind);
      const entry = editLayerData.get(kind);
      if (!db || !entry) return null;
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
      setEditLayerData((prev) => {
        const next = new Map(prev);
        const cur = next.get(kind);
        if (!cur) return prev;
        next.set(kind, {
          ...cur,
          data: {
            ...cur.data,
            features: [...cur.data.features, stored],
          },
        });
        return next;
      });
      setEditDirty((prev) => {
        if (prev.has(kind)) return prev;
        const next = new Set(prev);
        next.add(kind);
        return next;
      });
      return newPk;
    },
    [editLayerData]
  );

  const handleEdited = React.useCallback(
    (features: GeoJSON.Feature[]) => {
      const file = activeFile;
      const meta = metaRef.current;
      if (!file || !meta) return;

      const movedPks: (number | string)[] = [];
      const insertsByKind = new Map<EditKind, GeoJSON.Feature[]>();

      // 1. For each edited feature, build the "full" feature using the
      //    source's current properties (all columns) merged with the
      //    edited geometry, then strip the source pk so the edit DB can
      //    assign its own.
      const srcEntry = layerData.get(file);
      if (!srcEntry) return;

      for (const edited of features) {
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

      // 2. Insert into each edit DB.
      for (const [kind, list] of insertsByKind) {
        for (const f of list) insertIntoEditDb(kind, f);
      }

      // 3. Remove the moved features from the source's in-memory
      //    layerData and queue deletions for save-time.
      if (movedPks.length > 0) {
        const movedSet = new Set(movedPks);
        setLayerData((prev) => {
          const entry = prev.get(file);
          if (!entry) return prev;
          const filtered = entry.data.features.filter(
            (f) => !movedSet.has(f.properties[meta.pkCol] as number | string)
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

      setDirty(true);
    },
    [activeFile, layerData, insertIntoEditDb]
  );

  const handleAdded = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const kind = editKindForGeometry(feature.geometry);
      if (!kind) {
        setAdding(false);
        setFreehand(false);
        return;
      }
      // Drop any runtime markers before persisting.
      const cleanProps: Record<string, unknown> = {
        ...(feature.properties ?? {}),
      };
      delete cleanProps.__dirty;
      delete cleanProps.__layer;
      insertIntoEditDb(kind, {
        type: "Feature",
        geometry: feature.geometry,
        properties: cleanProps,
      });
      setDirty(true);
      setAdding(false);
      setFreehand(false);
      // Keep autoPoly on — the user probably wants to trace several regions
      // in a row without reactivating the tool between each one.
    },
    [insertIntoEditDb]
  );

  const handleReclassify = React.useCallback(
    (feature: GeoJSON.Feature, newFclass: string) => {
      const sourceFile = (feature.properties?.__layer as string | undefined) ??
        null;
      if (!sourceFile) return;

      // Normalize the output properties: merge source attrs with the new
      // fclass, drop runtime markers (__dirty/__layer) so they don't end
      // up in any DB, and strip the source's pk so the edit DB can
      // auto-assign its own.
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

      // Case 1: feature lives in a user_edits_*.gpkg already — update its
      // row in place so we don't duplicate it. sql.js UPDATE by fid.
      const editKindForFile = EDIT_KINDS.find(
        (k) => EDIT_FILES[k] === sourceFile
      );
      if (editKindForFile) {
        const db = editDbsRef.current.get(editKindForFile);
        const entry = editLayerData.get(editKindForFile);
        if (!db || !entry) return;
        const pk = feature.properties?.[entry.meta.pkCol] as
          | number
          | string
          | undefined;
        if (pk == null) return;

        // Ensure the fclass column exists, then UPDATE.
        const columnType = new Map<string, string>([["fclass", "TEXT"]]);
        ensureGpkgColumns(db, entry.meta.tableName, columnType);
        db.run(
          `UPDATE "${entry.meta.tableName}" SET "fclass" = ? WHERE "${entry.meta.pkCol}" = ?`,
          [newFclass || null, pk as number | string]
        );

        setEditLayerData((prev) => {
          const cur = prev.get(editKindForFile);
          if (!cur) return prev;
          const updated = cur.data.features.map((f) => {
            const fPk = f.properties[entry.meta.pkCol];
            if (fPk !== pk) return f;
            return {
              ...f,
              properties: { ...f.properties, fclass: newFclass || null },
            };
          });
          const next = new Map(prev);
          next.set(editKindForFile, {
            ...cur,
            data: { ...cur.data, features: updated },
          });
          return next;
        });
        setEditDirty((prev) => {
          if (prev.has(editKindForFile)) return prev;
          const n = new Set(prev);
          n.add(editKindForFile);
          return n;
        });
        setDirty(true);
        return;
      }

      // Case 2: feature lives in a source GPKG — transfer it to the
      // matching edit DB, queue the source pk for deletion at save time.
      const srcEntry = layerData.get(sourceFile);
      if (!srcEntry) return;
      const srcMeta = srcEntry.meta;
      const pk = feature.properties?.[srcMeta.pkCol] as
        | number
        | string
        | undefined;
      if (pk == null) return;
      const srcFeature = srcEntry.data.features.find(
        (f) => f.properties[srcMeta.pkCol] === pk
      );
      if (!srcFeature) return;

      const kind = editKindForGeometry(srcFeature.geometry);
      if (!kind) return;

      if (!srcFeature.geometry) return;
      const merged: GeoJSON.Feature = {
        type: "Feature",
        geometry: srcFeature.geometry as GeoJSON.Geometry,
        properties: buildProps(srcFeature.properties, srcMeta.pkCol),
      };
      insertIntoEditDb(kind, merged);

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
      setDirty(true);
    },
    [layerData, editLayerData, insertIntoEditDb]
  );

  const handleDeleted = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const file = activeFile;
      const meta = metaRef.current;
      if (!file || !meta) return;
      const pk = feature.properties?.[meta.pkCol] as
        | number
        | string
        | undefined;
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
    [activeFile]
  );

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

  const handleToggleSimplify = React.useCallback(() => {
    if (!canEdit) return;
    setSimplifying((s) => !s);
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
        refreshFileList();
        setSelectedDem(json.file);
      } catch (e) {
        setDemStatus({ kind: "error", message: String(e) });
      }
    },
    [refreshFileList]
  );

  const demNameSuggestion = React.useMemo(() => {
    const base = (activeFile ?? "dem").replace(/\.gpkg$/i, "");
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    return `${base}_dem_${stamp}.tif`;
  }, [activeFile]);

  const handleToggleTerrain = React.useCallback(() => {
    setTerrainOn((v) => !v);
  }, []);

  const handleDiscard = React.useCallback(async () => {
    // 1. Restore every source file that had pending deletions from its
    //    untouched in-memory sql.js DB (we only mutate source DBs on
    //    save, so re-reading gives the pristine state).
    const affectedSources = new Set<string>(
      deletedPksByFileRef.current.keys()
    );
    if (affectedSources.size > 0) {
      setLayerData((prev) => {
        const next = new Map(prev);
        for (const file of affectedSources) {
          const db = dbsRef.current.get(file);
          if (!db) continue;
          const { geojson, meta } = gpkgToGeoJSON(db);
          next.set(file, { data: geojson, meta });
        }
        return next;
      });
      deletedPksByFileRef.current.clear();
    }

    // 2. Re-fetch the edit DBs from disk (or recreate empty ones). This
    //    drops any in-session inserts into the edit files.
    try {
      await loadOrCreateEditDbs();
    } catch (e) {
      setError(`Failed to reset edit files: ${String(e)}`);
    }

    setDirty(false);
    setLoadId((n) => n + 1);
  }, [loadOrCreateEditDbs]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      // 1. For every source file that has pending deletions, apply them
      //    and PUT the file back. Sources no longer receive inserts or
      //    updates — those live in the user_edits_* files.
      const sourceFiles = [...deletedPksByFileRef.current.keys()];
      for (const file of sourceFiles) {
        const pks = deletedPksByFileRef.current.get(file);
        if (!pks || pks.size === 0) continue;
        const db = dbsRef.current.get(file);
        const entry = layerData.get(file);
        if (!db || !entry) continue;
        deleteGpkgFeatures(db, entry.meta, [...pks]);
        const bytes = exportDatabase(db);
        const res = await fetch(`/api/gis/${encodeURIComponent(file)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes.buffer as ArrayBuffer,
        });
        if (!res.ok) throw new Error(`Save failed for ${file}`);
      }

      // 2. PUT each dirty edit DB. They may not exist on disk yet — the
      //    PUT endpoint creates them.
      for (const kind of editDirty) {
        const db = editDbsRef.current.get(kind);
        if (!db) continue;
        const fileName = EDIT_FILES[kind];
        const bytes = exportDatabase(db);
        const res = await fetch(`/api/gis/${encodeURIComponent(fileName)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes.buffer as ArrayBuffer,
        });
        if (!res.ok) throw new Error(`Save failed for ${fileName}`);
      }

      deletedPksByFileRef.current.clear();
      setEditDirty(new Set());
      setDirty(false);
      refreshFileList();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [layerData, editDirty, refreshFileList]);

  const featureCount = combinedData?.features.length ?? 0;
  const selectionLocked =
    editing ||
    adding ||
    freehand ||
    autoPoly ||
    autoVessel ||
    simplifying ||
    deleting ||
    reclassifying;

  return (
    <ProjectSettingsPage
      title="GIS Globe"
      panelTitle="Parameters"
      viewport={
        <GisGlobeViewport
          data={combinedData}
          layers={layers}
          onToggleLayerVisibility={toggleLayerVisibility}
          onToggleFclassVisibility={toggleFclassVisibility}
          dataKey={`globe:${loadId}`}
          editing={editing}
          adding={adding}
          freehand={freehand}
          autoPoly={autoPoly}
          autoVessel={autoVessel}
          simplifying={simplifying}
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
          onToggleSimplify={handleToggleSimplify}
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
        />
      }
    >
      <div className="space-y-[var(--space-4)]">
        <Field label="GPKG Files">
          <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
            {files.filter((f) => !isEditFile(f)).length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              files.filter((f) => !isEditFile(f)).map((f) => {
                const checked = selectedFiles.includes(f);
                return (
                  <label
                    key={f}
                    className="flex min-w-0 cursor-pointer items-center gap-2 text-xs leading-tight"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectionLocked}
                      onChange={() => toggleFileSelected(f)}
                      className="shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span
                      className={`block size-3 shrink-0 rounded-[3px] border border-slate-900/25 ${checked ? "opacity-100" : "opacity-35"}`}
                      // eslint-disable-next-line template/no-jsx-style-prop -- swatch color is per-file derived
                      style={{ backgroundColor: colorFor(f) }}
                    />
                    <span className="min-w-0 truncate">{f}</span>
                  </label>
                );
              })
            )}
          </div>
        </Field>

        {selectedFiles.length >= 2 && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Editing is disabled while multiple layers are selected.
          </p>
        )}

        <Field label="DEM Overlay" htmlFor="dem-file">
          <Select
            id="dem-file"
            value={selectedDem}
            onChange={(e) => setSelectedDem(e.target.value)}
          >
            <option value="">None</option>
            {dems.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>


        <p className="text-xs text-[var(--color-text-muted)]">
          Real WebGL globe projection powered by MapLibre GL. Raster satellite
          and basemap tiles are draped directly on the globe, with custom
          click-to-edit vertex handles projected through MapLibre&apos;s
          globe-correct project / unproject pipeline.
        </p>

        {loading && (
          <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
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
            Fetching DEM tiles…
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
