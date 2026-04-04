"use client";

import * as React from "react";

interface ActiveProjectContextValue {
  activeProject: string | null;
  setActiveProject: (name: string | null) => void;
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
  const [activeProject, setActiveProject] = React.useState<string | null>(null);

  const value = React.useMemo(
    () => ({ activeProject, setActiveProject }),
    [activeProject]
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
