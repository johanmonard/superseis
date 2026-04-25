import * as React from "react";

import { cn } from "../../lib/utils";

export type SidebarWidth = "collapsed" | "narrow" | "default" | "wide";

const widthClasses: Record<SidebarWidth, string> = {
  collapsed: "w-16",
  narrow: "w-56",
  default: "w-64",
  wide: "w-72",
};

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  width?: SidebarWidth;
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, width = "default", ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-sidebar-bg,var(--color-bg-canvas))] transition-[width] duration-200 ease-out",
        widthClasses[width],
        className
      )}
      {...props}
    />
  )
);

Sidebar.displayName = "Sidebar";

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-b border-[var(--color-sidebar-divider)] p-[var(--space-3)]",
      className
    )}
    {...props}
  />
));

SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("app-scrollbar flex-1 overflow-auto [scrollbar-gutter:auto] p-[var(--space-2)]", className)}
    {...props}
  />
));

SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-t border-[var(--color-sidebar-divider)] p-[var(--space-2)]",
      className
    )}
    {...props}
  />
));

SidebarFooter.displayName = "SidebarFooter";

export interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  collapsed?: boolean;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active = false, collapsed = false, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active || undefined}
      className={cn(
        // Minimalist selection: just brighter text + heavier weight on active.
        // No bars, borders, backgrounds, or shadows. Tree-style connectors
        // for active children are drawn at the parent's children container.
        "inline-flex h-[var(--control-height-md)] w-full items-center rounded-[var(--radius-sm)] text-sm transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)]",
        "disabled:pointer-events-none disabled:opacity-50",
        collapsed
          ? "justify-center px-0"
          : "justify-start gap-[var(--space-2)] px-[var(--space-4)]",
        active
          ? "font-semibold text-[var(--color-text-primary)]"
          : "font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
        className
      )}
      {...props}
    />
  )
);

SidebarItem.displayName = "SidebarItem";
