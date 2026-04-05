"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
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
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { useActiveProject } from "../../lib/use-active-project";
import { useLogoutMutation } from "../../lib/use-auth-session";
import { useThemePreferences } from "../../lib/use-theme-preferences";
import type { ThemeDensity } from "../../lib/theme";
import { getApiErrorMessage } from "../../services/api/auth";

const { folderOpen: FolderOpen, logOut: LogOut, rows3: Rows3, save: Save, upload: Upload, x: X } = appIcons;

export interface WorkspacePageHeaderProps {
  session: { username: string; is_admin: boolean };
  pageTitle?: string;
  pageSubtitle?: string;
}

const densityOptions: { value: ThemeDensity; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

export function WorkspacePageHeader({
  session,
  pageTitle,
  pageSubtitle,
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
    (nextDensity: ThemeDensity) => {
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

  const pathname = usePathname();
  const { activeProject, setActiveProject } = useActiveProject();
  const userInitials = session.username.slice(0, 2).toUpperCase();
  const isProjectPage = pathname.startsWith("/project") || pathname === "/";
  const [showFilesDialog, setShowFilesDialog] = React.useState(false);

  return (
    <>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        {/* Center: project toolbar or badge — absolutely centered on the bar */}
        <div className="pointer-events-none absolute inset-0 hidden items-start justify-center sm:flex">
          {activeProject && isProjectPage ? (
            <TooltipProvider delayDuration={200}>
              <div className="pointer-events-auto flex items-center gap-[var(--space-1)] rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] shadow-[0_1px_2px_var(--color-shadow-alpha)]">
                <span className="pl-[var(--space-1)] pr-[1ch] text-xs font-semibold text-[var(--color-text-primary)]">
                  {activeProject}
                </span>
                <div className="h-4 w-px bg-[var(--color-border-subtle)]" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Project files"
                      onClick={() => setShowFilesDialog(true)}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                    >
                      <FolderOpen size={14} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Project files</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Save project"
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                    >
                      <Save size={14} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Save project</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Exit project"
                      onClick={() => {
                        setActiveProject(null);
                        router.push("/");
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
                    >
                      <LogOut size={14} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Exit project</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : activeProject ? (
            <Badge variant="accent">{activeProject}</Badge>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Change density">
                <Rows3 size={16} strokeWidth={1.75} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-[var(--space-2)]">
              <div className="flex flex-col gap-[var(--space-1)]">
                <p className="px-[var(--space-3)] pb-[var(--space-1)] pt-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
                  Density
                </p>
                {densityOptions.map((opt) => {
                  const isActive = themePrefs.density === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleDensityChange(opt.value)}
                      className={cn(
                        "flex items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-sm transition-colors",
                        isActive
                          ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-medium text-[var(--color-accent)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
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
      <ProjectFilesDialog
        open={showFilesDialog}
        onOpenChange={setShowFilesDialog}
      />
    </>
  );
}

/* ------------------------------------------------------------------
   Project Files Dialog
   ------------------------------------------------------------------ */

type FileCategory = "polygons" | "poi" | "layers";

const FILE_CATEGORIES: { key: FileCategory; label: string }[] = [
  { key: "polygons", label: "Polygons" },
  { key: "poi", label: "POI" },
  { key: "layers", label: "Layers" },
];

const DUMMY_FILES: Record<FileCategory, string[]> = {
  polygons: ["exclusion_zone_north.shp", "survey_boundary_v2.geojson"],
  poi: ["well_locations.csv", "camp_sites.kml"],
  layers: ["elevation_model.tif"],
};

function ProjectFilesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInputRefs = React.useRef<Record<FileCategory, HTMLInputElement | null>>({
    polygons: null,
    poi: null,
    layers: null,
  });

  const [files, setFiles] = React.useState<Record<FileCategory, string[]>>(DUMMY_FILES);

  const handleUpload = React.useCallback(
    (category: FileCategory, fileList: FileList) => {
      const names = Array.from(fileList).map((f) => f.name);
      setFiles((prev) => ({
        ...prev,
        [category]: [...prev[category], ...names],
      }));
    },
    []
  );

  const handleRemove = React.useCallback(
    (category: FileCategory, index: number) => {
      setFiles((prev) => ({
        ...prev,
        [category]: prev[category].filter((_, i) => i !== index),
      }));
    },
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-xl max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Project Files</DialogTitle>
      </DialogHeader>
      <DialogBody className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[var(--space-4)]">
          {FILE_CATEGORIES.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-[var(--space-2)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {label}
                </span>
                <input
                  ref={(el) => { fileInputRefs.current[key] = el; }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleUpload(key, e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRefs.current[key]?.click()}
                >
                  <Upload size={12} className="mr-[var(--space-1)]" />
                  Upload
                </Button>
              </div>
              {files[key].length === 0 ? (
                <p className="px-[var(--space-3)] py-[var(--space-2)] text-xs text-[var(--color-text-muted)]">
                  No files uploaded.
                </p>
              ) : (
                <div className="flex max-h-36 flex-col gap-[var(--space-1)] overflow-y-auto">
                  {files[key].map((name, i) => (
                    <div
                      key={`${name}-${i}`}
                      className="flex shrink-0 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
                    >
                      <span className="truncate text-xs text-[var(--color-text-secondary)]">
                        {name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(key, i)}
                        className="shrink-0 ml-[var(--space-2)] text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
