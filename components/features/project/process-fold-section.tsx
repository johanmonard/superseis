"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FOLD_COLORMAPS, type FoldColormap, type FoldSource } from "@/services/api/project-fold";
import { formatApiError } from "@/services/api/client";
import { useFoldMeta, useRunFold } from "@/services/query/project-fold";

const { play: Play } = appIcons;

const DEFAULT_INPUTS = {
  offset_min: "0",
  offset_max: "5000",
  colormap: "seismic" as FoldColormap,
};

// CSS linear-gradient stops approximating each matplotlib colormap.
// Kept as a fixed mapping so the button preview shows the same ramp the
// backend renders onto the tile pyramid (close enough for a 32px-wide
// swatch; exact values come from the matplotlib sources).
const COLORMAP_GRADIENT: Record<FoldColormap, string> = {
  viridis: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)",
  plasma: "linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)",
  inferno: "linear-gradient(to right, #000004, #420a68, #932667, #dd513a, #fca50a, #fcffa4)",
  magma: "linear-gradient(to right, #000004, #3b0f70, #8c2981, #de4968, #fe9f6d, #fcfdbf)",
  turbo: "linear-gradient(to right, #30123b, #4669d7, #1fa187, #a5fc63, #f9b01a, #e22e1f, #7a0402)",
  seismic: "linear-gradient(to right, #00004c, #1d4ff9, #ffffff, #f92f2f, #800000)",
};

/**
 * Process fold section — bin grid + offset band + colormap, then one-shot
 * POST to the fold endpoint. The viewport picks up the new PNG via its
 * own query invalidation in services/query/project-fold.ts.
 *
 * ``source`` picks which pipeline stage to build the fold from:
 *
 * * ``"grid"`` — theoretical stations, mounted on the grid page.
 * * ``"offsets"`` — post-offset stations, mounted on the offsets page.
 */
export function ProcessFoldSection({
  projectId,
  flush,
  source = "grid",
  label = "Process fold",
}: {
  projectId: number | null;
  flush: () => Promise<void>;
  source?: FoldSource;
  label?: string;
}) {
  const [offsetMin, setOffsetMin] = React.useState(DEFAULT_INPUTS.offset_min);
  const [offsetMax, setOffsetMax] = React.useState(DEFAULT_INPUTS.offset_max);
  const [colormap, setColormap] = React.useState<FoldColormap>(DEFAULT_INPUTS.colormap);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const runFoldMutation = useRunFold(projectId, source);
  const foldQuery = useFoldMeta(projectId, source);
  const hasExistingFold = !!foldQuery.data;

  const submit = React.useCallback(
    async (nextColormap: FoldColormap) => {
      if (!projectId || runFoldMutation.isPending) return;
      await flush();
      setErrorMsg(null);
      try {
        await runFoldMutation.mutateAsync({
          offset_min: Number(offsetMin),
          offset_max: Number(offsetMax),
          colormap: nextColormap,
        });
      } catch (err) {
        setErrorMsg(formatApiError(err));
      }
    },
    [projectId, runFoldMutation, offsetMin, offsetMax, flush],
  );

  const handleProcessFold = React.useCallback(
    () => submit(colormap),
    [submit, colormap],
  );

  // Swapping the colormap is a cheap re-tile on the backend when a fold
  // is already on screen, so auto-run it instead of forcing the user
  // back to the Process fold button. Skipped when nothing's been
  // computed yet (no cached TIF to re-tile) or a run is already in
  // flight — the user would have to click Process fold manually in
  // that case.
  const pickColormap = React.useCallback(
    (c: FoldColormap) => {
      setColormap(c);
      if (hasExistingFold && !runFoldMutation.isPending) {
        void submit(c);
      }
    },
    [submit, hasExistingFold, runFoldMutation.isPending],
  );

  const running = runFoldMutation.isPending;
  const idPrefix = source === "offsets" ? "offsets-fold" : "fold";

  return (
    <>
      <div className="h-px bg-[var(--color-border-subtle)]" />

      <div className="flex flex-col gap-[var(--space-2)]">
        <Field label="Offset min (m)" htmlFor={`${idPrefix}-offset-min`} layout="horizontal" labelWidth="7rem">
          <Input
            id={`${idPrefix}-offset-min`}
            type="number"
            step="50"
            min="0"
            value={offsetMin}
            onChange={(e) => setOffsetMin(e.target.value)}
          />
        </Field>
        <Field label="Offset max (m)" htmlFor={`${idPrefix}-offset-max`} layout="horizontal" labelWidth="7rem">
          <Input
            id={`${idPrefix}-offset-max`}
            type="number"
            step="50"
            min="0"
            value={offsetMax}
            onChange={(e) => setOffsetMax(e.target.value)}
          />
        </Field>
        <Field label="Colormap" layout="horizontal" labelWidth="7rem">
          <div
            role="radiogroup"
            aria-label="Colormap"
            // h-[var(--control-height-md)] + items-center so the short
            // pills (h-3) sit on the same baseline as the Field label,
            // which is offset by pt-[7px] for input alignment.
            className="flex h-[var(--control-height-md)] flex-wrap items-center gap-[var(--space-1)]"
          >
            {FOLD_COLORMAPS.map((c) => {
              const selected = c === colormap;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={c}
                  onClick={() => pickColormap(c)}
                  className={cn(
                    "group flex h-3 w-10 items-center justify-center overflow-hidden rounded-full",
                    "border transition-all",
                    selected
                      ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]"
                      : "border-[var(--color-border-subtle)] hover:border-[var(--color-border-strong)]",
                  )}
                  // eslint-disable-next-line template/no-jsx-style-prop -- runtime colormap gradient
                  style={{ background: COLORMAP_GRADIENT[c] }}
                >
                  <span className="sr-only">{c}</span>
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      {errorMsg ? (
        <p role="alert" className="text-xs text-[var(--color-status-danger)]">
          {errorMsg}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleProcessFold}
          disabled={!projectId || running}
        >
          {running ? (
            <Icon icon={appIcons.loader} size={12} className="mr-[var(--space-1)] animate-spin" />
          ) : (
            <Play size={12} className="mr-[var(--space-1)]" />
          )}
          {label}
        </Button>
      </div>
    </>
  );
}
