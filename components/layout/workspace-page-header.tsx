"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DevBanner } from "../ui/dev-banner";
import { Icon, appIcons } from "../ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Select } from "../ui/select";
import { useLogoutMutation } from "../../lib/use-auth-session";
import { useThemePreferences } from "../../lib/use-theme-preferences";
import type { ThemeDensity } from "../../lib/theme";
import { getApiErrorMessage } from "../../services/api/auth";

export interface WorkspacePageHeaderProps {
  session: { username: string; is_admin: boolean };
  pageTitle?: string;
  pageSubtitle?: string;
  showAuthStubBanner?: boolean;
}

const densityLabels: Record<ThemeDensity, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  dense: "Dense",
};

export function WorkspacePageHeader({
  session,
  pageTitle,
  pageSubtitle,
  showAuthStubBanner = false,
}: WorkspacePageHeaderProps) {
  const router = useRouter();
  const logoutMutation = useLogoutMutation();
  const { prefs: themePrefs, updatePrefs: setThemePrefs } = useThemePreferences();

  const toggleTheme = React.useCallback(() => {
    setThemePrefs((current) => ({
      ...current,
      mode: current.mode === "dark" ? "light" : "dark",
    }));
  }, [setThemePrefs]);

  const handleDensityChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextDensity = event.target.value as ThemeDensity;
      setThemePrefs((current) => ({
        ...current,
        density: nextDensity,
      }));
    },
    [setThemePrefs]
  );

  const handleLogout = React.useCallback(async () => {
    await logoutMutation.mutateAsync();
    router.replace("/login");
  }, [logoutMutation, router]);

  const userInitials = session.username.slice(0, 2).toUpperCase();

  return (
    <>
      {showAuthStubBanner ? (
        <DevBanner message="Development auth stub active — replace before deployment" />
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {pageTitle ? (
            <>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              {pageSubtitle ? (
                <p className="max-w-3xl text-sm text-[var(--color-text-secondary)]">
                  {pageSubtitle}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] shadow-[0_1px_2px_var(--color-shadow-alpha)]">
            <span className="hidden text-xs font-medium text-[var(--color-text-muted)] sm:inline">
              Density
            </span>
            <Select
              aria-label="Select workspace density"
              value={themePrefs.density}
              onChange={handleDensityChange}
              variant="text"
              containerClassName="min-w-[5.75rem]"
              displayClassName="text-sm text-[var(--color-text-primary)]"
            >
              {Object.entries(densityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="ghost" size="sm" aria-label="Toggle theme" onClick={toggleTheme}>
            <Icon icon={themePrefs.mode === "dark" ? appIcons.sun : appIcons.moon} />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2" aria-label="Open session menu">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] text-xs font-semibold text-[var(--color-text-primary)]">
                  {userInitials}
                </span>
                <span className="hidden max-w-28 truncate sm:inline">{session.username}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-[var(--space-4)]">
                <div className="space-y-[var(--space-2)]">
                  <div className="flex items-center gap-[var(--space-2)]">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {session.username}
                    </p>
                    <Badge variant={session.is_admin ? "accent" : "outline"}>
                      {session.is_admin ? "Admin" : "User"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Local starter session. Admin visibility follows
                    `APP_ADMIN_USERS` until you replace the auth flow.
                  </p>
                </div>
                {logoutMutation.error ? (
                  <p className="text-xs text-[var(--color-status-danger)]">
                    {getApiErrorMessage(logoutMutation.error, "Sign-out failed.")}
                  </p>
                ) : null}
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLogout}
                    disabled={logoutMutation.isPending}
                  >
                    {logoutMutation.isPending ? "Signing out..." : "Sign out"}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  );
}
