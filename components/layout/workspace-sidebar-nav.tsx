"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

import { CreateActivityDialog } from "../features/activities/create-activity-dialog";
import { useActivityNavChildren } from "../features/activities/use-activity-nav-children";
import { CreateResourceDialog } from "../features/resources/create-resource-dialog";
import { useResourceNavChildren } from "../features/resources/use-resource-nav-children";
import { useDeleteActivity } from "../../services/query/activities";
import { useDeleteResource } from "../../services/query/resources";
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
  SidebarFooter,
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
import { SidebarProjectToolbar } from "./sidebar-project-toolbar";
import { SidebarBottomActions } from "./sidebar-bottom-actions";
import { SidebarSurfaceWave } from "./sidebar-surface-wave";

export interface WorkspaceSidebarNavProps {
  navigation: NavigationItem[];
  isCollapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
  brandInitials: string;
  brandName: string;
  brandTagline: string;
  showAuthStubBanner?: boolean;
  session?: { email: string; is_admin: boolean } | null;
}

export function WorkspaceSidebarNav({
  navigation,
  isCollapsed,
  onToggleCollapsed,
  brandName,
  showAuthStubBanner = false,
  session = null,
}: WorkspaceSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activityNavChildren = useActivityNavChildren();
  const [createActivityOpen, setCreateActivityOpen] = React.useState(false);
  const resourceNavChildren = useResourceNavChildren();
  const [createResourceOpen, setCreateResourceOpen] = React.useState(false);
  const deleteActivityMutation = useDeleteActivity();
  const deleteResourceMutation = useDeleteResource();

  const [expandedParentLabel, setExpandedParentLabel] = React.useState<string | null>(null);
  const [expandedSubParents, setExpandedSubParents] = React.useState<Set<string>>(new Set());
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
    const isChildActive = (child: NavigationChildItem): boolean => {
      if (child.href) {
        return child.href === "/"
          ? pathname === "/"
          : pathname === child.href || pathname.startsWith(`${child.href}/`);
      }
      return child.children?.some(isChildActive) ?? false;
    };

    const isItemActive = (item: NavigationItem) => {
      if (item.children?.some(isChildActive)) return true;
      if (item.href) {
        if (item.href === "/") return pathname === "/";
        return pathname === item.href || pathname.startsWith(`${item.href}/`);
      }
      return false;
    };
    const activeParent = navigation.find(isItemActive);

    if (activeParent) {
      setExpandedParentLabel(activeParent.label);

      // Auto-expand sub-parents with active children
      activeParent.children?.forEach((child) => {
        if (child.children?.some(isChildActive)) {
          setExpandedSubParents((prev) => new Set(prev).add(child.label));
        }
      });
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

  const toggleSubParent = React.useCallback((label: string) => {
    setExpandedSubParents((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const renderChildNavigationItems = React.useCallback(
    (
      childrenItems: NavigationChildItem[],
      options?: {
        onSelect?: () => void;
        className?: string;
      }
    ): React.ReactNode[] =>
      childrenItems.map((child) => {
        const wrapWithSeparator = (body: React.ReactNode) =>
          child.separatorAfter ? (
            <React.Fragment key={child.label}>
              {body}
              <div
                aria-hidden="true"
                className="my-[var(--space-1)] h-px bg-[var(--color-border-subtle)]"
                // Left-align with the children's icon column: child
                // SidebarItem has px-[var(--space-3)] padding, then the
                // icon. Right margin matches the inner padding of the
                // top-level SidebarItems (px-[var(--space-4)]) so the line
                // ends at the right edge of the "+ Add" button on the
                // Activities/Resources rows.
                // eslint-disable-next-line template/no-jsx-style-prop -- runtime token math
                style={{
                  marginLeft: "var(--space-3)",
                  marginRight: "var(--space-4)",
                }}
              />
            </React.Fragment>
          ) : (
            body
          );
        const isActivities = child.label === "Activities";
        const isResources = child.label === "Resources";
        const isDynamic = isActivities || isResources;
        const dynamicChildren = isActivities
          ? activityNavChildren
          : isResources
            ? resourceNavChildren
            : [];
        const effectiveChildren = isDynamic
          ? [...(child.children ?? []), ...dynamicChildren]
          : child.children;
        const hasSubChildren = isDynamic
          ? Boolean(child.children)
          : Boolean(child.children?.length);

        // Sub-parent with its own collapsible children
        if (hasSubChildren && effectiveChildren) {
          const hasActiveSubChild = effectiveChildren.some((sub) => isActiveRoute(sub.href));
          const isSubExpanded = expandedSubParents.has(child.label);

          return wrapWithSeparator(
            <div key={child.label} className="space-y-1">
              <SidebarItem
                active={hasActiveSubChild}
                aria-expanded={isSubExpanded}
                onClick={() => toggleSubParent(child.label)}
                className={cn("justify-between", options?.className)}
              >
                <span className="flex items-center gap-[var(--space-2)]">
                  {child.icon ? (
                    <Icon
                      icon={appIcons[child.icon]}
                      size={14}
                      className={
                        hasActiveSubChild
                          ? "text-[var(--color-accent)]"
                          : "text-[var(--color-text-muted)]"
                      }
                    />
                  ) : null}
                  <span>{child.label}</span>
                </span>
                <span className="flex flex-1 items-center">
                  <Icon
                    icon={isSubExpanded ? appIcons.chevronDown : appIcons.chevronRight}
                    size={12}
                    className="text-[var(--color-text-muted)]"
                  />
                  {isDynamic ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={isActivities ? "New activity" : "New resource"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSubParents((prev) => new Set(prev).add(child.label));
                        if (isActivities) setCreateActivityOpen(true);
                        if (isResources) setCreateResourceOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedSubParents((prev) => new Set(prev).add(child.label));
                          if (isActivities) setCreateActivityOpen(true);
                          if (isResources) setCreateResourceOpen(true);
                        }
                      }}
                      className="ml-auto flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-px text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                    >
                      <Icon icon={appIcons.plus} size={10} />
                      Add
                    </span>
                  ) : null}
                </span>
              </SidebarItem>
              <div
                className={
                  isSubExpanded
                    ? "max-h-96 overflow-hidden opacity-100 transition-all duration-150 ease-out"
                    : "max-h-0 overflow-hidden opacity-0 transition-all duration-150 ease-out"
                }
              >
                <div className="space-y-1 pl-4 pt-1">
                  {effectiveChildren.map((sub) => {
                    const subIsActive = isActiveRoute(sub.href);
                    const slug = isDynamic && sub.href ? sub.href.split("/").pop() : null;
                    return (
                      <SidebarItem
                        key={sub.href}
                        active={subIsActive}
                        aria-current={subIsActive ? "page" : undefined}
                        onClick={() => {
                          options?.onSelect?.();
                          suppressCollapsedTooltips();
                          if (sub.href) router.push(sub.href);
                        }}
                        className="group/sub h-7 px-[var(--space-3)]"
                      >
                        <span className="flex w-full items-center gap-[var(--space-2)]">
                          {sub.icon ? (
                            <Icon
                              icon={appIcons[sub.icon]}
                              size={12}
                              className={
                                subIsActive
                                  ? "text-[var(--color-accent)]"
                                  : "text-[var(--color-text-muted)]"
                              }
                            />
                          ) : null}
                          <span className="flex-1 truncate text-left">{sub.label}</span>
                          {slug ? (
                            <button
                              type="button"
                              aria-label={`Delete ${sub.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isActivities) deleteActivityMutation.mutate(slug);
                                if (isResources) deleteResourceMutation.mutate(slug);
                                if (subIsActive) router.push(child.href ?? "/");
                              }}
                              className="ml-auto flex-shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                            >
                              <Icon icon={appIcons.trash} size={12} />
                            </button>
                          ) : null}
                        </span>
                      </SidebarItem>
                    );
                  })}
                </div>
              </div>
            </div>,
          );
        }

        // Regular child item
        const childIsActive = isActiveRoute(child.href);

        return wrapWithSeparator(
          <SidebarItem
            key={child.href ?? child.label}
            active={childIsActive}
            aria-current={childIsActive ? "page" : undefined}
            onClick={() => {
              options?.onSelect?.();
              suppressCollapsedTooltips();
              if (child.href) router.push(child.href);
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
          </SidebarItem>,
        );
      }),
    [activityNavChildren, resourceNavChildren, deleteActivityMutation, deleteResourceMutation, expandedSubParents, isActiveRoute, router, setCreateActivityOpen, setCreateResourceOpen, suppressCollapsedTooltips, toggleSubParent]
  );

  const renderCollapsedNavigationItem = React.useCallback(
    (item: NavigationItem) => {
      const wrapWithSeparator = (body: React.ReactNode) =>
        item.separatorAfter ? (
          <React.Fragment key={item.label}>
            {body}
            <div
              aria-hidden="true"
              className="my-[var(--space-2)] h-px bg-[var(--color-border-subtle)]"
            />
          </React.Fragment>
        ) : (
          body
        );
      const isActivities = item.label === "Activities";
      const isResources = item.label === "Resources";
      const isDynamic = isActivities || isResources;
      const dynamicChildren = isActivities
        ? activityNavChildren
        : isResources
          ? resourceNavChildren
          : [];
      const effectiveChildren = isDynamic
        ? [...(item.children ?? []), ...dynamicChildren]
        : item.children;
      const hasChildren = isDynamic
        ? Boolean(effectiveChildren && effectiveChildren.length)
        : Boolean(item.children?.length);
      const hasActiveChild =
        hasChildren && effectiveChildren
          ? effectiveChildren.some((child) => isActiveRoute(child.href))
          : false;
      const isActive = isActiveRoute(item.href) || hasActiveChild;

      if (!hasChildren) {
        if (!item.href) {
          return null;
        }

        const itemHref = item.href;

        return wrapWithSeparator(
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
          </Tooltip>,
        );
      }

      const isOpen = openCollapsedMenuLabel === item.label;

      return wrapWithSeparator(
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
            <div className="flex items-center justify-between border-b border-[var(--color-sidebar-divider)] px-[var(--space-2)] pb-[var(--space-2)]">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                {item.label}
              </span>
              {isDynamic ? (
                <button
                  type="button"
                  aria-label={isActivities ? "New activity" : "New resource"}
                  onClick={() => {
                    setOpenCollapsedMenuLabel(null);
                    if (isActivities) setCreateActivityOpen(true);
                    if (isResources) setCreateResourceOpen(true);
                  }}
                  className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-px text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                >
                  <Icon icon={appIcons.plus} size={10} />
                  Add
                </button>
              ) : null}
            </div>
            <div className="space-y-1 pt-[var(--space-2)]">
              {renderChildNavigationItems(effectiveChildren ?? [], {
                onSelect: () => {
                  setOpenCollapsedMenuLabel(null);
                  suppressCollapsedTooltips();
                },
                className: "h-8",
              })}
            </div>
          </PopoverContent>
        </Popover>,
      );
    },
    [
      activityNavChildren,
      resourceNavChildren,
      collapsedTooltipsSuppressed,
      isActiveRoute,
      openCollapsedMenuLabel,
      openCollapsedTooltipLabel,
      renderChildNavigationItems,
      router,
      setCreateActivityOpen,
      setCreateResourceOpen,
      suppressCollapsedTooltips,
    ]
  );

  const renderExpandedNavigationItems = React.useCallback(
    (items: NavigationItem[]) =>
      items.map((item) => {
        const wrapWithSeparator = (body: React.ReactNode) =>
          item.separatorAfter ? (
            <React.Fragment key={item.label}>
              {body}
              <div
                aria-hidden="true"
                className="my-[var(--space-2)] h-px bg-[var(--color-border-subtle)]"
              />
            </React.Fragment>
          ) : (
            body
          );
        const isActivities = item.label === "Activities";
        const isResources = item.label === "Resources";
        const isDynamic = isActivities || isResources;
        const dynamicChildren = isActivities
          ? activityNavChildren
          : isResources
            ? resourceNavChildren
            : [];
        const effectiveChildren = isDynamic
          ? [...(item.children ?? []), ...dynamicChildren]
          : item.children;
        const hasChildren = isDynamic
          ? Boolean(item.children)
          : Boolean(item.children?.length);
        const hasActiveChild =
          hasChildren && effectiveChildren
            ? effectiveChildren.some((child) => isActiveRoute(child.href))
            : false;
        const isExpanded = hasChildren && expandedParentLabel === item.label;
        const isActive = isActiveRoute(item.href) || hasActiveChild;

        if (hasChildren && effectiveChildren) {
          return wrapWithSeparator(
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
                <span className="flex flex-1 items-center gap-[var(--space-2)]">
                  <Icon
                    icon={appIcons[item.icon]}
                    className={isActive ? "text-[var(--color-accent)]" : undefined}
                  />
                  <span className="uppercase tracking-wide">{item.label}</span>
                  <Icon
                    icon={isExpanded ? appIcons.chevronDown : appIcons.chevronRight}
                    size={14}
                    className="text-[var(--color-text-muted)]"
                  />
                </span>
                {isDynamic ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={isActivities ? "New activity" : "New resource"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedParentLabel(item.label);
                      if (isActivities) setCreateActivityOpen(true);
                      if (isResources) setCreateResourceOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setExpandedParentLabel(item.label);
                        if (isActivities) setCreateActivityOpen(true);
                        if (isResources) setCreateResourceOpen(true);
                      }
                    }}
                    className="ml-auto flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-px text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                  >
                    <Icon icon={appIcons.plus} size={10} />
                    Add
                  </span>
                ) : null}
              </SidebarItem>
              <div
                className={
                  isExpanded
                    ? "max-h-[600px] overflow-hidden opacity-100 transition-all duration-150 ease-out"
                    : "max-h-0 overflow-hidden opacity-0 transition-all duration-150 ease-out"
                }
              >
                <div className="relative space-y-1 pl-6 pt-1">
                  {(() => {
                    // Tree-style connector. Geometry, density-aware:
                    //   - Vertical line X = parent icon center =
                    //     `var(--space-4) + 8px` (parent SidebarItem has
                    //     px-[var(--space-4)], icon is 16px → center at
                    //     var(--space-4) + 8).
                    //   - Row height is var(--control-height-md) (varies by
                    //     density: 30/34/38). Container has pt-1 (4px) top
                    //     padding and space-y-1 (4px) gap between rows.
                    //     Active child's icon center y =
                    //       4px + idx*(rowH + 4px) + rowH/2.
                    //     Computed in CSS calc so it follows density.
                    //   - Horizontal stub width reaches the child icon's
                    //     left edge: child SidebarItem px-[var(--space-3)]
                    //     starts at pl-6 (24px), so stub width =
                    //     24 + var(--space-3) - (var(--space-4) + 8). Across
                    //     all densities this evaluates to 12px (space-3 −
                    //     space-4 is consistently −4 in the token table).
                    const activeIdx = effectiveChildren.findIndex((c) =>
                      isActiveRoute(c.href),
                    );
                    if (activeIdx < 0) return null;
                    const yCenter = `calc(4px + ${activeIdx} * (var(--control-height-md) + 4px) + var(--control-height-md) / 2)`;
                    const lineX = "calc(var(--space-4) + 8px)";
                    const stubWidth =
                      "calc(24px + var(--space-3) - var(--space-4) - 8px)";
                    return (
                      <>
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute w-px bg-[var(--color-border-strong)]"
                          // eslint-disable-next-line template/no-jsx-style-prop -- runtime tree-connector geometry
                          style={{ left: lineX, top: 0, height: yCenter }}
                        />
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute h-px bg-[var(--color-border-strong)]"
                          // eslint-disable-next-line template/no-jsx-style-prop -- runtime tree-connector geometry
                          style={{ left: lineX, top: yCenter, width: stubWidth }}
                        />
                      </>
                    );
                  })()}
                  {isDynamic
                    ? effectiveChildren.map((sub) => {
                        const subIsActive = isActiveRoute(sub.href);
                        const slug = sub.href ? sub.href.split("/").pop() : null;
                        return (
                          <SidebarItem
                            key={sub.href ?? sub.label}
                            active={subIsActive}
                            aria-current={subIsActive ? "page" : undefined}
                            onClick={() => {
                              suppressCollapsedTooltips();
                              if (sub.href) router.push(sub.href);
                            }}
                            className="group/sub px-[var(--space-3)]"
                          >
                            <span className="flex w-full items-center gap-[var(--space-2)]">
                              {sub.icon ? (
                                <Icon
                                  icon={appIcons[sub.icon]}
                                  size={14}
                                  className={
                                    subIsActive
                                      ? "text-[var(--color-accent)]"
                                      : "text-[var(--color-text-muted)]"
                                  }
                                />
                              ) : null}
                              <span className="flex-1 truncate text-left">{sub.label}</span>
                              {slug ? (
                                <button
                                  type="button"
                                  aria-label={`Delete ${sub.label}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isActivities) deleteActivityMutation.mutate(slug);
                                    if (isResources) deleteResourceMutation.mutate(slug);
                                    if (subIsActive) router.push(item.href ?? "/");
                                  }}
                                  className="ml-auto flex-shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                                >
                                  <Icon icon={appIcons.trash} size={12} />
                                </button>
                              ) : null}
                            </span>
                          </SidebarItem>
                        );
                      })
                    : renderChildNavigationItems(effectiveChildren, {
                        className: "px-[var(--space-3)]",
                      })}
                </div>
              </div>
            </div>,
          );
        }

        if (!item.href) {
          return null;
        }

        const itemHref = item.href;

        return wrapWithSeparator(
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
            <span className="uppercase tracking-wide">{item.label}</span>
          </SidebarItem>,
        );
      }),
    [
      activityNavChildren,
      resourceNavChildren,
      deleteActivityMutation,
      deleteResourceMutation,
      expandedParentLabel,
      isActiveRoute,
      renderChildNavigationItems,
      router,
      setCreateActivityOpen,
      setCreateResourceOpen,
      suppressCollapsedTooltips,
    ]
  );

  return (
    <TooltipProvider delayDuration={150} disableHoverableContent>
      <>
        <SidebarHeader
          className={cn(
            "flex items-center transition-[padding] duration-200 ease-out",
            isCollapsed
              ? "px-[var(--space-2)] pt-[var(--space-4)] pb-[var(--space-2)]"
              : "px-[var(--space-3)] pt-[var(--space-5)] pb-[var(--space-3)]"
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
              <span
                className={cn("relative", isCollapsed ? "h-9 w-9" : "h-9 w-full")}
                // eslint-disable-next-line template/no-jsx-style-prop -- accent-tinted glow
                style={{
                  filter:
                    "drop-shadow(0 0 6px color-mix(in srgb, var(--color-accent) 55%, transparent)) drop-shadow(0 0 14px color-mix(in srgb, var(--color-accent) 30%, transparent))",
                }}
              >
                <Image
                  src="/seiseye_logo_black.png"
                  alt={brandName}
                  fill
                  className="object-contain [[data-theme-kind=dark]_&]:hidden"
                />
                <Image
                  src="/seiseye_logo_white.png"
                  alt={brandName}
                  fill
                  className="hidden object-contain [[data-theme-kind=dark]_&]:block"
                />
              </span>
            </span>
          </button>
        </SidebarHeader>
        <SidebarContent className="flex flex-col space-y-1">
          <SidebarProjectToolbar isCollapsed={isCollapsed} />
          {isCollapsed
            ? mainNavigation.map(renderCollapsedNavigationItem)
            : renderExpandedNavigationItems(mainNavigation)}
          <div className="mt-auto space-y-1">
            {isCollapsed
              ? systemNavigation.map(renderCollapsedNavigationItem)
              : renderExpandedNavigationItems(systemNavigation)}
            <SidebarSurfaceWave isCollapsed={isCollapsed} />
            <SidebarBottomActions session={session} isCollapsed={isCollapsed} />
          </div>
        </SidebarContent>
        {showAuthStubBanner ? (
          <SidebarFooter className="px-[var(--space-2)] py-[var(--space-2)]">
            <div className="rounded-[var(--radius-sm)] bg-[var(--color-status-warning-bg,#fef3c7)] px-[var(--space-2)] py-[var(--space-1)] text-center text-[10px] font-medium leading-tight text-[var(--color-status-warning-text,#92400e)]">
              {isCollapsed ? "DEV" : "Dev auth stub active"}
            </div>
          </SidebarFooter>
        ) : null}
        <CreateActivityDialog open={createActivityOpen} onOpenChange={setCreateActivityOpen} />
        <CreateResourceDialog open={createResourceOpen} onOpenChange={setCreateResourceOpen} />
      </>
    </TooltipProvider>
  );
}
