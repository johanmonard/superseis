"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData, AutosaveStatus } from "@/lib/use-autosave";

const { download: Download } = appIcons;

/* ------------------------------------------------------------------
   Dummy data — will come from terrain config
   ------------------------------------------------------------------ */

const DUMMY_TERRAIN_OPTIONS = ["Terrain Option 1"];
const DUMMY_EXTENTS: Record<string, string[]> = {
  "Terrain Option 1": ["Offsets", "Video", "GISDATA"],
};

const OSM_LAYERS = [
  "roads",
  "railways",
  "waterways",
  "water_a",
  "buildings",
  "landuse",
  "transport_a",
];

type DownloadStatus = "idle" | "downloading" | "done" | "error";

interface DownloadProgress {
  status: DownloadStatus;
  download: number;
  clip: number;
  tiling: number;
  message: string;
}

/* ------------------------------------------------------------------
   Progress bar
   ------------------------------------------------------------------ */

function ProgressStep({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
          {Math.round(value)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            active
              ? "bg-[var(--color-accent)]"
              : value >= 100
                ? "bg-[var(--color-status-success)]"
                : "bg-[var(--color-bg-elevated)]"
          )}
          // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

interface OsmData {
  terrainOption: string;
  extentName: string;
  skipIfExists: boolean;
}
const DEFAULT_OSM: OsmData = {
  terrainOption: "Terrain Option 1",
  extentName: "GISDATA",
  skipIfExists: true,
};

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function ProjectOsm() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update, status } = useSectionData<OsmData>(projectId, "osm", DEFAULT_OSM);

  const [progress, setProgress] = React.useState<DownloadProgress>({
    status: "idle",
    download: 0,
    clip: 0,
    tiling: 0,
    message: "",
  });

  const extents = data.terrainOption ? DUMMY_EXTENTS[data.terrainOption] ?? [] : [];
  const canDownload = Boolean(data.terrainOption && data.extentName);

  // Simulate a download
  const handleDownload = React.useCallback(() => {
    if (!canDownload) return;

    setProgress({ status: "downloading", download: 0, clip: 0, tiling: 0, message: "Downloading OSM data…" });

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step <= 20) {
        setProgress((p) => ({ ...p, download: step * 5, message: "Downloading OSM data…" }));
      } else if (step <= 35) {
        setProgress((p) => ({ ...p, download: 100, clip: (step - 20) * (100 / 15), message: "Clipping to extent…" }));
      } else if (step <= 45) {
        setProgress((p) => ({ ...p, clip: 100, tiling: (step - 35) * 10, message: "Generating tiles…" }));
      } else {
        clearInterval(interval);
        setProgress({ status: "done", download: 100, clip: 100, tiling: 100, message: "OSM data ready." });
      }
    }, 80);
  }, [canDownload]);

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Header with autosave status */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">OSM</h2>
        <AutosaveStatus status={status} />
      </div>

      <Field label="Terrain Option" layout="horizontal">
        <Select
          value={data.terrainOption}
          onChange={(e) => {
            update({ ...data, terrainOption: e.target.value, extentName: "" });
          }}
        >
          <option value="">Select…</option>
          {DUMMY_TERRAIN_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </Field>

      <Field label="Extent Name" layout="horizontal">
        <Select
          value={data.extentName}
          onChange={(e) => update({ ...data, extentName: e.target.value })}
          disabled={!data.terrainOption}
        >
          <option value="">Select…</option>
          {extents.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </Select>
      </Field>

      <Field label="Skip if Exists" layout="horizontal">
        <div className="flex items-center pt-[var(--space-1)]">
          <Checkbox
            checked={data.skipIfExists}
            onCheckedChange={(v) => update({ ...data, skipIfExists: v === true })}
          />
        </div>
      </Field>

      <Field label="Layers" layout="horizontal">
        <div className="flex flex-wrap gap-[var(--space-1)]">
          {OSM_LAYERS.map((layer) => (
            <span
              key={layer}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-secondary)]"
            >
              {layer}
            </span>
          ))}
        </div>
      </Field>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Download */}
      <Button
        variant="primary"
        size="sm"
        disabled={!canDownload || progress.status === "downloading"}
        onClick={handleDownload}
        className="self-start"
      >
        <Download size={14} className="mr-[var(--space-2)]" />
        {progress.status === "downloading" ? "Downloading…" : "Download OSM"}
      </Button>

      {/* Progress */}
      {progress.status !== "idle" && (
        <div className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]">
          <ProgressStep
            label="Download"
            value={progress.download}
            active={progress.status === "downloading" && progress.download < 100}
          />
          <ProgressStep
            label="Clip"
            value={progress.clip}
            active={progress.status === "downloading" && progress.download >= 100 && progress.clip < 100}
          />
          <ProgressStep
            label="Tiling"
            value={progress.tiling}
            active={progress.status === "downloading" && progress.clip >= 100 && progress.tiling < 100}
          />
          <p
            className={cn(
              "text-xs",
              progress.status === "done"
                ? "text-[var(--color-status-success)]"
                : progress.status === "error"
                  ? "text-[var(--color-status-danger)]"
                  : "text-[var(--color-text-muted)]"
            )}
          >
            {progress.message}
          </p>
        </div>
      )}
    </div>
  );
}
