"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Icon, appIcons } from "../ui/icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { useLogoutMutation } from "../../lib/use-auth-session";
import { useSoundPreference } from "../../lib/use-sound-preference";
import { useThemePreferences } from "../../lib/use-theme-preferences";
import {
  THEME_REGISTRY,
  getThemeFamilies,
  type ThemeMode,
} from "../../lib/theme";
import { getApiErrorMessage } from "../../services/api/auth";
import { DEMO_LINKS } from "../../config/navigation.config";

const { user: UserIcon } = appIcons;

interface Props {
  session: { email: string; is_admin: boolean } | null;
  isCollapsed: boolean;
}

export function SidebarBottomActions({ session, isCollapsed }: Props) {
  const router = useRouter();
  const logoutMutation = useLogoutMutation();
  const { prefs: themePrefs, updatePrefs: setThemePrefs } = useThemePreferences();

  const currentThemeDef = THEME_REGISTRY.find((t) => t.id === themePrefs.mode);
  const isDark = currentThemeDef?.kind === "dark";

  const handleThemeChange = React.useCallback(
    (nextMode: ThemeMode) => {
      setThemePrefs((current) => ({ ...current, mode: nextMode }));
    },
    [setThemePrefs]
  );

  const toggleDarkMode = React.useCallback(() => {
    setThemePrefs((current) => {
      const def = THEME_REGISTRY.find((t) => t.id === current.mode);
      const fallback = def?.kind === "dark" ? "default" : "dark";
      return { ...current, mode: (def?.counterpart ?? fallback) as ThemeMode };
    });
  }, [setThemePrefs]);

  const handleLogout = React.useCallback(async () => {
    await logoutMutation.mutateAsync();
    router.replace("/");
  }, [logoutMutation, router]);

  const [demoOpen, setDemoOpen] = React.useState(false);
  const demoBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Demo"
          onClick={() => setDemoOpen(true)}
        >
          <Icon icon={appIcons.blocks} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        Demo
      </TooltipContent>
    </Tooltip>
  );

  const themeToggleBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={isDark ? "Switch to light" : "Switch to dark"}
          onClick={toggleDarkMode}
        >
          <Icon icon={isDark ? appIcons.sun : appIcons.moon} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {isDark ? "Light theme" : "Dark theme"}
      </TooltipContent>
    </Tooltip>
  );

  const themePickerBtn = (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Change theme">
              <Icon icon={appIcons.palette} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          Theme
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="end" sideOffset={12} className="w-48 p-[var(--space-2)]">
        <div className="flex flex-col gap-[var(--space-1)]">
          <p className="px-[var(--space-3)] pb-[var(--space-1)] pt-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
            Theme
          </p>
          {getThemeFamilies().map((family) => {
            // Theme picker always lands on the family's dark variant; the
            // sun/moon toggle is the only way to switch kind. Keeps the
            // list to a single entry per theme family.
            const targetId = family.darkId;
            const currentFamily = THEME_REGISTRY.find(
              (t) => t.id === themePrefs.mode
            )?.family;
            const isActive = currentFamily === family.family;
            return (
              <button
                key={family.family}
                type="button"
                onClick={() => handleThemeChange(targetId)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm transition-colors",
                  isActive
                    ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                )}
              >
                <span>{family.family}</span>
                {family.description && (
                  <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                    {family.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );

  const [soundOn, setSoundOn] = useSoundPreference();
  const soundBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={soundOn ? "Mute ambient sound" : "Unmute ambient sound"}
          aria-pressed={soundOn}
          onClick={() => setSoundOn(!soundOn)}
        >
          <Icon icon={soundOn ? appIcons.volume2 : appIcons.volumeX} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {soundOn ? "Mute" : "Unmute"}
      </TooltipContent>
    </Tooltip>
  );

  const userBtn = session ? (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Open session menu">
              <UserIcon size={16} className="text-[var(--color-text-secondary)]" aria-hidden />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          Account
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="end" sideOffset={12} className="w-72">
        <div className="space-y-[var(--space-4)]">
          <div className="space-y-[var(--space-2)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                {session.email}
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
  ) : null;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-[var(--space-1)]",
          isCollapsed ? "flex-col" : "flex-row justify-center",
        )}
      >
        {demoBtn}
        {themeToggleBtn}
        {themePickerBtn}
        {soundBtn}
        {userBtn}
      </div>
      <Dialog open={demoOpen} onOpenChange={setDemoOpen} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Demo</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-[var(--space-2)] sm:grid-cols-3">
            {DEMO_LINKS.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => {
                  setDemoOpen(false);
                  router.push(link.href);
                }}
                className={cn(
                  "flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm text-[var(--color-text-secondary)] transition-colors",
                  "hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]",
                )}
              >
                <Icon
                  icon={appIcons[link.icon]}
                  size={14}
                  className="shrink-0 text-[var(--color-text-muted)]"
                />
                <span className="truncate">{link.label}</span>
              </button>
            ))}
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}
