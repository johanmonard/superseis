"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function Section({
  title,
  defaultOpen = true,
  variant = "primary",
  action,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  variant?: "primary" | "secondary";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const isSecondary = variant === "secondary";

  return (
    <div
      className={cn(
        isSecondary
          ? "rounded-[var(--radius-sm)] border-l-2 border-[var(--color-border-subtle)]"
          : "border-b border-[var(--color-border-subtle)] pb-[var(--space-3)]",
        className,
      )}
    >
      <div className={cn(
        "flex items-center justify-between",
        isSecondary
          ? "px-[var(--space-3)] py-[var(--space-2)]"
          : "py-[var(--space-2)]",
      )}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-[var(--space-1)] transition-colors hover:text-[var(--color-text-primary)]",
            isSecondary
              ? "text-xs font-medium text-[var(--color-text-secondary)]"
              : "text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]",
          )}
        >
          <Icon
            icon={open ? appIcons.chevronDown : appIcons.chevronRight}
            size={isSecondary ? 10 : 12}
          />
          <span>{title}</span>
        </button>
        {action}
      </div>
      <div
        className={
          open
            ? "max-h-[2000px] overflow-visible opacity-100 transition-all duration-200 ease-out"
            : "max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-out"
        }
      >
        <div className={cn(
          "space-y-[var(--space-3)]",
          isSecondary ? "px-[var(--space-3)] pb-[var(--space-3)]" : "pt-[var(--space-2)]",
        )}>
          {children}
        </div>
      </div>
    </div>
  );
}
