"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { appIcons } from "../ui/icon";
import { cn } from "../../lib/utils";
import { useActiveProject } from "../../lib/use-active-project";
import { useGeoJsonProjectScopePrune } from "../../services/query/project-files";
import { getNavigationIconForPathname } from "../../config/navigation.config";

const {
  upload: Upload,
  x: X,
} = appIcons;

export interface WorkspacePageHeaderProps {
  pageTitle?: string;
}

export function WorkspacePageHeader({
  pageTitle,
}: WorkspacePageHeaderProps) {
  const pathname = usePathname();
  const { activeProject } = useActiveProject();
  useGeoJsonProjectScopePrune(activeProject?.id ?? null);

  return (
    <div className="relative flex min-h-[var(--topbar-height)] flex-col gap-3 px-[var(--header-padding-x)] py-[var(--space-3)] sm:h-[var(--topbar-height)] sm:min-h-0 sm:flex-row sm:items-center sm:py-0">
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
    </div>
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

export function ProjectFilesDialog({
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
      const m = /^(theoretical_grid|offset_grid|grid_mesh|bins_mesh)__(.+)\.gpkg$/.exec(f);
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

