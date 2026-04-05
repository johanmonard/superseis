"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function Section({
  title,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  variant = "primary",
  action,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  variant?: "primary" | "secondary";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const isSecondary = variant === "secondary";

  return (
    <div
      className={cn(
        isSecondary
          ? "rounded-[var(--radius-sm)] border-l-2 border-[var(--color-border-subtle)]"
          : cn(
              "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] pb-[var(--space-3)] transition-colors duration-200",
              open && "bg-[var(--color-bg-elevated)]",
            ),
        className,
      )}
    >
      <div className={cn(
        "flex items-center justify-between",
        isSecondary
          ? "px-[var(--space-3)] py-[var(--space-2)]"
          : "px-[var(--space-3)] py-[var(--space-2)]",
      )}>
        <button
          type="button"
          onClick={() => {
            const next = !open;
            if (isControlled) {
              onToggle?.(next);
            } else {
              setUncontrolledOpen(next);
            }
          }}
          className={cn(
            "flex items-center gap-[var(--space-1)] transition-colors hover:text-[var(--color-text-primary)]",
            isSecondary
              ? "text-xs font-medium text-[var(--color-text-secondary)]"
              : cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  open ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]",
                ),
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
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className={cn(
            "space-y-[var(--space-3)]",
            isSecondary ? "px-[var(--space-3)] pb-[var(--space-3)]" : "px-[var(--space-3)] pl-[calc(12px+var(--space-1)+var(--space-3))] pt-[var(--space-2)]",
          )}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
