"use client";

import * as React from "react";

import { appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  usePipelineReport,
  type PipelineReportState,
} from "@/lib/use-pipeline-report";
import type {
  ClosureProgress,
  ClosureStepProgress,
  ClosureStepStatus,
} from "@/services/api/project-pipeline";

const {
  loader: Loader,
  circleCheck: CircleCheck,
  alertTriangle: AlertTriangle,
  x: X,
  chevronUp: ChevronUp,
  chevronDown: ChevronDown,
} = appIcons;

// Keyboard toggle uses Ctrl+` (backtick), matching the IDE console pattern.
const TOGGLE_KEY = "`";

function headerStatus(state: PipelineReportState): {
  label: string;
  tone: "idle" | "running" | "success" | "error";
  progress: ClosureProgress | null;
} {
  if (state.kind === "idle") {
    return { label: "No pipeline activity", tone: "idle", progress: null };
  }
  const progress = state.progress;
  const target = state.target;
  if (state.kind === "running") {
    const total = progress.steps.length;
    const idx = progress.current_index;
    const current = progress.steps[idx];
    const frac = current ? Math.round((current.fraction ?? 0) * 100) : 0;
    const running = current?.step ?? target;
    return {
      label: `Running ${target} · step ${idx + 1}/${total} — ${running} (${frac}%)`,
      tone: "running",
      progress,
    };
  }
  // done
  if (progress.error) {
    return {
      label: `Failed: ${progress.error}`,
      tone: "error",
      progress,
    };
  }
  return {
    label: `Completed ${target} · ${progress.steps.length} step${progress.steps.length === 1 ? "" : "s"}`,
    tone: "success",
    progress,
  };
}

function toneClass(tone: "idle" | "running" | "success" | "error"): string {
  switch (tone) {
    case "running":
      return "text-[var(--color-text-primary)]";
    case "success":
      return "text-[var(--color-status-success)]";
    case "error":
      return "text-[var(--color-status-danger)]";
    default:
      return "text-[var(--color-text-muted)]";
  }
}

function StatusDot({ status }: { status: ClosureStepStatus }) {
  switch (status) {
    case "running":
      return <Loader size={12} className="animate-spin text-[var(--color-accent)]" />;
    case "completed":
      return <CircleCheck size={12} className="text-[var(--color-status-success)]" />;
    case "failed":
      return <AlertTriangle size={12} className="text-[var(--color-status-danger)]" />;
    case "skipped":
      return (
        <span className="inline-block h-3 w-3 rounded-full border border-[var(--color-border-strong)]" />
      );
    default: // pending
      return (
        <span className="inline-block h-3 w-3 rounded-full bg-[var(--color-bg-elevated)]" />
      );
  }
}

function StepCard({ step }: { step: ClosureStepProgress }) {
  const hasLog = step.messages.length > 0;
  return (
    <div className="flex gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-2)]">
      {/* Title column — status, step name, percentage stacked on the left. */}
      <div className="flex w-40 shrink-0 flex-col justify-center gap-[var(--space-1)]">
        <div className="flex items-center gap-[var(--space-2)]">
          <StatusDot status={step.status} />
          <span className="flex-1 truncate text-xs font-semibold text-[var(--color-text-primary)]">
            {step.step}
          </span>
          <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
            {Math.round(step.fraction * 100)}%
          </span>
        </div>
        {step.error && (
          <p className="text-[11px] text-[var(--color-status-danger)]">
            {step.error}
          </p>
        )}
      </div>

      {/* Terminal column — scrolling log messages fill the rest of the row. */}
      {hasLog ? (
        <pre className="max-h-28 flex-1 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)] p-[var(--space-2)] text-[10px] font-mono text-[var(--color-text-secondary)]">
          {step.messages.slice(-30).join("\n")}
        </pre>
      ) : (
        <div className="flex-1 rounded-[var(--radius-sm)] bg-[var(--color-bg-canvas)]/40" />
      )}
    </div>
  );
}

export function PipelineReportDrawer() {
  const { state, expanded, setExpanded, dismiss } = usePipelineReport();
  const header = headerStatus(state);

  const hidden = state.kind === "idle";

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key === TOGGLE_KEY) {
        e.preventDefault();
        setExpanded(!expanded);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hidden, expanded, setExpanded]);

  if (hidden) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[0_-4px_16px_var(--color-shadow-alpha)]">
      {/* Status strip — always visible when the drawer is mounted */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-xs"
        title={expanded ? "Collapse pipeline panel" : "Expand pipeline panel"}
      >
        {state.kind === "running" ? (
          <Loader size={12} className="animate-spin text-[var(--color-accent)]" />
        ) : header.tone === "error" ? (
          <AlertTriangle size={12} className="text-[var(--color-status-danger)]" />
        ) : header.tone === "success" ? (
          <CircleCheck size={12} className="text-[var(--color-status-success)]" />
        ) : (
          <span className="inline-block h-3 w-3 rounded-full bg-[var(--color-bg-elevated)]" />
        )}
        <span className={cn("truncate text-left", toneClass(header.tone))}>
          {header.label}
        </span>
        <span className="ml-auto flex items-center gap-[var(--space-1)] text-[var(--color-text-muted)]">
          {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </span>
      </button>

      {expanded && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-[var(--space-4)]">
          <div className="mb-[var(--space-3)] flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Pipeline — {state.target}
            </h3>
            <button
              type="button"
              onClick={dismiss}
              className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              title="Dismiss"
            >
              <X size={10} /> Dismiss
            </button>
          </div>
          <div className="flex flex-col gap-[var(--space-2)]">
            {header.progress && header.progress.steps.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Nothing to run — the target step is up to date.
              </p>
            )}
            {header.progress?.steps.map((s) => <StepCard key={s.step} step={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}
