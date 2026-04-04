"use client";

import * as React from "react";

export const WORKSPACE_SIDEBAR_STORAGE_KEY = "app:workspace-sidebar";

function readWorkspaceSidebarCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(WORKSPACE_SIDEBAR_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeWorkspaceSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(
      WORKSPACE_SIDEBAR_STORAGE_KEY,
      collapsed ? "collapsed" : "expanded"
    );
  } catch {}
}

export function useWorkspaceSidebar() {
  const [isCollapsed, setIsCollapsedState] = React.useState(false);

  React.useEffect(() => {
    setIsCollapsedState(readWorkspaceSidebarCollapsed());
  }, []);

  const setIsCollapsed = React.useCallback(
    (nextValue: boolean | ((currentValue: boolean) => boolean)) => {
      setIsCollapsedState((currentValue) => {
        const nextCollapsed =
          typeof nextValue === "function" ? nextValue(currentValue) : nextValue;
        writeWorkspaceSidebarCollapsed(nextCollapsed);
        return nextCollapsed;
      });
    },
    []
  );

  return { isCollapsed, setIsCollapsed };
}
