"use client";

import * as React from "react";

import type { FoldColormap } from "@/services/api/project-fold";

// CSS linear-gradient stops approximating each matplotlib colormap.
// Shared with ProcessFoldSection so the legend matches the picker.
const COLORMAP_GRADIENT: Record<FoldColormap, string> = {
  viridis: "linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)",
  plasma: "linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)",
  inferno: "linear-gradient(to right, #000004, #420a68, #932667, #dd513a, #fca50a, #fcffa4)",
  magma: "linear-gradient(to right, #000004, #3b0f70, #8c2981, #de4968, #fe9f6d, #fcfdbf)",
  turbo: "linear-gradient(to right, #30123b, #4669d7, #1fa187, #a5fc63, #f9b01a, #e22e1f, #7a0402)",
  seismic: "linear-gradient(to right, #00004c, #1d4ff9, #ffffff, #f92f2f, #800000)",
};

/**
 * Horizontal colormap ramp with value labels at min, midpoint, and max.
 * Designed to drop into the ``legendExtra`` slot of GisViewerViewport
 * (both design-grid and offsets-grid viewports), so the user can read a
 * fold tile's colour against an actual count. Left/right padding
 * matches the legend rows above (``.gis-legend__row``: 10px).
 */
export function FoldColormapLegend({
  colormap,
  valueMin,
  valueMax,
}: {
  colormap: FoldColormap;
  valueMin: number;
  valueMax: number;
}) {
  const gradient = COLORMAP_GRADIENT[colormap];
  const mid = Math.round((valueMin + valueMax) / 2);
  return (
    <div className="flex flex-col gap-[2px] px-[10px] py-[2px]">
      <div
        className="h-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)]"
        // eslint-disable-next-line template/no-jsx-style-prop -- runtime colormap gradient
        style={{ background: gradient }}
        aria-hidden
      />
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-[var(--color-text-secondary)]">
        <span>{valueMin}</span>
        <span>{mid}</span>
        <span>{valueMax}</span>
      </div>
    </div>
  );
}
