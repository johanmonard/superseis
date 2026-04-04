"use client";

import * as React from "react";

import {
  applyThemePreferences,
  createDefaultThemePreferences,
  loadThemePreferences,
  saveThemePreferences,
  type ThemePreferences,
} from "./theme";

export function useThemePreferences() {
  const [prefs, setPrefs] = React.useState<ThemePreferences>(() =>
    createDefaultThemePreferences()
  );

  React.useEffect(() => {
    const persistedPrefs = loadThemePreferences();
    setPrefs(persistedPrefs);
    applyThemePreferences(persistedPrefs);
  }, []);

  const updatePrefs = React.useCallback(
    (updater: ThemePreferences | ((current: ThemePreferences) => ThemePreferences)) => {
      setPrefs((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        saveThemePreferences(next);
        return next;
      });
    },
    []
  );

  return { prefs, updatePrefs };
}
