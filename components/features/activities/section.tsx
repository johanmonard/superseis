"use client";

import * as React from "react";
import { Icon, appIcons } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function Section({
  title,
  defaultOpen = true,
  children,
  className,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn("border-b border-[var(--color-border-subtle)] pb-[var(--space-3)]", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-[var(--space-2)] text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        <span>{title}</span>
        <Icon
          icon={open ? appIcons.chevronDown : appIcons.chevronRight}
          size={12}
        />
      </button>
      <div
        className={
          open
            ? "max-h-[2000px] overflow-hidden opacity-100 transition-all duration-200 ease-out"
            : "max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-out"
        }
      >
        <div className="space-y-[var(--space-3)] pt-[var(--space-2)]">
          {children}
        </div>
      </div>
    </div>
  );
}
