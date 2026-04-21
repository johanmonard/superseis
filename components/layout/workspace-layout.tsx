import * as React from "react";

import { cn } from "../../lib/utils";
import { Sidebar, type SidebarWidth } from "../ui/sidebar";

export interface WorkspaceLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidth?: SidebarWidth;
  showSidebarOnMobile?: boolean;
  hideSidebar?: boolean;
  className?: string;
  mainClassName?: string;
}

export function WorkspaceLayout({
  sidebar,
  children,
  sidebarWidth = "default",
  showSidebarOnMobile = false,
  hideSidebar = false,
  className,
  mainClassName,
}: WorkspaceLayoutProps) {
  return (
    <div className={cn("flex min-h-screen bg-[var(--color-bg-canvas)]", className)}>
      {!hideSidebar && (
        <div className={cn("shrink-0", !showSidebarOnMobile && "hidden md:block")}>
          <Sidebar width={sidebarWidth}>{sidebar}</Sidebar>
        </div>
      )}
      <main
        className={cn(
          "min-w-0 flex-1 overflow-auto p-4 text-[var(--color-text-primary)] lg:p-6",
          mainClassName
        )}
      >
        <div className="min-w-0 w-full max-w-none">{children}</div>
      </main>
    </div>
  );
}
