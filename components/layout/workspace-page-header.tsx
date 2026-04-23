"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { fetchProjectSection } from "../../services/api/project-sections";
import { reloadProjectConfig } from "../../services/api/project";
import { sectionKeys } from "../../services/query/project-sections";
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
import { useGeoJsonProjectScopePrune } from "../../services/query/project-files";
import { GisPreloadToggle } from "../features/project/gis-preload-toggle";
import { useLogoutMutation } from "../../lib/use-auth-session";
import { useThemePreferences } from "../../lib/use-theme-preferences";
import {
  THEME_REGISTRY,
  getThemeFamilies,
  type ThemeDensity,
  type ThemeMode,
} from "../../lib/theme";
import { getApiErrorMessage } from "../../services/api/auth";
import { getNavigationIconForPathname } from "../../config/navigation.config";

const {
  braces: Braces,
  folderOpen: FolderOpen,
  logOut: LogOut,
  refresh: RefreshCw,
  rows3: Rows3,
  save: Save,
  upload: Upload,
  user: UserIcon,
  x: X,
} = appIcons;

export interface WorkspacePageHeaderProps {
  session: { email: string; is_admin: boolean };
  pageTitle?: string;
}

const densityOptions: { value: ThemeDensity; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

export function WorkspacePageHeader({
  session,
  pageTitle,
}: WorkspacePageHeaderProps) {
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
    router.replace("/");
  }, [logoutMutation, router]);

  const pathname = usePathname();
  const { activeProject, setActiveProject } = useActiveProject();
  useGeoJsonProjectScopePrune(activeProject?.id ?? null);
  const isProjectPage = pathname.startsWith("/project") || pathname === "/";
  const [showFilesDialog, setShowFilesDialog] = React.useState(false);
  const [showPayloadDialog, setShowPayloadDialog] = React.useState(false);

  const queryClient = useQueryClient();
  const reloadMutation = useMutation({
    mutationFn: (projectId: number) => reloadProjectConfig(projectId),
    onSuccess: (_res, projectId) => {
      // Drop every cached section for this project so the next render
      // refetches the freshly reloaded config from the backend.
      queryClient.invalidateQueries({
        queryKey: sectionKeys.project(projectId),
      });
    },
  });
  const reloadError = reloadMutation.error;
  const reloadErrorMessage = reloadError
    ? getApiErrorMessage(reloadError, "Reload failed.")
    : null;

  return (
    <>
      <div className="relative flex min-h-[var(--topbar-height)] flex-col gap-3 px-[var(--header-padding-x)] py-[var(--space-3)] sm:h-[var(--topbar-height)] sm:min-h-0 sm:flex-row sm:items-center sm:justify-between sm:py-0">
        <div className="min-w-0">
          {pageTitle ? (
            <h1 className="flex items-center gap-[var(--space-2)] text-xl font-semibold">
              {(() => {
                const iconKey = getNavigationIconForPathname(pathname);
                const IconComponent = iconKey ? appIcons[iconKey] : null;
                return IconComponent ? (
                  <IconComponent
                    size={20}
                    strokeWidth={1.75}
                    className="shrink-0 text-[var(--color-text-secondary)]"
                    aria-hidden="true"
                  />
                ) : null;
              })()}
              <span className="truncate">{pageTitle}</span>
            </h1>
          ) : null}
        </div>
        {/* Center: project toolbar or badge — absolutely centered on the bar */}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center sm:flex">
          {activeProject && isProjectPage ? (
            <TooltipProvider delayDuration={200}>
              <div className="pointer-events-auto flex items-center gap-[var(--space-1)] rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] shadow-[0_1px_2px_var(--color-shadow-alpha)]">
                <span className="pl-[var(--space-1)] pr-[1ch] text-xs font-semibold text-[var(--color-text-primary)]">
                  {activeProject.name}
                </span>
                <div className="h-4 w-px bg-[var(--color-border-subtle)]" />
                <GisPreloadToggle projectId={activeProject.id} />
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
                      aria-label="Reload config from disk"
                      onClick={() => reloadMutation.mutate(activeProject.id)}
                      disabled={reloadMutation.isPending}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RefreshCw
                        size={14}
                        strokeWidth={1.75}
                        className={reloadMutation.isPending ? "animate-spin" : undefined}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {reloadErrorMessage
                      ? reloadErrorMessage
                      : reloadMutation.isSuccess
                        ? "Reloaded from disk"
                        : "Reload config.json from disk"}
                  </TooltipContent>
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
            <Badge variant="accent">{activeProject.name}</Badge>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Page payload" onClick={() => setShowPayloadDialog(true)}>
                  <Braces size={16} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Page payload</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          <Button
            variant="ghost"
            size="sm"
            aria-label={isDark ? "Switch to light" : "Switch to dark"}
            onClick={toggleDarkMode}
          >
            <Icon icon={isDark ? appIcons.sun : appIcons.moon} />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Change theme">
                <Icon icon={appIcons.palette} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-[var(--space-2)]">
              <div className="flex flex-col gap-[var(--space-1)]">
                <p className="px-[var(--space-3)] pb-[var(--space-1)] pt-[var(--space-2)] text-xs font-medium text-[var(--color-text-muted)]">
                  Theme
                </p>
                {getThemeFamilies().map((family) => {
                  const targetId = isDark ? family.darkId : family.lightId;
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2" aria-label="Open session menu">
                <UserIcon size={16} className="text-[var(--color-text-secondary)]" aria-hidden />
                <span className="hidden max-w-28 truncate sm:inline">{session.email}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
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
        </div>
      </div>
      <ProjectFilesDialog
        open={showFilesDialog}
        onOpenChange={setShowFilesDialog}
        projectId={activeProject?.id ?? null}
      />
      <PagePayloadDialog
        open={showPayloadDialog}
        onOpenChange={setShowPayloadDialog}
        pathname={pathname}
        projectId={activeProject?.id ?? null}
      />
    </>
  );
}

/* ------------------------------------------------------------------
   Project Files Dialog
   ------------------------------------------------------------------ */

import type { FileCategory } from "../../services/api/project-files";
import {
  useProjectFiles,
  useUploadProjectFile,
  useDeleteProjectFile,
} from "../../services/query/project-files";
import { useProjectSection } from "../../services/query/project-sections";

interface UploadCategory {
  key: Exclude<FileCategory, "seismic" | "dem">;
  label: string;
}

const UPLOAD_CATEGORIES: UploadCategory[] = [
  { key: "polygons", label: "Polygons" },
  { key: "poi", label: "POI" },
  { key: "gis_layers", label: "Layers" },
];

const ACCEPTED_EXTENSIONS = ".gpkg,.kml,.zip";

function slugifyOption(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function ProjectFilesDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number | null;
}) {
  const { data: files } = useProjectFiles(open ? projectId : null);
  const uploadMutation = useUploadProjectFile(projectId);
  const deleteMutation = useDeleteProjectFile(projectId);
  const { data: designOptionsSection } = useProjectSection(
    open ? projectId : null,
    "design_options",
  );

  const handleUpload = React.useCallback(
    (category: FileCategory, fileList: FileList | File[]) => {
      Array.from(fileList).forEach((file) => {
        uploadMutation.mutate({ category, file });
      });
    },
    [uploadMutation]
  );

  const handleRemove = React.useCallback(
    (category: FileCategory, filename: string) => {
      deleteMutation.mutate({ category, filename });
    },
    [deleteMutation]
  );

  // Group seismic files by the grid option that produced them — matches
  // the filename namespacing the pipeline writes (``<stem>__<slug>.gpkg``).
  const seismicGroups = React.useMemo(() => {
    const seismic = files?.seismic ?? [];
    const options = ((designOptionsSection?.data as {
      options?: { name?: string }[];
    } | undefined)?.options ?? [])
      .map((o) => (typeof o?.name === "string" ? o.name : ""))
      .filter((n) => n.length > 0);
    const slugToName = new Map(options.map((n) => [slugifyOption(n), n]));
    const order = new Map<string, number>(options.map((n, i) => [n, i]));

    const groups = new Map<string, string[]>();
    for (const f of seismic) {
      const m = /^(theoretical_grid|offset_grid)__(.+)\.gpkg$/.exec(f);
      const slug = m?.[2] ?? "";
      const display = (slug && slugToName.get(slug)) || slug || "Unknown";
      const bucket = groups.get(display) ?? [];
      bucket.push(f);
      groups.set(display, bucket);
    }
    return Array.from(groups.entries())
      .map(([name, items]) => ({ name, files: items.sort() }))
      .sort((a, b) => {
        const ai = order.get(a.name);
        const bi = order.get(b.name);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [files, designOptionsSection]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="w-[95vw] max-w-[1400px] max-h-[70vh] flex flex-col"
    >
      <DialogHeader>
        <DialogTitle>Project Files</DialogTitle>
      </DialogHeader>
      <DialogBody className="min-h-0 flex-1 overflow-y-auto">
        {!projectId ? (
          <p className="text-sm text-[var(--color-text-muted)]">No active project.</p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-[var(--space-4)] md:grid-cols-2">
            {UPLOAD_CATEGORIES.map(({ key, label }) => (
              <UploadSection
                key={key}
                label={label}
                category={key}
                files={files?.[key] ?? []}
                uploading={uploadMutation.isPending}
                deleting={deleteMutation.isPending}
                onUpload={handleUpload}
                onRemove={handleRemove}
              />
            ))}
            <SeismicSection
              groups={seismicGroups}
              deleting={deleteMutation.isPending}
              onRemove={handleRemove}
            />
          </div>
        )}
        {uploadMutation.error ? (
          <p className="mt-[var(--space-3)] text-xs text-[var(--color-status-danger)]">
            {(uploadMutation.error as Error).message}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function UploadSection({
  label,
  category,
  files,
  uploading,
  deleting,
  onUpload,
  onRemove,
}: {
  label: string;
  category: FileCategory;
  files: string[];
  uploading: boolean;
  deleting: boolean;
  onUpload: (category: FileCategory, files: FileList | File[]) => void;
  onRemove: (category: FileCategory, filename: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const dragDepth = React.useRef(0);

  const handleDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      const dropped = e.dataTransfer?.files;
      if (dropped && dropped.length > 0) onUpload(category, dropped);
    },
    [category, onUpload],
  );

  return (
    <div className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUpload(category, e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-dashed px-[var(--space-3)] py-[var(--space-4)] transition-colors",
          dragOver
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted,var(--color-bg-elevated))] text-[var(--color-text-primary)]"
            : "border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
        )}
      >
        <Upload size={12} className="shrink-0" />
        <span className="flex-1 truncate text-xs">
          {uploading ? "Uploading…" : "Drop files or click to upload"}
        </span>
        <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
          {ACCEPTED_EXTENSIONS.replace(/,/g, " · ")}
        </span>
      </div>

      {files.length === 0 ? (
        <p className="px-[var(--space-1)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
          No files uploaded.
        </p>
      ) : (
        <div className="flex flex-col gap-[var(--space-1)]">
          {files.map((name) => (
            <div
              key={name}
              className="flex shrink-0 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
            >
              <span className="truncate text-xs text-[var(--color-text-secondary)]">
                {name}
              </span>
              <button
                type="button"
                onClick={() => onRemove(category, name)}
                disabled={deleting}
                className="shrink-0 ml-[var(--space-2)] text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeismicSection({
  groups,
  deleting,
  onRemove,
}: {
  groups: { name: string; files: string[] }[];
  deleting: boolean;
  onRemove: (category: FileCategory, filename: string) => void;
}) {
  const total = groups.reduce((sum, g) => sum + g.files.length, 0);
  return (
    <div className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Seismic
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Pipeline-generated · {total} file{total === 1 ? "" : "s"}
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="px-[var(--space-1)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
          No files. Run the grid or offsets step to generate them.
        </p>
      ) : (
        <div className="flex flex-col gap-[var(--space-2)]">
          {groups.map((group) => (
            <div key={group.name} className="flex flex-col gap-[var(--space-1)]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {group.name}
              </span>
              {group.files.map((f) => {
                const shortLabel = f.replace(/__[^.]+(?=\.gpkg$)/, "");
                return (
                  <div
                    key={f}
                    className="flex shrink-0 items-center justify-between rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-[var(--space-3)] py-[var(--space-2)]"
                  >
                    <span className="truncate text-xs text-[var(--color-text-secondary)]">
                      {shortLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove("seismic", f)}
                      disabled={deleting}
                      title="Delete — will be regenerated on the next grid/offsets run"
                      className="shrink-0 ml-[var(--space-2)] text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Page Payload Dialog
   ------------------------------------------------------------------ */

/** Map route segments to the section key(s) stored in the query cache. */
const ROUTE_SECTIONS: Record<string, string[]> = {
  definition: ["definition"],
  partitioning: ["partitioning"],
  design: ["design", "design_options"],
  survey: ["survey"],
  osm: ["osm"],
  layers: ["layers"],
  maps: ["maps"],
  offsetters: ["offsetters"],
  crew: ["crew"],
};

function getSectionSegment(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match?.[1] ?? null;
}

function PagePayloadDialog({
  open,
  onOpenChange,
  pathname,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  projectId: number | null;
}) {
  const segment = getSectionSegment(pathname);
  const sectionKeys = React.useMemo(
    () => (segment ? ROUTE_SECTIONS[segment] ?? [] : []),
    [segment],
  );

  const queries = useQueries({
    queries: sectionKeys.map((key) => ({
      queryKey: ["project-sections", projectId, key] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchProjectSection(projectId!, key, signal),
      enabled: open && projectId !== null && projectId > 0,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const payload = React.useMemo(() => {
    if (sectionKeys.length === 0) return null;
    const result: Record<string, unknown> = {};
    for (let i = 0; i < sectionKeys.length; i++) {
      result[sectionKeys[i]] = queries[i]?.data?.data ?? null;
    }
    return result;
  }, [sectionKeys, queries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>
          Payload{" "}
          <span className="font-normal text-[var(--color-text-muted)]">— {segment ?? "unknown"}</span>
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="min-h-0 flex-1 overflow-y-auto">
        {!segment || sectionKeys.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No section data available for this page.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        ) : (
          <pre className="overflow-auto rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] p-[var(--space-4)] text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
