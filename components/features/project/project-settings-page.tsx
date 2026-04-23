"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { appIcons } from "@/components/ui/icon";

import { cn } from "@/lib/utils";

const { chevronLeft: ChevronLeft, chevronRight: ChevronRight } = appIcons;
import { ViewportPlaceholder } from "./viewport-placeholder";

/** Slot exposed to `ProjectSettingsPage` children so they can inject
 *  actions into the panel's header row (left-aligned, next to the
 *  collapse chevron). Rendered via portal; returns null when the
 *  panel is collapsed and the slot DOM node doesn't exist. */
const PanelHeaderSlotContext = React.createContext<HTMLElement | null>(null);

export function PanelHeaderSlot({ children }: { children: React.ReactNode }) {
  const target = React.useContext(PanelHeaderSlotContext);
  if (!target) return null;
  return createPortal(children, target);
}

const MIN_LEFT_FRACTION = 0.15;
const MAX_LEFT_FRACTION = 0.85;
const DEFAULT_LEFT_FRACTION = 1 / 4;
const COLLAPSED_WIDTH = 36; // px — just enough for the rotated title + chevron

export function ProjectSettingsPage({
  title,
  panelTitle = "Parameters",
  children,
  viewport,
  middlePanel,
  defaultLeftFraction = DEFAULT_LEFT_FRACTION,
}: {
  title: string;
  panelTitle?: string;
  children?: React.ReactNode;
  viewport?: React.ReactNode;
  middlePanel?: React.ReactNode;
  defaultLeftFraction?: number;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = React.useState(defaultLeftFraction);
  const [collapsed, setCollapsed] = React.useState(false);
  const isDragging = React.useRef(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [headerSlot, setHeaderSlot] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [hasHeaderContent, setHasHeaderContent] = React.useState(false);

  // Track whether anything has been portaled into the header slot, so we
  // can render a separator below the chevron row when actions are present.
  React.useEffect(() => {
    if (!headerSlot) {
      setHasHeaderContent(false);
      return;
    }
    const update = () => setHasHeaderContent(headerSlot.childNodes.length > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(headerSlot, { childList: true });
    return () => observer.disconnect();
  }, [headerSlot]);

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
          "border rounded-[var(--radius-md)] border-[var(--color-panel-edge)] bg-[var(--color-bg-surface)]",
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
          /* Collapsed: just the expand chevron */
          <button
            type="button"
            aria-label="Expand panel"
            onClick={() => setCollapsed(false)}
            className="flex h-full w-full items-start justify-center py-[var(--space-3)] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          /* Expanded: full panel */
          <div className="p-[var(--space-4)]">
            <div className="mb-[var(--space-4)]">
              <div className="flex items-center justify-between gap-[var(--space-2)]">
                <div ref={setHeaderSlot} className="flex items-center gap-[var(--space-2)]" />
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                  aria-label="Collapse panel"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
              {hasHeaderContent && (
                <div className="mt-[var(--space-3)] h-px bg-[var(--color-border-subtle)]" />
              )}
            </div>
            <PanelHeaderSlotContext.Provider value={headerSlot}>
              {children ?? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {title} parameters will be configured here.
                </p>
              )}
            </PanelHeaderSlotContext.Provider>
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
            "z-10 flex w-[var(--panel-gap)] shrink-0 cursor-col-resize items-center justify-center overflow-hidden bg-[var(--color-layout-divider)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
          )}
        >
          <div className="w-[3px] h-12 rounded-full bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-border-strong)]" />
        </div>
      )}

      {/* Middle panel (optional) */}
      {middlePanel && (
        <>
          <div className="min-w-0 flex-shrink-0 overflow-y-auto border rounded-[var(--radius-md)] border-[var(--color-panel-edge)] bg-[var(--color-bg-surface)]"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
            style={{ width: "25%" }}
          >
            {middlePanel}
          </div>
          <div className="w-[var(--panel-gap)] shrink-0 bg-[var(--color-layout-divider)]" />
        </>
      )}

      {/* Viewport panel */}
      <div className="relative min-w-0 flex-1 overflow-hidden border rounded-[var(--radius-md)] border-[var(--color-panel-edge)] bg-[var(--color-bg-surface)]">
        {viewport ?? (
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder />
          </div>
        )}
      </div>
    </div>
  );
}
