"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { useActiveProject } from "../../lib/use-active-project";
import { GisPreloadToggle } from "../features/project/gis-preload-toggle";
import { Button } from "../ui/button";
import { Icon, appIcons } from "../ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { ProjectFilesDialog } from "./workspace-page-header";

interface Props {
  isCollapsed: boolean;
}

export function SidebarProjectToolbar({ isCollapsed }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeProject, setActiveProject } = useActiveProject();
  const [showFilesDialog, setShowFilesDialog] = React.useState(false);

  const isProjectPage = pathname.startsWith("/project") || pathname === "/";
  if (!activeProject || !isProjectPage) return null;

  const handleExit = () => {
    setActiveProject(null);
    router.push("/");
  };

  const filesBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Project files"
          onClick={() => setShowFilesDialog(true)}
        >
          <Icon icon={appIcons.folderOpen} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={isCollapsed ? "right" : "bottom"}>
        Project files
      </TooltipContent>
    </Tooltip>
  );

  const exitBtn = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Exit project"
          onClick={handleExit}
          className="hover:text-[var(--color-status-danger)]"
        >
          <Icon icon={appIcons.logOut} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side={isCollapsed ? "right" : "bottom"}>
        Exit project
      </TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <div
        className={cn(
          "mb-[var(--space-3)] border-b border-[var(--color-border-subtle)]",
          isCollapsed
            ? "px-[var(--space-1)] pt-[var(--space-1)] pb-[var(--space-3)]"
            : "px-[var(--space-2)] pt-[var(--space-2)] pb-[var(--space-3)]",
        )}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-[var(--space-1)]">
            <GisPreloadToggle projectId={activeProject.id} />
            {filesBtn}
            {exitBtn}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-[var(--space-1)]">
            <span
              className="max-w-full truncate px-[var(--space-1)] text-center text-sm font-semibold text-[var(--color-accent)]"
              title={activeProject.name}
            >
              {activeProject.name}
            </span>
            <div className="flex items-center justify-center gap-[var(--space-1)]">
              <GisPreloadToggle projectId={activeProject.id} />
              {filesBtn}
              {exitBtn}
            </div>
          </div>
        )}
      </div>
      <ProjectFilesDialog
        open={showFilesDialog}
        onOpenChange={setShowFilesDialog}
        projectId={activeProject.id}
      />
    </>
  );
}
