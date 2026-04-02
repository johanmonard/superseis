"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import type {
  NavigationChildItem,
  NavigationItem,
} from "../../config/navigation.config";
import { Icon, appIcons } from "../ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  SidebarContent,
  SidebarHeader,
  SidebarItem,
} from "../ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

export interface WorkspaceSidebarNavProps {
  navigation: NavigationItem[];
  isCollapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  brandInitials: string;
  brandName: string;
  brandTagline: string;
}

export function WorkspaceSidebarNav({
  navigation,
  isCollapsed,
  onToggleCollapsed,
  brandInitials,
  brandName,
  brandTagline,
}: WorkspaceSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [expandedParentLabel, setExpandedParentLabel] = React.useState<string | null>(null);
  const [openCollapsedMenuLabel, setOpenCollapsedMenuLabel] = React.useState<string | null>(
    null
  );
  const [openCollapsedTooltipLabel, setOpenCollapsedTooltipLabel] = React.useState<
    string | null
  >(null);
  const [collapsedTooltipsSuppressed, setCollapsedTooltipsSuppressed] =
    React.useState(false);
  const [collapsedTooltipSuppressionToken, setCollapsedTooltipSuppressionToken] =
    React.useState(0);

  const mainNavigation = React.useMemo(
    () => navigation.filter((item) => item.section === "main"),
    [navigation]
  );
  const systemNavigation = React.useMemo(
    () => navigation.filter((item) => item.section === "system"),
    [navigation]
  );

  const isActiveRoute = React.useCallback(
    (prefix?: string) =>
      !prefix
        ? false
        : prefix === "/"
          ? pathname === "/"
          : pathname === prefix || pathname.startsWith(`${prefix}/`),
    [pathname]
  );

  React.useEffect(() => {
    const activeParent = navigation.find((item) =>
      item.children?.some((child) =>
        child.href === "/"
          ? pathname === "/"
          : pathname === child.href || pathname.startsWith(`${child.href}/`)
      )
    );

    if (activeParent) {
      setExpandedParentLabel(activeParent.label);
    }
    setOpenCollapsedMenuLabel(null);
    setOpenCollapsedTooltipLabel(null);
  }, [pathname, navigation]);

  React.useEffect(() => {
    if (!isCollapsed) {
      setOpenCollapsedMenuLabel(null);
      setOpenCollapsedTooltipLabel(null);
      setCollapsedTooltipsSuppressed(false);
    }
  }, [isCollapsed]);

  React.useEffect(() => {
    if (collapsedTooltipSuppressionToken === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCollapsedTooltipsSuppressed(false);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [collapsedTooltipSuppressionToken]);

  const suppressCollapsedTooltips = React.useCallback(() => {
    setOpenCollapsedTooltipLabel(null);
    setCollapsedTooltipsSuppressed(true);
    setCollapsedTooltipSuppressionToken((currentToken) => currentToken + 1);
  }, []);

  const handleToggleCollapsed = React.useCallback(
    (collapsed: boolean) => {
      if (!collapsed) {
        setOpenCollapsedMenuLabel(null);
        setOpenCollapsedTooltipLabel(null);
        setCollapsedTooltipsSuppressed(false);
      }
      onToggleCollapsed(collapsed);
    },
    [onToggleCollapsed]
  );

  const renderChildNavigationItems = React.useCallback(
    (
      childrenItems: NavigationChildItem[],
      options?: {
        onSelect?: () => void;
        className?: string;
      }
    ) =>
      childrenItems.map((child) => {
        const childIsActive = isActiveRoute(child.href);

        return (
          <SidebarItem
            key={child.href}
            active={childIsActive}
            aria-current={childIsActive ? "page" : undefined}
            onClick={() => {
              options?.onSelect?.();
              suppressCollapsedTooltips();
              router.push(child.href);
            }}
            className={options?.className}
          >
            <span className="flex items-center gap-[var(--space-2)]">
              {child.icon ? (
                <Icon
                  icon={appIcons[child.icon]}
                  size={14}
                  className={
                    childIsActive
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)]"
                  }
                />
              ) : null}
              <span>{child.label}</span>
            </span>
          </SidebarItem>
        );
      }),
    [isActiveRoute, router, suppressCollapsedTooltips]
  );

  const renderCollapsedNavigationItem = React.useCallback(
    (item: NavigationItem) => {
      const hasChildren = Boolean(item.children?.length);
      const hasActiveChild =
        hasChildren && item.children
          ? item.children.some((child) => isActiveRoute(child.href))
          : false;
      const isActive = isActiveRoute(item.href) || hasActiveChild;

      if (!hasChildren || !item.children) {
        if (!item.href) {
          return null;
        }

        const itemHref = item.href;

        return (
          <Tooltip
            key={item.label}
            open={!collapsedTooltipsSuppressed && openCollapsedTooltipLabel === item.label}
            onOpenChange={(nextOpen) => {
              if (collapsedTooltipsSuppressed) {
                setOpenCollapsedTooltipLabel(null);
                return;
              }

              setOpenCollapsedTooltipLabel(nextOpen ? item.label : null);
            }}
          >
            <TooltipTrigger asChild>
              <SidebarItem
                collapsed
                active={isActive}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  suppressCollapsedTooltips();
                  router.push(itemHref);
                }}
              >
                <Icon
                  icon={appIcons[item.icon]}
                  className={isActive ? "text-[var(--color-accent)]" : undefined}
                />
              </SidebarItem>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      }

      const isOpen = openCollapsedMenuLabel === item.label;

      return (
        <Popover
          key={item.label}
          open={isOpen}
          onOpenChange={(nextOpen) => {
            setOpenCollapsedMenuLabel(nextOpen ? item.label : null);
            if (nextOpen) {
              setOpenCollapsedTooltipLabel(null);
            }
          }}
        >
          <Tooltip
            open={
              !collapsedTooltipsSuppressed &&
              !isOpen &&
              openCollapsedTooltipLabel === item.label
            }
            onOpenChange={(nextOpen) => {
              if (collapsedTooltipsSuppressed) {
                setOpenCollapsedTooltipLabel(null);
                return;
              }

              setOpenCollapsedTooltipLabel(nextOpen && !isOpen ? item.label : null);
            }}
          >
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <SidebarItem
                  collapsed
                  active={isActive || isOpen}
                  aria-label={item.label}
                  aria-expanded={isOpen}
                >
                  <Icon
                    icon={appIcons[item.icon]}
                    className={isActive || isOpen ? "text-[var(--color-accent)]" : undefined}
                  />
                </SidebarItem>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {item.label}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={12}
            className="w-64 p-[var(--space-2)]"
          >
            <div className="border-b border-[var(--color-border-subtle)] px-[var(--space-2)] pb-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
              {item.label}
            </div>
            <div className="space-y-1 pt-[var(--space-2)]">
              {renderChildNavigationItems(item.children, {
                onSelect: () => {
                  setOpenCollapsedMenuLabel(null);
                  suppressCollapsedTooltips();
                },
                className: "h-8",
              })}
            </div>
          </PopoverContent>
        </Popover>
      );
    },
    [
      collapsedTooltipsSuppressed,
      isActiveRoute,
      openCollapsedMenuLabel,
      openCollapsedTooltipLabel,
      renderChildNavigationItems,
      router,
      suppressCollapsedTooltips,
    ]
  );

  const renderExpandedNavigationItems = React.useCallback(
    (items: NavigationItem[]) =>
      items.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const hasActiveChild =
          hasChildren && item.children
            ? item.children.some((child) => isActiveRoute(child.href))
            : false;
        const isExpanded = hasChildren && expandedParentLabel === item.label;
        const isActive = isActiveRoute(item.href) || hasActiveChild;

        if (hasChildren && item.children) {
          return (
            <div key={item.label} className="space-y-1">
              <SidebarItem
                active={isActive}
                aria-expanded={isExpanded}
                onClick={() =>
                  setExpandedParentLabel((currentParent) =>
                    currentParent === item.label ? null : item.label
                  )
                }
                className="justify-between"
              >
                <span className="flex items-center gap-[var(--space-2)]">
                  <Icon
                    icon={appIcons[item.icon]}
                    className={isActive ? "text-[var(--color-accent)]" : undefined}
                  />
                  <span>{item.label}</span>
                </span>
                <Icon
                  icon={isExpanded ? appIcons.chevronDown : appIcons.chevronRight}
                  size={14}
                  className="text-[var(--color-text-muted)]"
                />
              </SidebarItem>
              <div
                className={
                  isExpanded
                    ? "max-h-96 overflow-hidden opacity-100 transition-all duration-150 ease-out"
                    : "max-h-0 overflow-hidden opacity-0 transition-all duration-150 ease-out"
                }
              >
                <div className="space-y-1 pl-6 pt-1">
                  {renderChildNavigationItems(item.children, {
                    className: "h-8 px-[var(--space-3)]",
                  })}
                </div>
              </div>
            </div>
          );
        }

        if (!item.href) {
          return null;
        }

        const itemHref = item.href;

        return (
          <SidebarItem
            key={itemHref}
            active={isActiveRoute(itemHref)}
            aria-current={isActiveRoute(itemHref) ? "page" : undefined}
            onClick={() => router.push(itemHref)}
          >
            <Icon
              icon={appIcons[item.icon]}
              className={isActiveRoute(itemHref) ? "text-[var(--color-accent)]" : undefined}
            />
            <span>{item.label}</span>
          </SidebarItem>
        );
      }),
    [expandedParentLabel, isActiveRoute, renderChildNavigationItems, router]
  );

  return (
    <TooltipProvider delayDuration={150} disableHoverableContent>
      <>
        <SidebarHeader
          className={cn(
            "transition-[padding] duration-200 ease-out",
            isCollapsed ? "p-[var(--space-2)]" : "p-[var(--space-3)]"
          )}
        >
          <button
            type="button"
            aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => handleToggleCollapsed(!isCollapsed)}
            className="flex w-full items-center rounded-[var(--radius-md)] p-[var(--space-1)] transition-colors duration-200 ease-out hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-surface)]"
          >
            <span
              className={cn(
                "flex w-full items-center",
                isCollapsed
                  ? "justify-center"
                  : "justify-start gap-[var(--space-3)]"
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-accent-foreground)]">
                  {brandInitials}
              </span>
              {!isCollapsed ? (
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
                      {brandName}
                  </span>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                      {brandTagline}
                  </span>
                </span>
              ) : null}
            </span>
          </button>
        </SidebarHeader>
        <SidebarContent className="space-y-1">
          {isCollapsed
            ? mainNavigation.map(renderCollapsedNavigationItem)
            : renderExpandedNavigationItems(mainNavigation)}
          {isCollapsed
            ? systemNavigation.map(renderCollapsedNavigationItem)
            : renderExpandedNavigationItems(systemNavigation)}
        </SidebarContent>
      </>
    </TooltipProvider>
  );
}
