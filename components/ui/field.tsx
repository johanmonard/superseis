import * as React from "react";

import { cn } from "../../lib/utils";

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/*  Canonical wrapper for form controls: label + child input + optional hint. */
/* -------------------------------------------------------------------------- */

type FieldLayout = "vertical" | "horizontal";

interface FieldProps {
  /** Visible label text. */
  label: string;
  /** Connects the label to the input via `htmlFor` / `id`. */
  htmlFor?: string;
  /** Optional helper text below the control. */
  hint?: string;
  /** Validation error message. When set, replaces hint and applies error styling. */
  error?: string;
  /** Layout direction. Default "vertical". */
  layout?: FieldLayout;
  /** Label width for horizontal layout. Default "8rem". */
  labelWidth?: string;
  /** Extra classes on the outermost container. */
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  layout = "vertical",
  labelWidth = "6rem",
  className,
  children,
}: FieldProps) {
  if (layout === "horizontal") {
    return (
      <div className={cn("flex items-start gap-[var(--space-3)]", className)}>
        <label
          htmlFor={htmlFor}
          className="shrink-0 pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]"
          style={{ width: labelWidth }}
        >
          {label}
        </label>
        <div className="min-w-0 flex-1 space-y-1">
          {children}
          {error ? (
            <p role="alert" className="text-xs text-[var(--color-status-danger)]">{error}</p>
          ) : hint ? (
            <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-[var(--color-text-secondary)]"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[var(--color-status-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
