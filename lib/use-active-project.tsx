"use client";

import * as React from "react";

export interface ActiveProject {
  id: number;
  name: string;
}

interface ActiveProjectContextValue {
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject | null) => void;
}

const ActiveProjectContext = React.createContext<ActiveProjectContextValue>({
  activeProject: null,
  setActiveProject: () => {},
});

export function ActiveProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeProject, setActiveProject] =
    React.useState<ActiveProject | null>(null);

  const value = React.useMemo(
    () => ({ activeProject, setActiveProject }),
    [activeProject],
  );

  return (
    <ActiveProjectContext.Provider value={value}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject() {
  return React.useContext(ActiveProjectContext);
}
