"use client";

import * as React from "react";

const STORAGE_KEY = "app:sound-on";

function readPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === "true";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

/**
 * Single-value boolean preference for the ambient-sound toggle, persisted
 * to ``localStorage`` and shared across components in the same tab via an
 * in-memory listener set. Cross-tab sync arrives via the native ``storage``
 * event (only fires in *other* tabs), so a write here updates this tab's
 * subscribers immediately and other tabs the next time they re-read.
 */
export function useSoundPreference(): [boolean, (next: boolean) => void] {
  const [value, setValue] = React.useState(readPref);

  React.useEffect(() => {
    const handler = () => setValue(readPref());
    listeners.add(handler);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handler();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(handler);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  }, []);

  const set = React.useCallback((next: boolean) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* swallow — quota / disabled storage shouldn't break the toggle */
      }
    }
    listeners.forEach((l) => l());
  }, []);

  return [value, set];
}
