"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

import { CreateActivityDialog } from "../features/activities/create-activity-dialog";
import { useActivityNavChildren } from "../features/activities/use-activity-nav-children";
import { CreateResourceDialog } from "../features/resources/create-resource-dialog";
import { useResourceNavChildren } from "../features/resources/use-resource-nav-children";
import {
  useDeleteActivity,
  useRenameActivity,
} from "../../services/query/activities";
import {
  useDeleteResource,
  useRenameResource,
} from "../../services/query/resources";
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

/**
 * Renders the children container for an expanded parent nav item plus the
 * tree-style connector that points at the currently-active child.
 *
 * The connector's vertical position is derived by measuring the active
 * SidebarItem's `offsetTop` rather than computing it from `(idx, rowH)`,
 * because separators (`separatorAfter`) inject a `<div my-1 h-px>` between
 * children whose contribution to the row stride depends on margin-collapse
 * specifics that vary across density tokens. Measuring is density-agnostic
 * and survives any future spacing changes.
 */
function NavSubmenuChildren({
  hasActive,
  children,
}: {
  hasActive: boolean;
  children: React.ReactNode;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [yCenter, setYCenter] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    if (!hasActive) {
      setYCenter((prev) => (prev === null ? prev : null));
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeEl) {
      setYCenter((prev) => (prev === null ? prev : null));
      return;
    }
    const next = activeEl.offsetTop + activeEl.offsetHeight / 2;
    setYCenter((prev) => (prev === next ? prev : next));
  });

  // Vertical line X = parent icon center: parent SidebarItem has
  // px-[var(--space-4)] padding, icon is 16px → center sits at
  // var(--space-4) + 8.
  const lineX = "calc(var(--space-4) + 8px)";
  // Horizontal stub reaches the child icon's left edge: child container
  // has pl-6 (24px), child SidebarItem has px-[var(--space-3)], so the
  // child icon's left = 24 + var(--space-3). Subtract the line's X.
  const stubWidth = "calc(24px + var(--space-3) - var(--space-4) - 8px)";

  return (
    <div ref={containerRef} className="relative space-y-1 pl-6 pt-1">
      {yCenter !== null ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-px bg-[var(--color-border-strong)]"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime tree-connector geometry
            style={{ left: lineX, top: 0, height: `${yCenter}px` }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute h-px bg-[var(--color-border-strong)]"
            // eslint-disable-next-line template/no-jsx-style-prop -- runtime tree-connector geometry
            style={{ left: lineX, top: `${yCenter}px`, width: stubWidth }}
          />
        </>
      ) : null}
      {children}
    </div>
  );
}

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
  const renameActivityMutation = useRenameActivity();
  const renameResourceMutation = useRenameResource();

  // Inline-rename state for dynamic Activities / Resources sidebar rows.
  // `editingSlug` is the slug of the item currently being renamed (across
  // both Activities and Resources — never both at once); `editValue` is
  // the live input text. `commitRename` / `cancelRename` close the editor.
  const [editingSlug, setEditingSlug] = React.useState<string | null>(null);
  const [editingKind, setEditingKind] = React.useState<"activity" | "resource" | null>(
    null,
  );
  const [editValue, setEditValue] = React.useState("");
  const editInputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (editingSlug && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSlug]);
  const startRename = React.useCallback(
    (kind: "activity" | "resource", slug: string, currentName: string) => {
      setEditingKind(kind);
      setEditingSlug(slug);
      setEditValue(currentName);
    },
    [],
  );
  const cancelRename = React.useCallback(() => {
    setEditingSlug(null);
    setEditingKind(null);
    setEditValue("");
  }, []);
  const commitRename = React.useCallback(() => {
    if (!editingSlug || !editingKind) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      if (editingKind === "activity") {
        renameActivityMutation.mutate(editingSlug, trimmed);
      } else {
        renameResourceMutation.mutate(editingSlug, trimmed);
      }
    }
    cancelRename();
  }, [editingSlug, editingKind, editValue, renameActivityMutation, renameResourceMutation, cancelRename]);

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

  // Hover-open behaviour for collapsed nav items with sub-menus.
  //
  // Design: per-item wrappers fire `onMouseEnter` (which sets the open
  // menu); the *parent* `SidebarContent` and `PopoverContent` are the only
  // things that schedule a close, on `onMouseLeave`. That way moving
  // between adjacent triggers fires only `mouseEnter(new)` — there is no
  // per-wrapper `mouseLeave(old)` racing to close the popover that
  // `mouseEnter(new)` just opened. The grace timer survives the trip
  // across the seam between sidebar and portaled popover content (entering
  // the popover cancels it before it fires).
  const collapsedHoverCloseTimerRef = React.useRef<number | null>(null);
  const cancelCollapsedHoverClose = React.useCallback(() => {
    if (collapsedHoverCloseTimerRef.current !== null) {
      window.clearTimeout(collapsedHoverCloseTimerRef.current);
      collapsedHoverCloseTimerRef.current = null;
    }
  }, []);
  const scheduleCollapsedHoverClose = React.useCallback(() => {
    cancelCollapsedHoverClose();
    collapsedHoverCloseTimerRef.current = window.setTimeout(() => {
      setOpenCollapsedMenuLabel(null);
      collapsedHoverCloseTimerRef.current = null;
    }, 150);
  }, [cancelCollapsedHoverClose]);
  const openCollapsedHoverMenu = React.useCallback(
    (label: string) => {
      cancelCollapsedHoverClose();
      setOpenCollapsedMenuLabel(label);
      setOpenCollapsedTooltipLabel(null);
    },
    [cancelCollapsedHoverClose]
  );
  React.useEffect(() => () => cancelCollapsedHoverClose(), [cancelCollapsedHoverClose]);

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
                            // role=button instead of <button> — SidebarItem
                            // is itself a <button>, and nested buttons are
                            // invalid HTML (causes a hydration error).
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Delete ${sub.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isActivities) deleteActivityMutation.mutate(slug);
                                if (isResources) deleteResourceMutation.mutate(slug);
                                if (subIsActive) router.push(child.href ?? "/");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isActivities) deleteActivityMutation.mutate(slug);
                                  if (isResources) deleteResourceMutation.mutate(slug);
                                  if (subIsActive) router.push(child.href ?? "/");
                                }
                              }}
                              className="ml-auto flex-shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)] cursor-pointer"
                            >
                              <Icon icon={appIcons.trash} size={12} />
                            </span>
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
          {/* No per-wrapper mouse handlers — hover routing is delegated to
              SidebarContent's `onMouseOver` (see the JSX below). The
              `data-collapsed-trigger` attribute is the lookup key the
              delegated handler uses to decide which menu the cursor is on.
              Two reasons for delegation rather than per-wrapper handlers:
              (a) it sidesteps any event-composition quirks around Radix
              Slot's `asChild` on the trigger; (b) `mouseover` bubbles, so a
              single listener on the parent reliably catches transitions
              between sibling triggers regardless of cursor speed. */}
          <div data-collapsed-trigger={item.label}>
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
          </div>
          <PopoverContent
            side="right"
            align="start"
            // `sideOffset={0}` flush-mounts the modal against the sidebar's
            // right edge so they read as one continuous surface (matching the
            // sidebar background already does the rest of the job).
            sideOffset={0}
            // Re-entering the popover from the sidebar (or from the small
            // sliver of overlap between the two) cancels the pending close
            // scheduled by SidebarContent's onMouseLeave.
            onMouseEnter={cancelCollapsedHoverClose}
            onMouseLeave={scheduleCollapsedHoverClose}
            // Visual: the modal reads as a continuation of the sidebar.
            //  - `!bg-...` overrides PopoverContent's default surface bg so
            //    it matches the sidebar.
            //  - Border on the top/right/bottom uses the same token as the
            //    sidebar's own right border (`--color-border-subtle`); the
            //    *left* edge is borderless (`!border-l-0`) because that side
            //    butts up flush against the sidebar — a left border there
            //    would double the sidebar's right border.
            //  - `!p-0` removes the default padding so we can give the
            //    header its own row whose height matches the sidebar item —
            //    that way the title baseline sits on the same line as the
            //    trigger icon.
            // Width: 65% of the previous w-64 (16rem) = 10.4rem.
            className="w-[10.4rem] !border-[var(--color-border-subtle)] !border-l-0 !bg-[var(--color-sidebar-bg,var(--color-bg-canvas))] !p-0"
          >
            {/* Header row: same height as the collapsed sidebar item so the
                title aligns vertically with the menu icon to its left. */}
            <div className="flex h-[var(--control-height-md)] items-center justify-between border-b border-[var(--color-sidebar-divider)] px-[var(--space-3)]">
              <span
                className={cn(
                  "text-xs uppercase tracking-wide",
                  // Match SidebarItem's own active styling for labels:
                  // primary text colour + semibold weight (the accent is
                  // reserved for the icon). When `isActive` (this menu's
                  // own route or any descendant route is current), the
                  // title brightens; otherwise it stays muted.
                  isActive
                    ? "font-semibold text-[var(--color-text-primary)]"
                    : "font-medium text-[var(--color-text-muted)]",
                )}
              >
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
            <div className="space-y-1 p-[var(--space-2)]">
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
      cancelCollapsedHoverClose,
      collapsedTooltipsSuppressed,
      isActiveRoute,
      openCollapsedHoverMenu,
      openCollapsedMenuLabel,
      openCollapsedTooltipLabel,
      renderChildNavigationItems,
      router,
      scheduleCollapsedHoverClose,
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
                <NavSubmenuChildren hasActive={hasActiveChild}>
                  {isDynamic
                    ? effectiveChildren.map((sub) => {
                        const subIsActive = isActiveRoute(sub.href);
                        const slug = sub.href ? sub.href.split("/").pop() : null;
                        const kind: "activity" | "resource" | null = isActivities
                          ? "activity"
                          : isResources
                            ? "resource"
                            : null;
                        // Inline rename mode for this row — render an input
                        // instead of a button (since SidebarItem is itself a
                        // <button>, nesting one would be invalid HTML).
                        if (slug && kind && editingSlug === slug && editingKind === kind) {
                          return (
                            <div
                              key={sub.href ?? sub.label}
                              className="flex h-[var(--control-height-md)] items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-3)]"
                            >
                              <input
                                ref={editInputRef}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitRename();
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                onBlur={commitRename}
                                className="h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-2)] text-sm text-[var(--color-text-primary)] outline-none"
                              />
                              <button
                                type="button"
                                aria-label="Save rename"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={commitRename}
                                className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)] hover:opacity-80"
                              >
                                <Icon icon={appIcons.check} size={12} />
                              </button>
                              <button
                                type="button"
                                aria-label="Cancel rename"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={cancelRename}
                                className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                              >
                                <Icon icon={appIcons.x} size={12} />
                              </button>
                            </div>
                          );
                        }
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
                              {slug && kind ? (
                                <>
                                  {/* role=button instead of <button> — SidebarItem
                                      is itself a <button>, and nested buttons are
                                      invalid HTML (causes a hydration error). */}
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Rename ${sub.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startRename(kind, slug, sub.label);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        startRename(kind, slug, sub.label);
                                      }
                                    }}
                                    className="ml-auto flex-shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                                  >
                                    <Icon icon={appIcons.pencil} size={12} />
                                  </span>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Delete ${sub.label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isActivities) deleteActivityMutation.mutate(slug);
                                      if (isResources) deleteResourceMutation.mutate(slug);
                                      if (subIsActive) router.push(item.href ?? "/");
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (isActivities) deleteActivityMutation.mutate(slug);
                                        if (isResources) deleteResourceMutation.mutate(slug);
                                        if (subIsActive) router.push(item.href ?? "/");
                                      }
                                    }}
                                    className="flex-shrink-0 opacity-0 transition-opacity group-hover/sub:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)] cursor-pointer"
                                  >
                                    <Icon icon={appIcons.trash} size={12} />
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </SidebarItem>
                        );
                      })
                    : renderChildNavigationItems(effectiveChildren, {
                        className: "px-[var(--space-3)]",
                      })}
                </NavSubmenuChildren>
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
      cancelRename,
      commitRename,
      deleteActivityMutation,
      deleteResourceMutation,
      editValue,
      editingKind,
      editingSlug,
      expandedParentLabel,
      isActiveRoute,
      renderChildNavigationItems,
      router,
      setCreateActivityOpen,
      setCreateResourceOpen,
      startRename,
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
        <SidebarContent
          className="flex flex-col space-y-1"
          // Centralised hover routing for the collapsed-mode popover.
          //
          // `onMouseOver` (which bubbles, unlike `mouseenter`) catches every
          // pointer movement over any descendant — including transitions
          // between adjacent triggers — and resolves to a popover label via
          // the nearest `data-collapsed-trigger` ancestor. If that label
          // differs from the currently open one, we cancel any pending close
          // and switch instantly. No per-wrapper handlers means no race
          // between `mouseLeave(old)` and `mouseEnter(new)`.
          //
          // `onMouseLeave` only fires when the cursor truly leaves the
          // sidebar (not when moving between children); it schedules the
          // grace-delayed close. The popover content (rendered to a portal)
          // owns its own enter/leave handlers so the seam between sidebar
          // and popover stays stable.
          onMouseOver={(event) => {
            if (!isCollapsed) return;
            const target = event.target as HTMLElement | null;
            const trigger = target?.closest<HTMLElement>("[data-collapsed-trigger]");
            const label = trigger?.dataset.collapsedTrigger ?? null;
            if (label && label !== openCollapsedMenuLabel) {
              openCollapsedHoverMenu(label);
            }
          }}
          onMouseLeave={scheduleCollapsedHoverClose}
          onMouseEnter={cancelCollapsedHoverClose}
        >
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
