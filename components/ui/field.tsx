import * as React from "react";

import { cn } from "../../lib/utils";

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/*  Canonical wrapper for form controls: label + child input + optional hint. */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  /** Visible label text. */
  label: string;
  /** Connects the label to the input via `htmlFor` / `id`. */
  htmlFor?: string;
  /** Optional helper text below the control. */
  hint?: string;
  /** Validation error message. When set, replaces hint and applies error styling. */
  error?: string;
  /** Extra classes on the outermost container. */
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
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
