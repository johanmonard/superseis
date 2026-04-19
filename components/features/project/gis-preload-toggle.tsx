"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";
import { appIcons, Icon } from "@/components/ui/icon";
import {
  fetchFileGeoJsonWithSize,
  fetchProjectFileRaw,
  type FileCategory,
  type FileGeoJsonBundle,
} from "@/services/api/project-files";
import { fileGeoJsonKey, fileRawKey, useProjectFiles } from "@/services/query/project-files";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PRELOAD_CATEGORIES: FileCategory[] = ["gis_layers"];
const CONCURRENCY = 3;

interface GisPreloadState {
  enabled: boolean;
}

const DEFAULT_STATE: GisPreloadState = { enabled: false };

function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
  const v = n / Math.pow(1000, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      try {
        await tasks[idx]();
      } catch {
        /* swallow — per-file failures don't block the rest */
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
}

interface Props {
  projectId: number | null;
}

export function GisPreloadToggle({ projectId }: Props) {
  const qc = useQueryClient();
  const { data: state, update: updateState } = useSectionData<GisPreloadState>(
    projectId, "gis_preload", DEFAULT_STATE,
  );
  const { data: files } = useProjectFiles(projectId);

  const targetFiles = React.useMemo(() => {
    if (!files) return [] as { category: FileCategory; filename: string }[];
    const out: { category: FileCategory; filename: string }[] = [];
    for (const cat of PRELOAD_CATEGORIES) {
      for (const f of files[cat] ?? []) out.push({ category: cat, filename: f });
    }
    return out;
  }, [files]);

  const [prefetching, setPrefetching] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [failed, setFailed] = React.useState(0);
  const totalSteps = targetFiles.length * 2; // geojson + raw per file

  const runPrefetch = React.useCallback(async () => {
    if (!projectId || targetFiles.length === 0) return;
    setPrefetching(true);
    setProgress(0);
    setFailed(0);
    let done = 0;
    let errored = 0;
    const bump = (ok: boolean) => {
      if (!ok) errored += 1;
      done += 1;
      setProgress(done);
      setFailed(errored);
    };
    const tasks: (() => Promise<void>)[] = [];
    for (const ref of targetFiles) {
      tasks.push(async () => {
        try {
          await qc.ensureQueryData<FileGeoJsonBundle>({
            queryKey: fileGeoJsonKey(projectId, ref.category, ref.filename),
            queryFn: ({ signal }) =>
              fetchFileGeoJsonWithSize(projectId, ref.category, ref.filename, signal),
            staleTime: Infinity,
            gcTime: Infinity,
          });
          bump(true);
        } catch {
          bump(false);
        }
      });
      tasks.push(async () => {
        try {
          await qc.ensureQueryData<ArrayBuffer>({
            queryKey: fileRawKey(projectId, ref.category, ref.filename),
            queryFn: ({ signal }) =>
              fetchProjectFileRaw(projectId, ref.category, ref.filename, signal),
            staleTime: Infinity,
            gcTime: Infinity,
          });
          bump(true);
        } catch {
          bump(false);
        }
      });
    }
    await runWithConcurrency(tasks, CONCURRENCY);
    setPrefetching(false);
  }, [projectId, targetFiles, qc]);

  // Auto-run on project-page mount when toggle is persisted on.
  const runOnMountRef = React.useRef(false);
  React.useEffect(() => {
    if (runOnMountRef.current) return;
    if (!projectId || !state.enabled || targetFiles.length === 0) return;
    runOnMountRef.current = true;
    void runPrefetch();
  }, [projectId, state.enabled, targetFiles, runPrefetch]);

  // Aggregate currently-cached bytes across both caches for this project.
  const totalBytes = useLoadedByteTotal(projectId, targetFiles);

  if (!projectId || targetFiles.length === 0) return null;

  const handleToggle = () => {
    const nextEnabled = !state.enabled;
    updateState({ enabled: nextEnabled });
    if (nextEnabled) void runPrefetch();
  };

  const tooltip = prefetching
    ? `Preloading ${progress} / ${totalSteps}${failed > 0 ? ` (${failed} failed)` : ""}`
    : state.enabled
      ? `Layers preloaded (${formatBytes(totalBytes)} in memory)`
      : `Preload all layer files — keeps ${targetFiles.length} file${targetFiles.length === 1 ? "" : "s"} warm for instant rendering`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Toggle layer preload"
            aria-pressed={state.enabled}
            onClick={handleToggle}
            className={cn(
              "flex h-7 items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] text-xs transition-colors",
              state.enabled
                ? "bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <Icon icon={prefetching ? appIcons.loader : appIcons.hardDrive} size={14} className={prefetching ? "animate-spin" : undefined} />
            {state.enabled || prefetching ? (
              <span className="font-mono tabular-nums">
                {prefetching ? `${progress}/${totalSteps}` : formatBytes(totalBytes)}
              </span>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Reads cached byte sizes for both GeoJSON bundles and raw buffers and sums
 * them. Subscribes to the query cache so the number stays live without
 * re-stringifying the FeatureCollections.
 */
function useLoadedByteTotal(
  projectId: number | null,
  refs: readonly { category: FileCategory; filename: string }[],
): number {
  const qc = useQueryClient();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated" || event.type === "added" || event.type === "removed") {
        const key = event.query.queryKey as unknown[];
        const root = key[0];
        // Defer the state update: react-query fires this subscription
        // synchronously during other components' renders (e.g. when a
        // consumer calls `useQueries` and new cache entries are added),
        // and calling setState on another component during render trips
        // React's cross-component update warning.
        if (root === "fileGeoJson" || root === "fileRaw") {
          queueMicrotask(() => setTick((t) => t + 1));
        }
      }
    });
    return () => unsub();
  }, [qc]);

  return React.useMemo(() => {
    if (!projectId) return 0;
    let sum = 0;
    for (const ref of refs) {
      const bundle = qc.getQueryData<FileGeoJsonBundle>(
        fileGeoJsonKey(projectId, ref.category, ref.filename),
      );
      if (bundle) sum += bundle.byteSize;
      const raw = qc.getQueryData<ArrayBuffer>(
        fileRawKey(projectId, ref.category, ref.filename),
      );
      if (raw) sum += raw.byteLength;
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refs, qc, tick]);
}
