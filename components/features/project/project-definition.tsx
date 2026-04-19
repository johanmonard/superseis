"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";

const {
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  search: Search,
  upload: Upload,
  x: X,
  info: Info,
  alertTriangle: AlertTriangle,
  loader: Loader,
} = appIcons;
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CountryMap } from "@/components/features/project/country-map";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import {
  CrsInfoPanel,
  type CrsPanelState,
} from "@/components/features/project/crs-info-panel";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import { fetchCrsInfo, type CrsInfoResponse } from "@/services/api/crs";
import { useQuery } from "@tanstack/react-query";

/* ------------------------------------------------------------------
   Country list (ISO 3166-1 subset — extend as needed)
   ------------------------------------------------------------------ */

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Cameroon",
  "Canada","Chad","Chile","China","Colombia","Congo","Costa Rica","Croatia",
  "Cuba","Cyprus","Czech Republic","Denmark","Ecuador","Egypt","Estonia",
  "Ethiopia","Finland","France","Gabon","Georgia","Germany","Ghana","Greece",
  "Guatemala","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland",
  "Israel","Italy","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Latvia",
  "Lebanon","Libya","Lithuania","Luxembourg","Malaysia","Mali","Mexico",
  "Mongolia","Morocco","Mozambique","Myanmar","Netherlands","New Zealand",
  "Niger","Nigeria","Norway","Oman","Pakistan","Panama","Papua New Guinea",
  "Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania",
  "Russia","Saudi Arabia","Senegal","Serbia","Singapore","Slovakia","Slovenia",
  "South Africa","South Korea","Spain","Sri Lanka","Sudan","Sweden",
  "Switzerland","Syria","Taiwan","Tanzania","Thailand","Trinidad and Tobago",
  "Tunisia","Turkey","Turkmenistan","UAE","Uganda","UK","Ukraine",
  "United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia",
  "Zimbabwe",
];

/* ------------------------------------------------------------------
   Searchable Select
   ------------------------------------------------------------------ */

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setQuery("");
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex h-[var(--control-height-md)] w-full items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] text-sm shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          value ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]"
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <Search size={14} className="shrink-0 text-[var(--color-text-muted)]" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          <div className="border-b border-[var(--color-border-subtle)] p-[var(--space-2)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-7 w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-[var(--space-1)]">
            {filtered.length === 0 ? (
              <p className="px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
                No results
              </p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-left text-xs transition-colors",
                    opt === value
                      ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-medium text-[var(--color-accent)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                  )}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   File Upload
   ------------------------------------------------------------------ */

function FileUpload({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-[var(--space-2)]">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} className="mr-[var(--space-2)]" />
        Upload files
      </Button>
      {files.length > 0 && (
        <div className="flex flex-col gap-[var(--space-1)]">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
            >
              <span className="truncate text-xs text-[var(--color-text-secondary)]">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Split-pane layout
   ------------------------------------------------------------------ */

const MIN_LEFT_FRACTION = 0.15;
const MAX_LEFT_FRACTION = 0.85;
const DEFAULT_LEFT_FRACTION = 1 / 3;
const COLLAPSED_WIDTH = 36;

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

interface DefinitionData {
  client: string;
  contractor: string;
  country: string;
  epsg: string;
  second: string;
  region: string;
  crsName: string;
  overlapGrid: string;
  overlapStrip: string;
  notes: string;
}

function parseIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DEFAULT_DEFINITION: DefinitionData = {
  client: "",
  contractor: "",
  country: "",
  epsg: "",
  second: "",
  region: "",
  crsName: "",
  overlapGrid: "",
  overlapStrip: "",
  notes: "",
};

export function ProjectDefinition() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = React.useState(DEFAULT_LEFT_FRACTION);
  const [collapsed, setCollapsed] = React.useState(false);
  const isDragging = React.useRef(false);
  const [isResizing, setIsResizing] = React.useState(false);

  // Section data — React Query cache is the source of truth
  const { data, update } = useSectionData<DefinitionData>(
    projectId,
    "definition",
    DEFAULT_DEFINITION,
  );

  const setField = React.useCallback(
    <K extends keyof DefinitionData>(key: K, value: DefinitionData[K]) => {
      update({ ...data, [key]: value });
    },
    [data, update],
  );

  // Local-only (not persisted)
  const [files, setFiles] = React.useState<File[]>([]);

  // --- CRS lookup (on blur / Enter in the EPSG field) ------------------
  // EPSG code that has been *committed* (i.e. the user finished editing the
  // field). This is what drives the actual network request. As long as the
  // user is still typing, we don't fire.
  const [committedEpsg, setCommittedEpsg] = React.useState<number | null>(
    () => (data.epsg ? parseIntOrNull(data.epsg) : null),
  );
  const [showCrsPanel, setShowCrsPanel] = React.useState(false);

  // Keep committedEpsg in sync when section data reloads (fresh project,
  // reload from disk, etc.) — only when the user isn't mid-edit.
  const lastHydratedEpsgRef = React.useRef<string>("");
  React.useEffect(() => {
    if (data.epsg === lastHydratedEpsgRef.current) return;
    lastHydratedEpsgRef.current = data.epsg;
    const n = parseIntOrNull(data.epsg);
    setCommittedEpsg(n);
  }, [data.epsg]);

  const crsQuery = useQuery<CrsInfoResponse, Error>({
    queryKey: ["crs-info", committedEpsg],
    queryFn: ({ signal }) => fetchCrsInfo(committedEpsg as number, signal),
    enabled: committedEpsg != null && committedEpsg > 0,
    staleTime: Infinity,
    retry: false,
  });

  // Auto-fill crsName from a successful lookup. User is not expected to
  // edit crsName manually, so we always overwrite.
  React.useEffect(() => {
    if (crsQuery.data && crsQuery.data.name !== data.crsName) {
      update({ ...data, crsName: crsQuery.data.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crsQuery.data]);

  // Clear crsName whenever the lookup fails so the field doesn't keep a
  // stale name from a previous valid code.
  React.useEffect(() => {
    if (crsQuery.isError && data.crsName !== "") {
      update({ ...data, crsName: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crsQuery.isError]);

  const commitEpsg = React.useCallback(() => {
    const n = parseIntOrNull(data.epsg);
    setCommittedEpsg(n);
  }, [data.epsg]);

  const crsAreaBounds: [number, number, number, number] | null = React.useMemo(() => {
    const info = crsQuery.data;
    if (
      !info ||
      info.area_west == null ||
      info.area_south == null ||
      info.area_east == null ||
      info.area_north == null
    ) {
      return null;
    }
    return [info.area_west, info.area_south, info.area_east, info.area_north];
  }, [crsQuery.data]);

  const crsPanelState: CrsPanelState | null = React.useMemo(() => {
    if (committedEpsg == null) return null;
    if (crsQuery.isLoading) return { status: "loading", epsg: committedEpsg };
    if (crsQuery.isError)
      return {
        status: "error",
        epsg: committedEpsg,
        message: crsQuery.error?.message ?? "Lookup failed",
      };
    if (crsQuery.data) return { status: "ready", info: crsQuery.data };
    return null;
  }, [committedEpsg, crsQuery.data, crsQuery.isError, crsQuery.isLoading, crsQuery.error]);

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    setIsResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.min(MAX_LEFT_FRACTION, Math.max(MIN_LEFT_FRACTION, x / rect.width));
    setLeftFraction(fraction);
  }, []);

  const handlePointerUp = React.useCallback(() => {
    isDragging.current = false;
    setIsResizing(false);
  }, []);

  const handleAddFiles = React.useCallback((fileList: FileList) => {
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
  }, []);

  const handleRemoveFile = React.useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div ref={containerRef} className="flex h-full flex-row">
      {/* Parameters panel */}
      <div
        className={cn(
          "overflow-hidden border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]",
          !isResizing && "transition-all duration-300 ease-in-out",
          !collapsed && "overflow-auto"
        )}
        // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
        style={collapsed ? { flex: `0 0 ${COLLAPSED_WIDTH}px` } : { flex: `0 0 ${leftFraction * 100}%` }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex h-full w-full flex-col items-center justify-between py-[var(--space-3)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ChevronRight size={14} />
            {/* eslint-disable-next-line template/no-jsx-style-prop -- vertical text */}
            <span className="text-xs font-semibold tracking-wide" style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}>
              Parameters
            </span>
            <div />
          </button>
        ) : (
        <div className="p-[var(--space-4)]">
          <div className="mb-[var(--space-4)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Parameters
            </h2>
            <div className="flex items-center gap-[var(--space-2)]">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                aria-label="Collapse panel"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-[var(--space-4)]">
            <Field label="Project Name" htmlFor="def-project-name" layout="horizontal">
              <Input
                id="def-project-name"
                value={activeProject?.name ?? ""}
                readOnly
                className="bg-[var(--color-bg-elevated)]"
              />
            </Field>

            <Field label="Client" htmlFor="def-client" layout="horizontal">
              <Input
                id="def-client"
                value={data.client}
                onChange={(e) => setField("client", e.target.value)}
                placeholder="Client name"
              />
            </Field>

            <Field label="Contractor" htmlFor="def-contractor" layout="horizontal">
              <Input
                id="def-contractor"
                value={data.contractor}
                onChange={(e) => setField("contractor", e.target.value)}
                placeholder="Contractor name"
              />
            </Field>

            <Field label="Country" htmlFor="def-country" layout="horizontal">
              <SearchableSelect
                value={data.country}
                onChange={(v) => setField("country", v)}
                options={COUNTRIES}
                placeholder="Select a country"
              />
            </Field>

            <Field label="Region" htmlFor="def-region" layout="horizontal">
              <Input
                id="def-region"
                value={data.region}
                onChange={(e) => setField("region", e.target.value)}
                placeholder="Region or province"
              />
            </Field>

            <Field
              label="EPSG Number"
              htmlFor="def-epsg"
              layout="horizontal"
              hint={
                crsQuery.isError && committedEpsg
                  ? `EPSG:${committedEpsg} not found`
                  : undefined
              }
            >
              <div className="flex items-center gap-[var(--space-1)]">
                <Input
                  id="def-epsg"
                  type="number"
                  value={data.epsg}
                  onChange={(e) => setField("epsg", e.target.value)}
                  onBlur={commitEpsg}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEpsg();
                    }
                  }}
                  placeholder="e.g. 4326"
                  className={cn(
                    crsQuery.isError && committedEpsg != null
                      ? "border-[var(--color-status-danger)] focus-visible:ring-[var(--color-status-danger)]"
                      : undefined,
                  )}
                />
                {crsQuery.isLoading && committedEpsg != null ? (
                  <Loader
                    size={14}
                    className="shrink-0 animate-spin text-[var(--color-text-muted)]"
                  />
                ) : crsQuery.isError && committedEpsg != null ? (
                  <AlertTriangle
                    size={14}
                    className="shrink-0 text-[var(--color-status-danger)]"
                  />
                ) : null}
                <button
                  type="button"
                  aria-label="Show CRS details"
                  onClick={() => setShowCrsPanel((v) => !v)}
                  disabled={committedEpsg == null}
                  className={cn(
                    "flex h-[var(--control-height-sm)] w-[var(--control-height-sm)] shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                    "text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
                    "disabled:pointer-events-none disabled:opacity-40",
                    showCrsPanel && "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]",
                  )}
                >
                  <Info size={14} />
                </button>
              </div>
            </Field>

            <Field label="CRS Name" htmlFor="def-crs" layout="horizontal">
              <Input
                id="def-crs"
                value={data.crsName}
                readOnly
                placeholder={
                  committedEpsg == null
                    ? "Enter an EPSG number"
                    : crsQuery.isLoading
                      ? "Looking up…"
                      : "Unknown EPSG"
                }
                className="bg-[var(--color-bg-elevated)]"
              />
            </Field>

            <Field label="Second" htmlFor="def-second" layout="horizontal">
              <Input
                id="def-second"
                type="number"
                value={data.second}
                onChange={(e) => setField("second", e.target.value)}
              />
            </Field>

            <Field label="No Overlap Grid" htmlFor="def-overlap-grid" layout="horizontal">
              <Select
                id="def-overlap-grid"
                value={data.overlapGrid}
                onChange={(e) => setField("overlapGrid", e.target.value)}
              >
                <option value="">Select…</option>
                <option value="Source">Source</option>
                <option value="Receiver">Receiver</option>
              </Select>
            </Field>

            <Field label="No Overlap Strip" htmlFor="def-overlap-strip" layout="horizontal">
              <Select
                id="def-overlap-strip"
                value={data.overlapStrip}
                onChange={(e) => setField("overlapStrip", e.target.value)}
              >
                <option value="">Select…</option>
                <option value="Inline">Inline</option>
                <option value="Crossline">Crossline</option>
              </Select>
            </Field>

            <Field label="Reference Files" layout="horizontal">
              <FileUpload
                files={files}
                onAdd={handleAddFiles}
                onRemove={handleRemoveFile}
              />
            </Field>

            <Field label="Notes" htmlFor="def-notes" hint={`${data.notes.length}/300`}>
              <Textarea
                id="def-notes"
                rows={6}
                maxLength={300}
                value={data.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Additional notes…"
              />
            </Field>
          </div>
        </div>
        )}
      </div>

      {/* Drag handle — hidden when collapsed */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(leftFraction * 100)}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={cn(
            "z-10 flex w-2 shrink-0 cursor-col-resize items-center justify-center",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          )}
        >
          <div className="w-[3px] h-12 rounded-full bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-border-strong)]" />
        </div>
      )}

      {/* CRS info middle panel */}
      {showCrsPanel && crsPanelState && (
        <>
          <div
            className="min-w-0 flex-shrink-0 overflow-hidden border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
            style={{ width: "clamp(300px, 28%, 460px)" }}
          >
            <CrsInfoPanel
              state={crsPanelState}
              onClose={() => setShowCrsPanel(false)}
            />
          </div>
          <div className="w-2 shrink-0" />
        </>
      )}

      {/* Viewport panel */}
      <div className="relative min-w-0 flex-1 overflow-hidden border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <div className="flex h-full flex-col items-center justify-center">
          {data.country ? (
            <CountryMap country={data.country} crsBounds={crsAreaBounds} />
          ) : (
            <ViewportPlaceholder variant="globe" message="Select a country" />
          )}
        </div>
        {data.country && (
          <ViewportLegend
            country={data.country}
            region={data.region}
            crs={crsQuery.data ?? null}
          />
        )}
      </div>
    </div>
  );
}

function ViewportLegend({
  country,
  region,
  crs,
}: {
  country: string;
  region: string;
  crs: CrsInfoResponse | null;
}) {
  return (
    <div className="pointer-events-none absolute left-[var(--space-3)] top-[var(--space-3)] z-10 flex max-w-[18rem] flex-col gap-[2px] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[color-mix(in_srgb,var(--color-bg-surface)_92%,transparent)] p-[var(--space-2)] text-xs shadow-[0_2px_6px_var(--color-shadow-alpha)] backdrop-blur">
      <div className="pb-[var(--space-1)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Legend
      </div>

      {/* Country row — solid accent swatch matches the selected-country fill */}
      <div className="flex items-center gap-[var(--space-2)] px-[2px] py-[2px]">
        <span
          aria-hidden
          className="inline-block h-[14px] w-[14px] shrink-0 rounded-[3px] border border-[var(--color-border-subtle)] bg-[var(--color-accent)]"
        />
        <span className="truncate text-[var(--color-text-primary)]">
          {country}
          {region ? ` · ${region}` : ""}
        </span>
      </div>

      {/* CRS area row — dashed swatch mirrors the polygon stroke on the globe */}
      {crs && (
        <div className="flex items-start gap-[var(--space-2)] px-[2px] py-[2px]">
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 14 14"
            className="mt-[2px] shrink-0"
          >
            <rect
              x="1"
              y="1"
              width="12"
              height="12"
              rx="2"
              fill="color-mix(in srgb, var(--color-accent) 12%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth="1.25"
              strokeDasharray="3 2"
            />
          </svg>
          <div className="min-w-0 flex-1 text-[var(--color-text-primary)]">
            <div className="truncate">EPSG:{crs.epsg}</div>
            <div className="truncate text-[var(--color-text-secondary)]">
              {crs.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
