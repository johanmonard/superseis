"use client";

import * as React from "react";
import Image from "next/image";
import { appIcons } from "@/components/ui/icon";

const { chevronRight: ChevronRight, folderOpen: FolderOpen, plus: Plus } = appIcons;

import { useActiveProject } from "@/lib/use-active-project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProjectSettingsWorkflow } from "./project-settings-workflow";

/* ------------------------------------------------------------------
   Dummy data — replace with real project list later
   ------------------------------------------------------------------ */

const DUMMY_PROJECTS = [
  { id: "1", name: "Groningen 2024", updatedAt: "2024-12-18" },
  { id: "2", name: "Basel Geothermal", updatedAt: "2025-01-05" },
  { id: "3", name: "Oklahoma Induced", updatedAt: "2025-03-22" },
  { id: "4", name: "Vrancea Deep Monitor", updatedAt: "2025-04-01" },
];

/* ------------------------------------------------------------------
   Hooks
   ------------------------------------------------------------------ */

function useIsDarkTheme() {
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/* ------------------------------------------------------------------
   Sub-components
   ------------------------------------------------------------------ */

function ActionCard({
  icon: IconComponent,
  title,
  description,
  onClick,
  accent,
  compact,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick?: () => void;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-start gap-[var(--space-3)] overflow-hidden rounded-[var(--radius-md)] border text-left transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-canvas)]",
        compact ? "p-[var(--space-4)]" : "flex-col p-[var(--space-5)]",
        accent
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:brightness-95"
          : "border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-shadow-alpha)] hover:border-[var(--color-border-strong)] hover:shadow-[0_4px_12px_var(--color-shadow-alpha)]"
      )}
    >
      {!compact && (
        <div
          className={cn(
            "absolute -right-2 -top-3 text-[80px] font-bold leading-none select-none",
            accent ? "opacity-[0.1]" : "opacity-[0.05]"
          )}
          aria-hidden="true"
        >
          {accent ? "+" : "/"}
        </div>
      )}

      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-transform duration-200 group-hover:scale-110",
          compact ? "h-9 w-9" : "h-10 w-10",
          accent
            ? "bg-[rgba(255,255,255,0.15)]"
            : "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
        )}
      >
        <IconComponent
          size={compact ? 18 : 20}
          strokeWidth={1.75}
          className={cn(
            accent
              ? "text-[var(--color-accent-foreground)]"
              : "text-[var(--color-accent)]"
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-1)]">
        <span
          className={cn(
            "font-semibold tracking-tight",
            compact ? "text-sm" : "text-base"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "leading-relaxed",
            compact ? "text-xs" : "text-sm",
            accent ? "opacity-75" : "text-[var(--color-text-secondary)]"
          )}
        >
          {description}
        </span>
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-0 h-[2px] w-0 transition-all duration-300 group-hover:w-full",
          accent ? "bg-[rgba(255,255,255,0.3)]" : "bg-[var(--color-accent)]"
        )}
      />
    </button>
  );
}

function ProjectListItem({
  name,
  updatedAt,
  onClick,
}: {
  name: string;
  updatedAt: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-4)] py-[var(--space-3)] text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
    >
      <FolderOpen
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-[var(--color-text-muted)]"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
          {name}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Last modified {updatedAt}
        </span>
      </div>
      <ChevronRight
        size={14}
        strokeWidth={2}
        className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}

/* ------------------------------------------------------------------
   Main component
   ------------------------------------------------------------------ */

export function HomeOverview() {
  const isDark = useIsDarkTheme();
  const { activeProject, setActiveProject } = useActiveProject();

  const [showNewDialog, setShowNewDialog] = React.useState(false);
  const [showLoadDialog, setShowLoadDialog] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");

  const handleCreateProject = () => {
    const trimmed = newProjectName.trim();
    if (!trimmed) return;
    setActiveProject(trimmed);
    setNewProjectName("");
    setShowNewDialog(false);
  };

  const handleLoadProject = (name: string) => {
    setActiveProject(name);
    setShowLoadDialog(false);
  };

  /* ---- Welcome view (no project loaded) ---- */
  if (!activeProject) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex w-full max-w-xl flex-col items-center gap-[var(--space-6)]">
            <div className="flex flex-col items-center gap-[var(--space-3)] text-center">
              <Image
                src={isDark ? "/seiseye_logo_white.png" : "/seiseye_logo_black.png"}
                alt="SeisEye"
                width={220}
                height={60}
                priority
                className="h-auto w-[180px]"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
                Workspace
              </span>
              <p className="mt-[var(--space-2)] max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
                Create a new monitoring project or continue working on an
                existing one.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2">
              <ActionCard
                icon={Plus}
                title="New Project"
                description="Set up a new seismic monitoring project from scratch."
                accent
                onClick={() => setShowNewDialog(true)}
              />
              <ActionCard
                icon={FolderOpen}
                title="Load Project"
                description="Open an existing project to continue your work."
                onClick={() => setShowLoadDialog(true)}
              />
            </div>

            <p className="text-center text-xs text-[var(--color-text-muted)]">
              Projects are saved locally and can be exported at any time.
            </p>
          </div>
        </div>

        <NewProjectDialog
          open={showNewDialog}
          onOpenChange={setShowNewDialog}
          value={newProjectName}
          onChange={setNewProjectName}
          onSubmit={handleCreateProject}
        />
        <LoadProjectDialog
          open={showLoadDialog}
          onOpenChange={setShowLoadDialog}
          projects={DUMMY_PROJECTS}
          onSelect={handleLoadProject}
        />
      </>
    );
  }

  /* ---- Active project view — settings workflow ---- */
  return (
    <>
      <div className="h-full w-full">
        <ProjectSettingsWorkflow />
      </div>

      <NewProjectDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        value={newProjectName}
        onChange={setNewProjectName}
        onSubmit={handleCreateProject}
      />
      <LoadProjectDialog
        open={showLoadDialog}
        onOpenChange={setShowLoadDialog}
        projects={DUMMY_PROJECTS}
        onSelect={handleLoadProject}
      />
    </>
  );
}

/* ------------------------------------------------------------------
   Dialogs
   ------------------------------------------------------------------ */

function NewProjectDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Small delay so the dialog is rendered before focus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>New Project</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <label className="flex flex-col gap-[var(--space-2)]">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            Project name
          </span>
          <Input
            ref={inputRef}
            placeholder="e.g. Groningen 2025"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
        </label>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={!value.trim()} onClick={onSubmit}>
          Create
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function LoadProjectDialog({
  open,
  onOpenChange,
  projects,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string; updatedAt: string }[];
  onSelect: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Load Project</DialogTitle>
      </DialogHeader>
      <DialogBody>
        {projects.length === 0 ? (
          <p className="py-[var(--space-4)] text-center text-sm text-[var(--color-text-muted)]">
            No projects found.
          </p>
        ) : (
          <div className="flex flex-col gap-[var(--space-2)]">
            {projects.map((p) => (
              <ProjectListItem
                key={p.id}
                name={p.name}
                updatedAt={p.updatedAt}
                onClick={() => onSelect(p.name)}
              />
            ))}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
