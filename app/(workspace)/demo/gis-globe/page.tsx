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

const GisGlobeViewport = dynamic(
  () =>
    import("@/components/features/demo/gis-globe-viewport").then(
      (m) => m.GisGlobeViewport
    ),
  { ssr: false }
);

export default function GisGlobePage() {
  const [files, setFiles] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string>("");
  const [data, setData] = React.useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [freehand, setFreehand] = React.useState(false);
  const [simplifying, setSimplifying] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [loadId, setLoadId] = React.useState(0);

  const dbRef = React.useRef<Database | null>(null);
  const metaRef = React.useRef<GpkgMeta | null>(null);

  // Fetch file list
  React.useEffect(() => {
    fetch("/api/gis")
      .then((r) => r.json())
      .then((json: { files: string[] }) => {
        setFiles(json.files);
        if (json.files.length === 1) setSelected(json.files[0]);
      })
      .catch(() => setError("Failed to list GIS files"));
  }, []);

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

  const handleAdded = React.useCallback((feature: GeoJSON.Feature) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        features: [
          ...prev.features,
          feature as GeoJSONFeatureCollection["features"][0],
        ],
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

      if (newPks.length > 0) {
        setData((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, features: prev.features.slice() };
          let pkIdx = 0;
          for (let i = 0; i < updated.features.length; i++) {
            if (
              updated.features[i].properties[meta.pkCol] == null &&
              pkIdx < newPks.length
            ) {
              updated.features[i] = {
                ...updated.features[i],
                properties: {
                  ...updated.features[i].properties,
                  [meta.pkCol]: newPks[pkIdx++],
                },
              };
            }
          }
          return updated;
        });
      }

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
          dirty={dirty}
          saving={saving}
          geometryType={metaRef.current?.geometryType ?? "GEOMETRY"}
          onToggleEdit={handleToggleEdit}
          onToggleAdd={handleToggleAdd}
          onToggleFreehand={handleToggleFreehand}
          onToggleSimplify={handleToggleSimplify}
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
      </div>
    </ProjectSettingsPage>
  );
}
