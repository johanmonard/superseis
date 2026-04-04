"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";

const { chevronLeft: ChevronLeft, chevronRight: ChevronRight, search: Search, upload: Upload, x: X } = appIcons;
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { useActiveProject } from "@/lib/use-active-project";
import { cn } from "@/lib/utils";

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

export function ProjectDefinition() {
  const { activeProject } = useActiveProject();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = React.useState(DEFAULT_LEFT_FRACTION);
  const [collapsed, setCollapsed] = React.useState(false);
  const isDragging = React.useRef(false);
  const [isResizing, setIsResizing] = React.useState(false);

  // Form state
  const [client, setClient] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [epsg, setEpsg] = React.useState("");
  const [crsName, setCrsName] = React.useState("");
  const [second, setSecond] = React.useState("");
  const [overlapGrid, setOverlapGrid] = React.useState("");
  const [overlapStrip, setOverlapStrip] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);

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
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              aria-label="Collapse panel"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-[var(--space-4)]">
            <Field label="Project Name" htmlFor="def-project-name" layout="horizontal">
              <Input
                id="def-project-name"
                value={activeProject ?? ""}
                readOnly
                className="bg-[var(--color-bg-elevated)]"
              />
            </Field>

            <Field label="Client" htmlFor="def-client" layout="horizontal">
              <Input
                id="def-client"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Client name"
              />
            </Field>

            <Field label="Contractor" htmlFor="def-contractor" layout="horizontal">
              <Input
                id="def-contractor"
                value="admin"
                readOnly
                className="bg-[var(--color-bg-elevated)]"
              />
            </Field>

            <Field label="Country" htmlFor="def-country" layout="horizontal">
              <SearchableSelect
                value={country}
                onChange={setCountry}
                options={COUNTRIES}
                placeholder="Select a country"
              />
            </Field>

            <Field label="Region" htmlFor="def-region" layout="horizontal">
              <Input
                id="def-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Region or province"
              />
            </Field>

            <Field label="EPSG Number" htmlFor="def-epsg" layout="horizontal">
              <Input
                id="def-epsg"
                type="number"
                value={epsg}
                onChange={(e) => setEpsg(e.target.value)}
                placeholder="e.g. 4326"
              />
            </Field>

            <Field label="CRS Name" htmlFor="def-crs" layout="horizontal">
              <Input
                id="def-crs"
                value={crsName}
                onChange={(e) => setCrsName(e.target.value)}
                placeholder="e.g. WGS 84"
              />
            </Field>

            <Field label="Second" htmlFor="def-second" layout="horizontal">
              <Input
                id="def-second"
                type="number"
                value={second}
                onChange={(e) => setSecond(e.target.value)}
              />
            </Field>

            <Field label="No Overlap Grid" htmlFor="def-overlap-grid" layout="horizontal">
              <Select
                id="def-overlap-grid"
                value={overlapGrid}
                onChange={(e) => setOverlapGrid(e.target.value)}
              >
                <option value="">Select…</option>
                <option value="Source">Source</option>
                <option value="Receiver">Receiver</option>
              </Select>
            </Field>

            <Field label="No Overlap Strip" htmlFor="def-overlap-strip" layout="horizontal">
              <Select
                id="def-overlap-strip"
                value={overlapStrip}
                onChange={(e) => setOverlapStrip(e.target.value)}
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

            <Field label="Notes" htmlFor="def-notes" hint={`${notes.length}/300`}>
              <Textarea
                id="def-notes"
                rows={6}
                maxLength={300}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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

      {/* Viewport panel */}
      <div className="min-w-0 flex-1 overflow-auto border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder />
        </div>
      </div>
    </div>
  );
}
