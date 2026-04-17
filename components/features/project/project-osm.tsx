"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

const { download: Download, loader: Loader, circleCheck: CircleCheck, alertTriangle: AlertTriangle } = appIcons;

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { downloadOsmStream, clipOsmStream } from "@/services/api/project-osm";

/* ------------------------------------------------------------------
   Persisted state (saved to config.json via osm_ui)
   ------------------------------------------------------------------ */

interface OsmData {
  surveyOption: string;
  extentName: string;
  skipIfExists: boolean;
  selectedLayers: string[];
  availableLayers: string[];
}

const DEFAULT_OSM: OsmData = {
  surveyOption: "",
  extentName: "",
  skipIfExists: true,
  selectedLayers: [],
  availableLayers: [],
};

/* ------------------------------------------------------------------
   Minimal survey types (read-only from survey section)
   ------------------------------------------------------------------ */

interface SurveyExtentInfo {
  id: string;
  name: string;
}

interface SurveyGroupInfo {
  id: string;
  name: string;
  extents: SurveyExtentInfo[];
}

interface SurveySectionData {
  groups: SurveyGroupInfo[];
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

type StepStatus = "idle" | "running" | "done" | "error";

export function ProjectOsm() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data, update } = useSectionData<OsmData>(projectId, "osm", DEFAULT_OSM);

  // Read survey section to populate dropdowns (read-only, no defaults to avoid seeding phantom groups)
  const { data: surveyData } = useSectionData<SurveySectionData>(
    projectId, "survey", { groups: [] },
  );
  const groups = surveyData.groups;
  const selectedGroup = groups.find((g) => g.name === data.surveyOption);
  const extents = selectedGroup?.extents ?? [];

  // Local workflow state
  const [downloadStatus, setDownloadStatus] = React.useState<StepStatus>("idle");
  const [clipStatus, setClipStatus] = React.useState<StepStatus>("idle");
  const [downloadProgress, setDownloadProgress] = React.useState({ progress: 0, total: 0 });
  const [clipProgress, setClipProgress] = React.useState({ progress: 0, total: 0 });
  const [downloadMessage, setDownloadMessage] = React.useState("");
  const [clipMessage, setClipMessage] = React.useState("");

  const canDownload = Boolean(data.surveyOption && data.extentName);
  const canClip = data.availableLayers.length > 0 && data.selectedLayers.length > 0;

  /* ---- Download ---- */

  const handleDownload = React.useCallback(async () => {
    if (!projectId || !canDownload) return;
    setDownloadStatus("running");
    setDownloadProgress({ progress: 0, total: 0 });
    setDownloadMessage("");
    try {
      const final = await downloadOsmStream(
        projectId,
        {
          polygonFile: "osm_clipping_boundaries.gpkg",
          skipIfExists: data.skipIfExists,
        },
        (evt) => {
          setDownloadProgress({ progress: evt.progress, total: evt.total });
        },
      );
      setDownloadStatus(final.ok ? "done" : "error");
      setDownloadMessage(final.message);
      if (final.ok && final.layers) {
        update({ ...data, availableLayers: final.layers });
      }
    } catch (err) {
      setDownloadStatus("error");
      setDownloadMessage(err instanceof Error ? err.message : "Download failed");
    }
  }, [projectId, canDownload, data, update]);

  /* ---- Clip ---- */

  const handleClip = React.useCallback(async () => {
    if (!projectId || !canClip) return;
    setClipStatus("running");
    setClipProgress({ progress: 0, total: 0 });
    setClipMessage("");
    try {
      const final = await clipOsmStream(
        projectId,
        {
          polygonFile: "osm_clipping_boundaries.gpkg",
          layers: data.selectedLayers,
        },
        (evt) => {
          setClipProgress({ progress: evt.progress, total: evt.total });
          setClipMessage(evt.message);
        },
      );
      setClipStatus(final.ok ? "done" : "error");
      setClipMessage(final.message);
    } catch (err) {
      setClipStatus("error");
      setClipMessage(err instanceof Error ? err.message : "Clip failed");
    }
  }, [projectId, canClip, data]);

  /* ---- Layer selection ---- */

  const toggleLayer = React.useCallback(
    (layer: string) => {
      const selected = data.selectedLayers.includes(layer)
        ? data.selectedLayers.filter((l) => l !== layer)
        : [...data.selectedLayers, layer];
      update({ ...data, selectedLayers: selected });
    },
    [data, update],
  );

  const toggleAll = React.useCallback(() => {
    const allSelected = data.selectedLayers.length === data.availableLayers.length;
    update({
      ...data,
      selectedLayers: allSelected ? [] : [...data.availableLayers],
    });
  }, [data, update]);

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {/* Survey option selector */}
      <Field label="Survey Option" layout="horizontal">
        <Select
          value={data.surveyOption}
          onChange={(e) => {
            update({ ...data, surveyOption: e.target.value, extentName: "" });
          }}
        >
          <option value="">Select...</option>
          {groups.map((g) => (
            <option key={g.id} value={g.name}>{g.name}</option>
          ))}
        </Select>
      </Field>

      {/* Extent selector */}
      <Field label="Extent" layout="horizontal">
        <Select
          value={data.extentName}
          onChange={(e) => update({ ...data, extentName: e.target.value })}
          disabled={!data.surveyOption}
        >
          <option value="">Select...</option>
          {extents.map((e) => (
            <option key={e.id} value={e.name}>{e.name}</option>
          ))}
        </Select>
      </Field>

      {/* Skip if exists */}
      <Field label="Skip if Exists" layout="horizontal">
        <div className="flex items-center pt-[var(--space-1)]">
          <Checkbox
            checked={data.skipIfExists}
            onCheckedChange={(v) => update({ ...data, skipIfExists: v === true })}
          />
        </div>
      </Field>

      <div className="h-px bg-[var(--color-border-subtle)]" />

      {/* Download button + progress */}
      <div className="space-y-[var(--space-1)]">
        <div className="flex items-center gap-[var(--space-3)]">
          <Button
            variant="primary"
            size="sm"
            disabled={!canDownload || downloadStatus === "running"}
            onClick={handleDownload}
            className="shrink-0 gap-[var(--space-2)]"
          >
            {downloadStatus === "running" ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {downloadStatus === "running" ? "Downloading..." : "Download OSM"}
          </Button>
          {downloadStatus === "running" && downloadProgress.total > 0 && (
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                // eslint-disable-next-line template/no-jsx-style-prop
                style={{ width: `${Math.min(100, (downloadProgress.progress / downloadProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
        {downloadMessage && downloadStatus !== "running" && (
          <span className={cn(
            "text-[11px]",
            downloadStatus === "error"
              ? "text-[var(--color-status-danger)]"
              : "text-[var(--color-text-muted)]",
          )}>
            {downloadMessage}
          </span>
        )}
      </div>

      {/* Layer selection (shown after download) */}
      {data.availableLayers.length > 0 && (
        <>
          <div className="h-px bg-[var(--color-border-subtle)]" />
          <div className="space-y-[var(--space-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                Layers ({data.selectedLayers.length}/{data.availableLayers.length})
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {data.selectedLayers.length === data.availableLayers.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="space-y-[var(--space-1)]">
              {data.availableLayers.map((layer) => (
                <label
                  key={layer}
                  className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)] cursor-pointer"
                >
                  <Checkbox
                    checked={data.selectedLayers.includes(layer)}
                    onCheckedChange={() => toggleLayer(layer)}
                  />
                  {layer}
                </label>
              ))}
            </div>

            {/* Clip button + progress */}
            <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-3)]">
              <Button
                variant="primary"
                size="sm"
                disabled={!canClip || clipStatus === "running"}
                onClick={handleClip}
                className="shrink-0 gap-[var(--space-2)]"
              >
                {clipStatus === "running" ? (
                  <Loader size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {clipStatus === "running" ? "Clipping..." : "Clip Selected Layers"}
              </Button>
              {clipStatus === "running" && clipProgress.total > 0 && (
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
                    // eslint-disable-next-line template/no-jsx-style-prop
                    style={{ width: `${Math.min(100, (clipProgress.progress / clipProgress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Clip status message */}
      {clipMessage && clipStatus !== "idle" && (
        <div
          className={cn(
            "flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs",
            clipStatus === "done"
              ? "border border-[var(--color-status-success-border,#34d399)] bg-[var(--color-status-success-bg,#d1fae5)] text-[var(--color-status-success-text,#065f46)]"
              : clipStatus === "error"
                ? "border border-[var(--color-status-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-status-danger)]"
                : "text-[var(--color-text-muted)]"
          )}
        >
          {clipStatus === "done" && <CircleCheck size={13} />}
          {clipStatus === "error" && <AlertTriangle size={13} />}
          {clipMessage}
        </div>
      )}
    </div>
  );
}
