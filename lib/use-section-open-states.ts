"use client";

import * as React from "react";

// Persists a `Record<sectionTitle, openBoolean>` map in localStorage so a
// page's collapsible Sections remember their open/closed state across
// remounts (e.g. when a parent uses `key={…}` to swap the active item)
// and across full page reloads. Each caller passes its own storageKey so
// pages stay independent.
export function useSectionOpenStates(storageKey: string) {
  const read = React.useCallback((): Record<string, boolean> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }, [storageKey]);

  const [state, setState] = React.useState<Record<string, boolean>>(read);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Quota errors / disabled storage — silent.
    }
  }, [storageKey, state]);

  const isOpen = React.useCallback(
    (title: string, defaultOpen: boolean) => state[title] ?? defaultOpen,
    [state],
  );

  const setOpen = React.useCallback((title: string, next: boolean) => {
    setState((prev) =>
      prev[title] === next ? prev : { ...prev, [title]: next },
    );
  }, []);

  return { isOpen, setOpen };
}
