"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import type { Trajectory } from "@/components/features/demo/animate-3d-viewport";

const Animate3DViewport = dynamic(
  () =>
    import("@/components/features/demo/animate-3d-viewport").then(
      (m) => m.Animate3DViewport
    ),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in";

interface FilterDef {
  op: FilterOp;
  value: string;
}

interface FieldInfo {
  name: string;
  type: string;
  logicalType: unknown;
}

const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "\u2260" },
  { value: "gt", label: ">" },
  { value: "gte", label: "\u2265" },
  { value: "lt", label: "<" },
  { value: "lte", label: "\u2264" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
];

function formatType(field: FieldInfo): string {
  if (field.logicalType && typeof field.logicalType === "object") {
    const lt = field.logicalType as Record<string, unknown>;
    if (lt.type) return String(lt.type);
  }
  return String(field.type);
}

// Fields whose filter value should be a dropdown of unique values
const DROPDOWN_FIELDS = new Set([
  "day",
  "wtype",
  "type",
  "wid",
  "zipper",
  "swath",
]);

// Fields that allow multi-select (value stored as comma-separated, op forced to "in")
const MULTI_SELECT_FIELDS = new Set(["event"]);

// Default event types to pre-select when event uniques are available
const DEFAULT_EVENTS = new Set([
  "ACQU", "BASE", "BORN", "CGRP", "CPRG", "TRAV",
]);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Animate3DPage() {
  const [files, setFiles] = React.useState<string[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<string>("");
  const [fields, setFields] = React.useState<FieldInfo[]>([]);
  const [numRows, setNumRows] = React.useState<number | null>(null);
  const [filters, setFilters] = React.useState<Record<string, FilterDef>>({});
  const [uniques, setUniques] = React.useState<Record<string, (string | number)[]>>({});
  const [counting, setCounting] = React.useState(false);
  const [filteredCount, setFilteredCount] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadProgress, setLoadProgress] = React.useState(0);
  const [loadMessage, setLoadMessage] = React.useState("");
  const [trajectories, setTrajectories] = React.useState<Trajectory[] | undefined>();

  // Elevation preprocessing
  const [hasElevation, setHasElevation] = React.useState(false);
  const [elevProcessing, setElevProcessing] = React.useState(false);
  const [elevProgress, setElevProgress] = React.useState(0);
  const [elevMessage, setElevMessage] = React.useState("");
  const [schemaKey, setSchemaKey] = React.useState(0); // bump to re-fetch schema

  // Fetch list of parquet files
  React.useEffect(() => {
    fetch("/api/parquet")
      .then((r) => r.json())
      .then((json: { files: string[] }) => setFiles(json.files))
      .catch(() => setError("Failed to list parquet files"));
  }, []);

  // When a file is selected (or schema refreshed after elevation), fetch its schema
  React.useEffect(() => {
    if (!selectedFile) {
      setFields([]);
      setNumRows(null);
      setFilters({});
      setFilteredCount(null);
      setHasElevation(false);
      return;
    }
    setError(null);
    setFilteredCount(null);
    setUniques({});
    setTrajectories(undefined);
    const uniquesCols = [...DROPDOWN_FIELDS, ...MULTI_SELECT_FIELDS].join(",");
    fetch(
      `/api/parquet/${encodeURIComponent(selectedFile)}?uniques=${uniquesCols}`
    )
      .then((r) => r.json())
      .then(
        (json: {
          fields: FieldInfo[];
          numRows: number;
          uniques?: Record<string, (string | number)[]>;
          error?: string;
        }) => {
          if (json.error) {
            setError(json.error);
            return;
          }
          setFields(json.fields);
          setNumRows(json.numRows);
          const u = json.uniques ?? {};
          setUniques(u);
          setHasElevation(json.fields.some((f) => f.name === "elevation"));
          const init: Record<string, FilterDef> = {};
          for (const f of json.fields) {
            if (f.name === "event" && u.event) {
              // Pre-select default events that exist in this file
              const available = new Set(u.event.map(String));
              const selected = [...DEFAULT_EVENTS].filter((e) => available.has(e));
              init[f.name] = { op: "in", value: selected.join(",") };
            } else {
              init[f.name] = { op: MULTI_SELECT_FIELDS.has(f.name) ? "in" : "eq", value: "" };
            }
          }
          setFilters(init);
        }
      )
      .catch(() => setError("Failed to read schema"));
  }, [selectedFile, schemaKey]);

  const handleAddElevation = () => {
    if (!selectedFile || elevProcessing) return;
    setElevProcessing(true);
    setElevProgress(0);
    setElevMessage("Starting...");
    setError(null);

    const evtSource = new EventSource(
      `/api/parquet/${encodeURIComponent(selectedFile)}/elevation`
    );
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as {
          stage: string;
          progress: number;
          message: string;
        };
        setElevProgress(data.progress);
        setElevMessage(data.message);
        if (data.stage === "done" || data.stage === "closed") {
          evtSource.close();
          setElevProcessing(false);
          setSchemaKey((k) => k + 1); // re-fetch schema
        } else if (data.stage === "error") {
          evtSource.close();
          setElevProcessing(false);
          setError(data.message);
        }
      } catch {
        // ignore parse errors
      }
    };
    evtSource.onerror = () => {
      evtSource.close();
      setElevProcessing(false);
      setError("Elevation processing connection lost");
    };
  };

  const updateFilterOp = (field: string, op: FilterOp) => {
    setFilters((prev) => ({ ...prev, [field]: { ...prev[field], op } }));
    setFilteredCount(null);
  };

  const updateFilterValue = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: { ...prev[field], value } }));
    setFilteredCount(null);
  };

  // Toggle a single value in a comma-separated multi-select filter
  const toggleMultiValue = (field: string, val: string) => {
    setFilters((prev) => {
      const cur = prev[field]?.value ?? "";
      const set = new Set(cur ? cur.split(",") : []);
      if (set.has(val)) set.delete(val);
      else set.add(val);
      return { ...prev, [field]: { op: "in" as FilterOp, value: Array.from(set).join(",") } };
    });
    setFilteredCount(null);
  };

  const handleCount = async () => {
    if (!selectedFile) return;
    setCounting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/parquet/${encodeURIComponent(selectedFile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters }),
        }
      );
      const json = (await res.json()) as { count: number; error?: string };
      if (json.error) setError(json.error);
      else setFilteredCount(json.count);
    } catch {
      setError("Count request failed");
    } finally {
      setCounting(false);
    }
  };

  const handleLoadTrajectories = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setLoadProgress(0);
    setLoadMessage("Starting…");
    setError(null);
    try {
      const res = await fetch(
        `/api/parquet/${encodeURIComponent(selectedFile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "trajectories",
            filters,
            timeCol: "time",
            entityCol: "wid",
            groupCol: "type",
            lonCol: "lon",
            latCol: "lat",
          }),
        }
      );
      if (!res.body) {
        setError("No response stream");
        return;
      }

      const reader = res.body.getReader();
      let textBuf = new Uint8Array(0);
      let binaryMode = false;
      const binaryChunks: Uint8Array[] = [];
      let binaryMeta: { count: number; hasElevation: boolean } | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        if (binaryMode) {
          binaryChunks.push(value);
          continue;
        }

        // Append chunk to text buffer
        const combined = new Uint8Array(textBuf.length + value.length);
        combined.set(textBuf);
        combined.set(value, textBuf.length);

        // Scan for newline-delimited JSON lines
        let start = 0;
        for (let i = 0; i < combined.length; i++) {
          if (combined[i] !== 0x0a) continue; // \n
          const line = new TextDecoder().decode(combined.slice(start, i)).trim();
          start = i + 1;
          if (!line) continue;
          const msg = JSON.parse(line) as {
            type: string;
            progress?: number;
            message?: string;
            count?: number;
            hasElevation?: boolean;
            error?: string;
          };
          if (msg.type === "progress") {
            setLoadProgress(msg.progress ?? 0);
            setLoadMessage(msg.message ?? "");
          } else if (msg.type === "binary_start") {
            binaryMeta = { count: msg.count ?? 0, hasElevation: msg.hasElevation ?? false };
            binaryMode = true;
            const remaining = combined.slice(start);
            if (remaining.length > 0) binaryChunks.push(remaining);
            break;
          } else if (msg.type === "error") {
            setError(msg.error ?? "Unknown error");
          }
        }
        if (!binaryMode) textBuf = combined.slice(start);
      }

      // Decode binary trajectories
      if (binaryMeta && binaryChunks.length > 0) {
        const totalLen = binaryChunks.reduce((s, c) => s + c.length, 0);
        const allBytes = new Uint8Array(totalLen);
        let wo = 0;
        for (const c of binaryChunks) { allBytes.set(c, wo); wo += c.length; }

        const view = new DataView(allBytes.buffer, allBytes.byteOffset, allBytes.byteLength);
        let off = 0;
        const numEntities = view.getUint32(off, true); off += 4;
        const result: Trajectory[] = [];

        for (let i = 0; i < numEntities; i++) {
          const idLen = view.getUint32(off, true); off += 4;
          const id = new TextDecoder().decode(allBytes.slice(off, off + idLen)); off += idLen;
          const numPos = view.getUint32(off, true); off += 4;
          const numAcqu = view.getUint32(off, true); off += 4;

          const posBytes = numPos * 4 * 8;
          const positions = new Float64Array(numPos * 4);
          new Uint8Array(positions.buffer).set(allBytes.slice(off, off + posBytes));
          off += posBytes;

          const acqBytes = numAcqu * 4 * 8;
          const acqu = new Float64Array(numAcqu * 4);
          new Uint8Array(acqu.buffer).set(allBytes.slice(off, off + acqBytes));
          off += acqBytes;

          result.push({ id, positions, acqu });
        }

        setFilteredCount(binaryMeta.count);
        setTrajectories(result);
      }
    } catch {
      setError("Failed to load trajectories");
    } finally {
      setLoading(false);
    }
  };

  const hasActiveFilters = Object.values(filters).some((f) => f.value !== "");

  return (
    <ProjectSettingsPage
      title="Animate 3D"
      viewport={<Animate3DViewport trajectories={trajectories} />}
    >
      {/* File selector */}
      <Field label="Parquet file" htmlFor="parquet-file">
        <Select
          id="parquet-file"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="">— Select a file —</option>
          {files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Field>

      {numRows != null && (
        <p className="mt-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
          {numRows.toLocaleString()} total rows &middot; {fields.length} fields
          {hasElevation && " \u00b7 elevation \u2713"}
        </p>
      )}

      {/* Elevation preprocessing */}
      {selectedFile && fields.length > 0 && !hasElevation && (
        <div className="mt-[var(--space-3)] flex flex-col gap-[var(--space-2)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <button
              type="button"
              disabled={elevProcessing}
              onClick={handleAddElevation}
              className="rounded-[var(--radius-sm)] bg-[var(--color-bg-brand)] px-[var(--space-3)] py-[var(--space-2)] text-sm font-medium text-[var(--color-text-on-brand)] transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {elevProcessing ? "Processing\u2026" : "Add elevation data"}
            </button>
          </div>
          {elevProcessing && (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                <div
                  className="h-full rounded-full bg-[#3b82f6] transition-all duration-300"
                  // eslint-disable-next-line template/no-jsx-style-prop
                  style={{ width: `${Math.round(elevProgress * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {elevMessage}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {fields.length > 0 && (
        <div className="mt-[var(--space-4)] flex flex-col gap-[var(--space-2)]">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Fields &amp; Filters
          </h3>

          {fields.map((field) => {
            const isMulti = MULTI_SELECT_FIELDS.has(field.name) && uniques[field.name];
            const isDropdown = DROPDOWN_FIELDS.has(field.name) && uniques[field.name];
            const selectedSet = isMulti
              ? new Set((filters[field.name]?.value ?? "").split(",").filter(Boolean))
              : undefined;

            return (
              <div key={field.name}>
                <div className="flex items-center gap-[var(--space-1)]">
                  <span className="w-20 shrink-0 truncate text-xs font-medium text-[var(--color-text-primary)]" title={field.name}>
                    {field.name}
                  </span>
                  <span className="w-12 shrink-0 truncate text-[10px] text-[var(--color-text-muted)]" title={formatType(field)}>
                    {formatType(field)}
                  </span>
                  {isMulti ? (
                    <span className="min-w-0 flex-1 text-[10px] text-[var(--color-text-muted)]">
                      {selectedSet!.size === 0 ? "all" : `${selectedSet!.size} selected`}
                    </span>
                  ) : (
                    <>
                      <select
                        value={filters[field.name]?.op ?? "eq"}
                        onChange={(e) =>
                          updateFilterOp(field.name, e.target.value as FilterOp)
                        }
                        className="shrink-0 appearance-none rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-1 py-1 text-xs text-[var(--color-text-primary)]"
                      >
                        {FILTER_OPS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {isDropdown ? (
                        <select
                          value={filters[field.name]?.value ?? ""}
                          onChange={(e) =>
                            updateFilterValue(field.name, e.target.value)
                          }
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-1 text-xs text-[var(--color-text-primary)]"
                        >
                          <option value="">all</option>
                          {uniques[field.name].map((v) => (
                            <option key={String(v)} value={String(v)}>
                              {String(v)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="value"
                          value={filters[field.name]?.value ?? ""}
                          onChange={(e) =>
                            updateFilterValue(field.name, e.target.value)
                          }
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-focus-ring)] focus:outline-none"
                        />
                      )}
                    </>
                  )}
                </div>
                {isMulti && (
                  <div className="mt-1 ml-20 flex flex-wrap gap-x-[var(--space-2)] gap-y-0.5">
                    {uniques[field.name].map((v) => {
                      const s = String(v);
                      const checked = selectedSet!.has(s);
                      return (
                        <label key={s} className="flex items-center gap-1 text-xs text-[var(--color-text-primary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMultiValue(field.name, s)}
                            className="accent-[#3b82f6]"
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Action buttons */}
          <div className="mt-[var(--space-2)] flex gap-[var(--space-2)]">
            <button
              type="button"
              disabled={counting}
              onClick={handleCount}
              className="rounded-[var(--radius-sm)] bg-[var(--color-bg-brand)] px-[var(--space-3)] py-[var(--space-2)] text-sm font-medium text-[var(--color-text-on-brand)] transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {counting ? "Counting\u2026" : "Count"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleLoadTrajectories}
              className="rounded-[var(--radius-sm)] bg-[var(--color-bg-brand)] px-[var(--space-3)] py-[var(--space-2)] text-sm font-medium text-[var(--color-text-on-brand)] transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Loading\u2026" : "Load & Animate"}
            </button>
          </div>

          {/* Loading progress */}
          {loading && (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                <div
                  className="h-full rounded-full bg-[#3b82f6] transition-all duration-300"
                  // eslint-disable-next-line template/no-jsx-style-prop
                  style={{ width: `${Math.round(loadProgress * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {loadMessage}
              </p>
            </div>
          )}

          {/* Count result */}
          {filteredCount != null && (
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {hasActiveFilters ? "Filtered" : "Total"} count:{" "}
              <span className="font-bold">
                {filteredCount.toLocaleString()}
              </span>
              {hasActiveFilters && numRows != null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">
                  / {numRows.toLocaleString()}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-[var(--space-2)] text-xs text-[var(--color-text-danger)]">{error}</p>
      )}
    </ProjectSettingsPage>
  );
}
