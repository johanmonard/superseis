"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { appIcons, Icon } from "@/components/ui/icon";
import { useActiveProject } from "@/lib/use-active-project";
import {
  fetchProjectRaster,
  listProjectRasters,
  type RasterItem,
  type RasterKind,
  type RasterPayload,
} from "@/services/api/project-rasters";

// Color palette for discrete zone codes. Zero = transparent (no data).
// Keep this palette stable across mappers/layers so the same zone code
// shows the same colour everywhere.
const ZONE_PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
  "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
  "#bcbd22", "#17becf", "#aec7e8", "#ffbb78",
  "#98df8a", "#ff9896", "#c5b0d5", "#c49c94",
  "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
];

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Build a deterministic value→[r,g,b] map for every unique non-zero value.
function buildColorMap(uniq: number[]): Map<number, [number, number, number]> {
  const out = new Map<number, [number, number, number]>();
  const nonZero = uniq.filter((v) => v !== 0);
  nonZero.sort((a, b) => a - b);
  nonZero.forEach((v, i) => {
    out.set(v, hexToRgb(ZONE_PALETTE[i % ZONE_PALETTE.length]));
  });
  return out;
}

function uniqueValues(data: Int16Array): number[] {
  const s = new Set<number>();
  for (let i = 0; i < data.length; i++) s.add(data[i]);
  return [...s].sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Canvas raster viewer                                               */
/* ------------------------------------------------------------------ */

// Raster rendering uses devicePixelRatio=1; CSS scale handles zoom so we
// can easily go past 1:1 to see individual cells with crisp edges
// (image-rendering: pixelated).

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;

interface RasterViewerProps {
  payload: RasterPayload;
  colorMap: Map<number, [number, number, number]>;
}

function RasterViewer({ payload, colorMap }: RasterViewerProps) {
  const [height, width] = payload.shape;
  const hostRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const [hover, setHover] = React.useState<{ col: number; row: number; value: number } | null>(null);
  const fittedRef = React.useRef<string>("");

  // Paint raster once per payload/colorMap change.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(width, height);
    // Paint with Y flipped so data row 0 lands at the bottom of the
    // viewport — matches the geographic "north-up" convention used by
    // the Layers / Maps pages.
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const v = payload.data[r * width + c];
        const dst = ((height - 1 - r) * width + c) * 4;
        if (v === 0) {
          img.data[dst + 3] = 0; // transparent — no zone
          continue;
        }
        const rgb = colorMap.get(v);
        if (rgb) {
          img.data[dst + 0] = rgb[0];
          img.data[dst + 1] = rgb[1];
          img.data[dst + 2] = rgb[2];
          img.data[dst + 3] = 255;
        } else {
          // Fallback grey for out-of-palette values.
          img.data[dst + 0] = 180;
          img.data[dst + 1] = 180;
          img.data[dst + 2] = 180;
          img.data[dst + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [payload, width, height, colorMap]);

  // Fit-to-container once per new payload.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const key = `${width}x${height}`;
    if (fittedRef.current === key) return;
    const { clientWidth, clientHeight } = host;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    const fit = Math.min(clientWidth / width, clientHeight / height) * 0.95;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
    setZoom(z);
    setTx((clientWidth - width * z) / 2);
    setTy((clientHeight - height * z) / 2);
    fittedRef.current = key;
  }, [width, height]);

  const handleWheel = React.useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // Keep the point under the cursor fixed across the zoom change.
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      const ratio = nextZoom / zoom;
      setTx(px - (px - tx) * ratio);
      setTy(py - (py - ty) * ratio);
      setZoom(nextZoom);
    },
    [zoom, tx, ty],
  );

  const dragRef = React.useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = React.useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, tx, ty };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (host) {
      const rect = host.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cx = Math.floor((px - tx) / zoom);
      const cy = Math.floor((py - ty) / zoom);
      if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
        // Flip back to data-space to look up the value shown at this
        // visual pixel (canvas was painted with Y inverted).
        const dataRow = height - 1 - cy;
        setHover({ col: cx, row: cy, value: payload.data[dataRow * width + cx] });
      } else {
        setHover(null);
      }
    }
    if (dragRef.current) {
      setTx(dragRef.current.tx + (e.clientX - dragRef.current.startX));
      setTy(dragRef.current.ty + (e.clientY - dragRef.current.startY));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={hostRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHover(null)}
      className="relative h-full w-full overflow-hidden bg-[var(--color-bg-canvas)]"
    >
      <canvas
        ref={canvasRef}
        // eslint-disable-next-line template/no-jsx-style-prop -- runtime zoom/pan transform
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: "top left",
          imageRendering: "pixelated",
          willChange: "transform",
          cursor: isDragging ? "grabbing" : "grab",
        }}
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]/85 px-2 py-1 text-[10px] font-mono text-[var(--color-text-secondary)] backdrop-blur">
        <div>
          {width} × {height} px · zoom ×{zoom < 1 ? zoom.toFixed(2) : zoom.toFixed(1)}
        </div>
        {hover ? (
          <div>
            col {hover.col}, row {hover.row} → value {hover.value}
          </div>
        ) : (
          <div className="opacity-70">hover a pixel · wheel = zoom · drag = pan</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

type SelectKey = `${RasterKind}:${string}`;

function keyOf(item: RasterItem): SelectKey {
  return `${item.kind}:${item.key}`;
}

export function DemoRasterPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const [items, setItems] = React.useState<{
    layers: RasterItem[];
    mappers: RasterItem[];
  }>({ layers: [], mappers: [] });
  const [listState, setListState] = React.useState<"idle" | "loading" | "error">("idle");
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<SelectKey | "">("");

  const [payload, setPayload] = React.useState<RasterPayload | null>(null);
  const [loadState, setLoadState] = React.useState<"idle" | "loading" | "error">("idle");
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const allItems = React.useMemo(() => [...items.layers, ...items.mappers], [items]);
  const selectedItem = React.useMemo(
    () => allItems.find((it) => keyOf(it) === selected) ?? null,
    [allItems, selected],
  );

  // Fetch the list of available rasters for the active project.
  React.useEffect(() => {
    if (!projectId) {
      setItems({ layers: [], mappers: [] });
      setListState("idle");
      return;
    }
    const ctrl = new AbortController();
    setListState("loading");
    setListError(null);
    listProjectRasters(projectId, ctrl.signal)
      .then((res) => {
        setItems({ layers: res.layers, mappers: res.mappers });
        setListState("idle");
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setListError(err instanceof Error ? err.message : "Failed to load raster list");
        setListState("error");
      });
    return () => ctrl.abort();
  }, [projectId]);

  // Fetch the selected raster.
  React.useEffect(() => {
    if (!projectId || !selectedItem) {
      setPayload(null);
      setLoadState("idle");
      return;
    }
    const ctrl = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    fetchProjectRaster(projectId, selectedItem.kind, selectedItem.key, ctrl.signal)
      .then((p) => {
        setPayload(p);
        setLoadState("idle");
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load raster");
        setLoadState("error");
      });
    return () => ctrl.abort();
  }, [projectId, selectedItem]);

  const uniq = React.useMemo(
    () => (payload ? uniqueValues(payload.data) : []),
    [payload],
  );
  const colorMap = React.useMemo(() => buildColorMap(uniq), [uniq]);

  const viewport = React.useMemo(() => {
    if (!projectId) {
      return (
        <div className="flex h-full items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder message="Pick an active project first" />
        </div>
      );
    }
    if (loadState === "loading") {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Icon icon={appIcons.loader} size={14} className="animate-spin" /> Loading raster…
        </div>
      );
    }
    if (loadState === "error") {
      return (
        <div className="flex h-full items-center justify-center p-[var(--space-4)] text-sm text-[var(--color-status-danger)]">
          {loadError}
        </div>
      );
    }
    if (!payload) {
      return (
        <div className="flex h-full items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder message="Select a raster on the left" />
        </div>
      );
    }
    return <RasterViewer payload={payload} colorMap={colorMap} />;
  }, [projectId, loadState, loadError, payload, colorMap]);

  return (
    <ProjectSettingsPage title="Raster" viewport={viewport}>
      <div className="flex flex-col gap-[var(--space-4)]">
        {listState === "loading" && (
          <p className="text-xs text-[var(--color-text-muted)]">Loading list…</p>
        )}
        {listState === "error" && listError && (
          <p className="text-xs text-[var(--color-status-danger)]">{listError}</p>
        )}

        <Field label="Raster" layout="horizontal">
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value as SelectKey)}
            disabled={allItems.length === 0}
          >
            <option value="">— select —</option>
            {items.layers.length > 0 && (
              <optgroup label="Layers">
                {items.layers.map((it) => (
                  <option key={keyOf(it)} value={keyOf(it)}>
                    {it.key} · {it.name}
                  </option>
                ))}
              </optgroup>
            )}
            {items.mappers.length > 0 && (
              <optgroup label="Mappers">
                {items.mappers.map((it) => (
                  <option key={keyOf(it)} value={keyOf(it)}>
                    {it.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        {allItems.length === 0 && listState === "idle" && (
          <p className="text-xs text-[var(--color-text-muted)]">
            No raster artifacts yet — run pipeline step 3 (layers) or 4 (mappers)
            from demo/workflow.
          </p>
        )}

        {selectedItem && payload && (
          <section className="flex flex-col gap-[var(--space-2)]">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Details
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-[var(--space-3)] gap-y-1 text-xs">
              <dt className="text-[var(--color-text-muted)]">Kind</dt>
              <dd>{selectedItem.kind}</dd>
              <dt className="text-[var(--color-text-muted)]">Referential</dt>
              <dd>{selectedItem.referential}</dd>
              <dt className="text-[var(--color-text-muted)]">Shape</dt>
              <dd>
                {payload.shape[0]} × {payload.shape[1]}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Range</dt>
              <dd>
                {payload.min} … {payload.max}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Unique values</dt>
              <dd>{uniq.length}</dd>
            </dl>
          </section>
        )}

        {payload && uniq.length > 0 && (
          <section className="flex flex-col gap-[var(--space-2)]">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Legend
            </h3>
            <ul className="flex flex-col gap-1 text-xs">
              {uniq.map((v) => {
                if (v === 0) {
                  return (
                    <li key="zero" className="flex items-center gap-2">
                      <span
                        // eslint-disable-next-line template/no-jsx-style-prop -- legend swatch
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          border: "1px dashed var(--color-border-strong)",
                          background:
                            "repeating-linear-gradient(45deg, transparent 0 3px, rgba(127,127,127,0.25) 3px 6px)",
                        }}
                      />
                      <span className="font-mono">0</span>
                      <span className="text-[var(--color-text-muted)]">(transparent · no zone)</span>
                    </li>
                  );
                }
                const rgb = colorMap.get(v);
                const css = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "#888";
                return (
                  <li key={v} className="flex items-center gap-2">
                    <span
                      // eslint-disable-next-line template/no-jsx-style-prop -- legend swatch
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: css,
                        border: "1px solid rgba(0,0,0,0.15)",
                      }}
                    />
                    <span className="font-mono">{v}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </ProjectSettingsPage>
  );
}
