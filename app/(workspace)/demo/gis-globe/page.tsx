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
  updateGpkgFeatures,
  insertGpkgFeatures,
  deleteGpkgFeatures,
  exportDatabase,
} from "@/lib/gpkg";
import type { GeoJSONFeatureCollection, GpkgMeta } from "@/lib/gpkg";
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
  const [simplifying, setSimplifying] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [importingDem, setImportingDem] = React.useState(false);
  const [demStatus, setDemStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "fetching" }
    | { kind: "ok"; file: string; tiles: number; zoom: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dirty, setDirty] = React.useState(false);
  const [loadId, setLoadId] = React.useState(0);

  const dbsRef = React.useRef<Map<string, Database>>(new Map());
  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);
  // Primary keys of features the user removed in delete mode, keyed by
  // file. Applied to each GPKG at save time.
  const deletedPksByFileRef = React.useRef<
    Map<string, Set<number | string>>
  >(new Map());

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
      setSimplifying(false);
      setDeleting(false);
    }
  }, [activeFile, layerData]);

  // Clean up all DBs on unmount
  React.useEffect(() => {
    const dbs = dbsRef.current;
    return () => {
      for (const db of dbs.values()) db.close();
      dbs.clear();
    };
  }, []);

  const toggleFileSelected = React.useCallback(
    (file: string) => {
      if (editing || adding || freehand || simplifying || deleting) return;
      setSelectedFiles((prev) =>
        prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file]
      );
      setDirty(false);
    },
    [editing, adding, freehand, simplifying, deleting]
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

  // Combined GeoJSON passed to the viewport. Each feature is tagged with
  // `__layer` so the viewport can color it by its source file.
  const combinedData =
    React.useMemo<GeoJSONFeatureCollection | null>(() => {
      if (selectedFiles.length === 0) return null;
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
      return { type: "FeatureCollection", features };
    }, [selectedFiles, layerData]);

  const layers = React.useMemo<LayerStyle[]>(
    () =>
      selectedFiles.map((file) => {
        const entry = layerData.get(file);
        const uniqueFclasses: string[] = [];
        if (entry) {
          const seen = new Set<string>();
          for (const f of entry.data.features) {
            const raw = f.properties?.fclass;
            if (raw == null) continue;
            const v = String(raw);
            if (seen.has(v)) continue;
            seen.add(v);
            uniqueFclasses.push(v);
          }
          uniqueFclasses.sort((a, b) => a.localeCompare(b));
        }
        return {
          id: file,
          color: colorFor(file),
          visible: !hiddenFiles.has(file),
          fclasses: uniqueFclasses.map((value) => ({
            value,
            color: fclassColorFor(value),
            visible: !hiddenFclasses.has(`${file}::${value}`),
          })),
        };
      }),
    [selectedFiles, layerData, hiddenFiles, hiddenFclasses]
  );

  const handleEdited = React.useCallback(
    (features: GeoJSON.Feature[]) => {
      const file = activeFile;
      const meta = metaRef.current;
      if (!file || !meta) return;
      setLayerData((prev) => {
        const entry = prev.get(file);
        if (!entry) return prev;
        const updatedFeatures = entry.data.features.slice();
        for (const edited of features) {
          const pk = edited.properties?.[meta.pkCol];
          if (pk == null) continue;
          const idx = updatedFeatures.findIndex(
            (f) => f.properties[meta.pkCol] === pk
          );
          if (idx !== -1) {
            updatedFeatures[idx] = {
              ...updatedFeatures[idx],
              geometry: edited.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
              properties: {
                ...updatedFeatures[idx].properties,
                __dirty: 1,
              },
            };
          }
        }
        const next = new Map(prev);
        next.set(file, {
          ...entry,
          data: { ...entry.data, features: updatedFeatures },
        });
        return next;
      });
      setDirty(true);
    },
    [activeFile]
  );

  const handleAdded = React.useCallback(
    (feature: GeoJSON.Feature) => {
      const file = activeFile;
      if (!file) return;
      const stamped = {
        ...feature,
        properties: { ...(feature.properties ?? {}), __dirty: 1 },
      } as GeoJSONFeatureCollection["features"][0];
      setLayerData((prev) => {
        const entry = prev.get(file);
        if (!entry) return prev;
        const next = new Map(prev);
        next.set(file, {
          ...entry,
          data: {
            ...entry.data,
            features: [...entry.data.features, stamped],
          },
        });
        return next;
      });
      setDirty(true);
      setAdding(false);
      setFreehand(false);
    },
    [activeFile]
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

  const handleToggleSimplify = React.useCallback(() => {
    if (!canEdit) return;
    setSimplifying((s) => !s);
  }, [canEdit]);

  const handleToggleDelete = React.useCallback(() => {
    if (!canEdit) return;
    setDeleting((d) => !d);
  }, [canEdit]);

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

  const handleDiscard = React.useCallback(() => {
    const file = activeFile;
    if (!file) return;
    const db = dbsRef.current.get(file);
    if (!db) return;
    // The in-memory sql.js DB is untouched until save, so re-reading it
    // rebuilds the pristine feature collection.
    const { geojson, meta } = gpkgToGeoJSON(db);
    setLayerData((prev) => {
      const next = new Map(prev);
      next.set(file, { data: geojson, meta });
      return next;
    });
    deletedPksByFileRef.current.delete(file);
    setDirty(false);
    setLoadId((n) => n + 1);
  }, [activeFile]);

  const handleSave = React.useCallback(async () => {
    const file = activeFile;
    if (!file) return;
    const db = dbsRef.current.get(file);
    const entry = layerData.get(file);
    if (!db || !entry) return;
    const meta = entry.meta;
    const fc = entry.data;

    setSaving(true);
    setError(null);

    try {
      const existing = fc.features.filter(
        (f) => f.properties[meta.pkCol] != null
      );
      const fresh = fc.features.filter(
        (f) => f.properties[meta.pkCol] == null
      );

      const deletedPks = deletedPksByFileRef.current.get(file);
      if (deletedPks && deletedPks.size > 0) {
        deleteGpkgFeatures(db, meta, [...deletedPks]);
      }
      updateGpkgFeatures(db, meta, existing);
      const newPks = insertGpkgFeatures(db, meta, fresh);

      const bytes = exportDatabase(db);

      const res = await fetch(`/api/gis/${encodeURIComponent(file)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes.buffer as ArrayBuffer,
      });

      if (!res.ok) throw new Error("Save failed");

      setLayerData((prev) => {
        const cur = prev.get(file);
        if (!cur) return prev;
        const updatedFeatures = cur.data.features.slice();
        let pkIdx = 0;
        for (let i = 0; i < updatedFeatures.length; i++) {
          const f = updatedFeatures[i];
          const needsPk =
            f.properties[meta.pkCol] == null && pkIdx < newPks.length;
          if (needsPk || f.properties.__dirty) {
            const rest: Record<string, unknown> = {};
            for (const k in f.properties) {
              if (k !== "__dirty") rest[k] = f.properties[k];
            }
            updatedFeatures[i] = {
              ...f,
              properties: needsPk
                ? { ...rest, [meta.pkCol]: newPks[pkIdx++] }
                : rest,
            };
          }
        }
        const next = new Map(prev);
        next.set(file, {
          ...cur,
          data: { ...cur.data, features: updatedFeatures },
        });
        return next;
      });

      deletedPksByFileRef.current.delete(file);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [activeFile, layerData]);

  const featureCount = combinedData?.features.length ?? 0;
  const selectionLocked =
    editing || adding || freehand || simplifying || deleting;

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
          simplifying={simplifying}
          importingDem={importingDem}
          deleting={deleting}
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
          onToggleSimplify={handleToggleSimplify}
          onToggleDelete={handleToggleDelete}
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
        />
      }
    >
      <div className="space-y-[var(--space-4)]">
        <Field label="GPKG Files">
          <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] p-[var(--space-2)]">
            {files.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No files
              </p>
            ) : (
              files.map((f) => {
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
