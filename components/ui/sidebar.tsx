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
        "flex h-full min-h-0 flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] transition-[width] duration-200 ease-out",
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
      "border-b border-[var(--color-border-subtle)] p-[var(--space-3)]",
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
      "border-t border-[var(--color-border-subtle)] p-[var(--space-2)]",
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
        "inline-flex h-[var(--control-height-md)] w-full items-center rounded-[var(--radius-sm)] border text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)]",
        "disabled:pointer-events-none disabled:opacity-50",
        collapsed
          ? "justify-center px-0"
          : "justify-start gap-[var(--space-2)] px-[var(--space-4)]",
        active
          ? "border-[color-mix(in_srgb,var(--color-accent)_24%,var(--color-border-strong))] bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-bg-elevated))] text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-shadow-alpha)] hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-bg-elevated))]"
          : "border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
        className
      )}
      {...props}
    />
  )
);

SidebarItem.displayName = "SidebarItem";
