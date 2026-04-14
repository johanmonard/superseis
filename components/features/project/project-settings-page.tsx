"use client";

import * as React from "react";
import { appIcons } from "@/components/ui/icon";

import { cn } from "@/lib/utils";

const { chevronLeft: ChevronLeft, chevronRight: ChevronRight } = appIcons;
import { ViewportPlaceholder } from "./viewport-placeholder";

const MIN_LEFT_FRACTION = 0.15;
const MAX_LEFT_FRACTION = 0.85;
const DEFAULT_LEFT_FRACTION = 1 / 3;
const COLLAPSED_WIDTH = 36; // px — just enough for the rotated title + chevron

export function ProjectSettingsPage({
  title,
  panelTitle = "Parameters",
  children,
  viewport,
}: {
  title: string;
  panelTitle?: string;
  children?: React.ReactNode;
  viewport?: React.ReactNode;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = React.useState(DEFAULT_LEFT_FRACTION);
  const [collapsed, setCollapsed] = React.useState(false);
  const isDragging = React.useRef(false);
  const [isResizing, setIsResizing] = React.useState(false);

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

  return (
    <div ref={containerRef} className="flex h-full flex-row">
      {/* Parameters panel */}
      <div
        className={cn(
          "border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]",
          !isResizing && "transition-all duration-300 ease-in-out",
          collapsed ? "min-w-0 overflow-hidden" : "min-w-0 overflow-y-auto"
        )}
        // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
        style={
          collapsed
            ? { flex: `0 0 ${COLLAPSED_WIDTH}px` }
            : { flex: `0 0 ${leftFraction * 100}%` }
        }
      >
        {collapsed ? (
          /* Collapsed: vertical title + expand chevron */
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex h-full w-full flex-col items-center justify-between py-[var(--space-3)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ChevronRight size={14} />
            <span
              className="text-xs font-semibold tracking-wide"
              // eslint-disable-next-line template/no-jsx-style-prop -- vertical text
              style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
            >
              {panelTitle}
            </span>
            <div />
          </button>
        ) : (
          /* Expanded: full panel */
          <div className="p-[var(--space-4)]">
            <div className="mb-[var(--space-4)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                {panelTitle}
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
            {children ?? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {title} parameters will be configured here.
              </p>
            )}
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
      <div className="relative min-w-0 flex-1 overflow-hidden border rounded-[var(--radius-md)] border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
        {viewport ?? (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}
