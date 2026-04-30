"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function Section({
  title,
  tooltip,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  variant = "primary",
  action,
  children,
  className,
  collapsible = true,
}: {
  title: string;
  /** Optional descriptive text shown when hovering the section title. */
  tooltip?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  variant?: "primary" | "secondary";
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When false the section renders as a static subsection title with the
   *  content always visible — no chevron, no toggle. Defaults to true. */
  collapsible?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = collapsible ? (isControlled ? controlledOpen : uncontrolledOpen) : true;
  const isSecondary = variant === "secondary";

  const titleStyles = cn(
    "flex items-center gap-[var(--space-1)] transition-colors",
    isSecondary
      ? cn(
          "text-xs font-medium uppercase tracking-wider",
          open ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]",
        )
      : cn(
          "text-xs font-semibold uppercase tracking-wider",
          open ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-muted)]",
        ),
    collapsible && "hover:text-[var(--color-text-primary)]",
  );

  const titleButton = collapsible ? (
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
      className={titleStyles}
    >
      <Icon
        icon={open ? appIcons.chevronDown : appIcons.chevronRight}
        size={isSecondary ? 10 : 12}
      />
      <span>{title}</span>
    </button>
  ) : (
    <div className={titleStyles}>
      <span>{title}</span>
    </div>
  );

  // Non-collapsible mode renders as a flat subsection: no border, no
  // chevron, no internal horizontal padding — so the title and children
  // align to the same left edge as the surrounding Field labels.
  if (!collapsible) {
    return (
      <div className={cn("space-y-[var(--space-3)]", className)}>
        <div className="flex items-center justify-between py-[var(--space-1)]">
          {tooltip ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>{titleButton}</TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            titleButton
          )}
          {action}
        </div>
        <div className="space-y-[var(--space-3)]">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        isSecondary
          ? "rounded-[var(--radius-sm)] border-l-2 border-[var(--color-border-subtle)]"
          : cn(
              "rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] transition-colors duration-200",
              open && "pb-[var(--space-3)]",
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
        {tooltip ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>{titleButton}</TooltipTrigger>
              <TooltipContent side="top" align="start" className="max-w-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          titleButton
        )}
        {action}
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={open ? "overflow-visible" : "overflow-hidden"}>
          <div className={cn(
            "space-y-[var(--space-3)]",
            isSecondary ? "px-[var(--space-3)] pl-[calc(10px+var(--space-1)+var(--space-3))] pb-[var(--space-3)]" : "px-[var(--space-3)] pl-[calc(12px+var(--space-1)+var(--space-3))] pt-[var(--space-2)]",
          )}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
