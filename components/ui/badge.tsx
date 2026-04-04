import * as React from "react";

import { cn } from "../../lib/utils";

type BadgeVariant =
  | "neutral"
  | "accent"
  | "outline"
  | "info"
  | "success"
  | "danger";

const variantClasses: Record<BadgeVariant, string> = {
  neutral:
    "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-transparent",
  accent:
    "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] border border-transparent",
  outline:
    "bg-transparent text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]",
  info:
    "border border-[color-mix(in_srgb,var(--color-status-info)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-status-info)_12%,var(--color-bg-surface))] text-[var(--color-status-info)]",
  success:
    "border border-[color-mix(in_srgb,var(--color-status-success)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-status-success)_12%,var(--color-bg-surface))] text-[var(--color-status-success)]",
  danger:
    "border border-[color-mix(in_srgb,var(--color-status-danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-status-danger)_12%,var(--color-bg-surface))] text-[var(--color-status-danger)]",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium leading-none",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
