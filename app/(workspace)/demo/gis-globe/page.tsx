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
  exportDatabase,
} from "@/lib/gpkg";
import type { GeoJSONFeatureCollection, GpkgMeta } from "@/lib/gpkg";
import type { RampName } from "@/components/features/demo/gis-globe-viewport";

const GisGlobeViewport = dynamic(
  () =>
    import("@/components/features/demo/gis-globe-viewport").then(
      (m) => m.GisGlobeViewport
    ),
  { ssr: false }
);

export default function GisGlobePage() {
  const [files, setFiles] = React.useState<string[]>([]);
  const [dems, setDems] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string>("");
  const [selectedDem, setSelectedDem] = React.useState<string>("");
  const [terrainOn, setTerrainOn] = React.useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = React.useState(1.4);
  const [demOpacity, setDemOpacity] = React.useState(0.85);
  const [demColorRamp, setDemColorRamp] =
    React.useState<RampName>("hypsometric");
  const [data, setData] = React.useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [freehand, setFreehand] = React.useState(false);
  const [simplifying, setSimplifying] = React.useState(false);
  const [importingDem, setImportingDem] = React.useState(false);
  const [demStatus, setDemStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "fetching" }
    | { kind: "ok"; file: string; tiles: number; zoom: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dirty, setDirty] = React.useState(false);
  const [loadId, setLoadId] = React.useState(0);

  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);

  const refreshFileList = React.useCallback(() => {
    fetch("/api/gis")
      .then((r) => r.json())
      .then((json: { files: string[]; dems: string[] }) => {
        setFiles(json.files);
        setDems(json.dems ?? []);
        if (json.files.length === 1) {
          setSelected((cur) => cur || json.files[0]);
        }
      })
      .catch(() => setError("Failed to list GIS files"));
  }, []);

  // Fetch file list once on mount
  React.useEffect(() => {
    refreshFileList();
  }, [refreshFileList]);

  // Load selected GPKG — keep DB alive for edits
  React.useEffect(() => {
    if (!selected) {
      dbRef.current?.close();
      dbRef.current = null;
      metaRef.current = null;
      setData(null);
      return;
    }

    let cancelled = false;
    setData(null);
    setLoading(true);
    setEditing(false);
    setAdding(false);
    setFreehand(false);
    setSimplifying(false);
    setImportingDem(false);
    setDemStatus({ kind: "idle" });
    setDirty(false);
    setError(null);

    (async () => {
      const [SQL, res] = await Promise.all([
        initSqlJs({ locateFile: () => "/sql-wasm.wasm" }),
        fetch(`/api/gis/${encodeURIComponent(selected)}`),
      ]);

      if (cancelled) return;
      if (!res.ok) {
        setError(`Failed to load ${selected}`);
        setLoading(false);
        return;
      }

      const buf = await res.arrayBuffer();
      dbRef.current?.close();

      const db = new SQL.Database(new Uint8Array(buf));
      dbRef.current = db;

      const { geojson, meta } = gpkgToGeoJSON(db);
      metaRef.current = meta;

      if (!cancelled) {
        setData(geojson);
        setLoadId((n) => n + 1);
        setLoading(false);
      }
    })().catch((e) => {
      if (!cancelled) {
        setError(String(e));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Clean up DB on unmount
  React.useEffect(() => {
    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  const handleEdited = React.useCallback((features: GeoJSON.Feature[]) => {
    setData((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, features: [...prev.features] };
      for (const edited of features) {
        const pk = edited.properties?.[metaRef.current?.pkCol ?? "fid"];
        if (pk == null) continue;
        const idx = updated.features.findIndex(
          (f) => f.properties[metaRef.current?.pkCol ?? "fid"] === pk
        );
        if (idx !== -1) {
          updated.features[idx] = {
            ...updated.features[idx],
            geometry: edited.geometry as GeoJSONFeatureCollection["features"][0]["geometry"],
            properties: {
              ...updated.features[idx].properties,
              __dirty: 1,
            },
          };
        }
      }
      return updated as GeoJSONFeatureCollection;
    });
    setDirty(true);
  }, []);

  const handleToggleEdit = React.useCallback(() => {
    setEditing((e) => !e);
  }, []);

  const handleToggleAdd = React.useCallback(() => {
    setAdding((a) => !a);
  }, []);

  const handleToggleFreehand = React.useCallback(() => {
    setFreehand((f) => !f);
  }, []);

  const handleToggleSimplify = React.useCallback(() => {
    setSimplifying((s) => !s);
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
    const base = (selected || "dem").replace(/\.gpkg$/i, "");
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .slice(0, 19);
    return `${base}_dem_${stamp}.tif`;
  }, [selected]);

  const handleToggleTerrain = React.useCallback(() => {
    setTerrainOn((v) => !v);
  }, []);

  const handleAdded = React.useCallback((feature: GeoJSON.Feature) => {
    const stamped = {
      ...feature,
      properties: { ...(feature.properties ?? {}), __dirty: 1 },
    } as GeoJSONFeatureCollection["features"][0];
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        features: [...prev.features, stamped],
      };
    });
    setDirty(true);
    setAdding(false);
    setFreehand(false);
  }, []);

  const handleSave = React.useCallback(async () => {
    const db = dbRef.current;
    const meta = metaRef.current;
    if (!db || !meta || !data || !selected) return;

    setSaving(true);
    setError(null);

    try {
      const existing = data.features.filter((f) => f.properties[meta.pkCol] != null);
      const fresh = data.features.filter((f) => f.properties[meta.pkCol] == null);

      updateGpkgFeatures(db, meta, existing);
      const newPks = insertGpkgFeatures(db, meta, fresh);

      const bytes = exportDatabase(db);

      const res = await fetch(`/api/gis/${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes.buffer as ArrayBuffer,
      });

      if (!res.ok) throw new Error("Save failed");

      setData((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, features: prev.features.slice() };
        let pkIdx = 0;
        for (let i = 0; i < updated.features.length; i++) {
          const f = updated.features[i];
          const needsPk =
            f.properties[meta.pkCol] == null && pkIdx < newPks.length;
          if (needsPk || f.properties.__dirty) {
            const rest: Record<string, unknown> = {};
            for (const k in f.properties) {
              if (k !== "__dirty") rest[k] = f.properties[k];
            }
            updated.features[i] = {
              ...f,
              properties: needsPk
                ? { ...rest, [meta.pkCol]: newPks[pkIdx++] }
                : rest,
            };
          }
        }
        return updated;
      });

      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [data, selected]);

  const featureCount = data?.features.length ?? 0;

  return (
    <ProjectSettingsPage
      title="GIS Globe"
      panelTitle="Parameters"
      viewport={
        <GisGlobeViewport
          data={data}
          dataKey={`${selected}:${loadId}`}
          editing={editing}
          adding={adding}
          freehand={freehand}
          simplifying={simplifying}
          importingDem={importingDem}
          demFile={selectedDem}
          demOpacity={demOpacity}
          demColorRamp={demColorRamp}
          terrainOn={terrainOn}
          terrainExaggeration={terrainExaggeration}
          dirty={dirty}
          saving={saving}
          geometryType={metaRef.current?.geometryType ?? "GEOMETRY"}
          onToggleEdit={handleToggleEdit}
          onToggleAdd={handleToggleAdd}
          onToggleFreehand={handleToggleFreehand}
          onToggleSimplify={handleToggleSimplify}
          onToggleImportDem={handleToggleImportDem}
          onToggleTerrain={handleToggleTerrain}
          onSetTerrainExaggeration={setTerrainExaggeration}
          onSetDemOpacity={setDemOpacity}
          onSetDemColorRamp={setDemColorRamp}
          demNameSuggestion={demNameSuggestion}
          onConfirmDemDownload={handleConfirmDemDownload}
          onSave={handleSave}
          onEdited={handleEdited}
          onAdded={handleAdded}
        />
      }
    >
      <div className="space-y-[var(--space-4)]">
        <Field label="GPKG File" htmlFor="gpkg-file">
          <Select
            id="gpkg-file"
            value={selected}
            disabled={editing}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a file…</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>

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
        {data && !loading && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {featureCount} feature{featureCount !== 1 ? "s" : ""} loaded
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
