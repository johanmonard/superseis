"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { gpkgToGeoJSON, updateGpkgFeatures, exportDatabase } from "@/lib/gpkg";
import type { GeoJSONFeatureCollection, GpkgMeta } from "@/lib/gpkg";

const GisViewport = dynamic(
  () => import("@/components/features/demo/gis-viewport").then((m) => m.GisViewport),
  { ssr: false }
);

export default function GisPage() {
  const [files, setFiles] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string>("");
  const [data, setData] = React.useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
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

  // Called by the viewport when edit mode is toggled off
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

  const handleSave = React.useCallback(async () => {
    const db = dbRef.current;
    const meta = metaRef.current;
    if (!db || !meta || !data || !selected) return;

    setSaving(true);
    setError(null);

    try {
      updateGpkgFeatures(db, meta, data.features);
      const bytes = exportDatabase(db);

      const res = await fetch(`/api/gis/${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes.buffer as ArrayBuffer,
      });

      if (!res.ok) throw new Error("Save failed");
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
      title="GIS"
      panelTitle="Parameters"
      viewport={
        <GisViewport
          data={data}
          dataKey={`${selected}:${loadId}`}
          editing={editing}
          dirty={dirty}
          saving={saving}
          onToggleEdit={handleToggleEdit}
          onSave={handleSave}
          onEdited={handleEdited}
        />
      }
    >
      <div className="space-y-[var(--space-4)]">
        {/* File selector */}
        <div>
          <label
            htmlFor="gpkg-file"
            className="mb-[var(--space-1)] block text-xs font-medium text-[var(--color-text-muted)]"
          >
            GPKG File
          </label>
          <select
            id="gpkg-file"
            value={selected}
            disabled={editing}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-[var(--space-2)] py-[var(--space-1)] text-sm text-[var(--color-text-primary)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]"
          >
            <option value="">Select a file…</option>
            {files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

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
