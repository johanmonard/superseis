"use client";

import * as React from "react";

/**
 * Live boolean for whether the active theme is a dark variant. Reads the
 * ``data-theme-kind`` attribute on ``<html>`` (set by the theme system in
 * ``lib/theme``) and stays subscribed via ``MutationObserver`` so every
 * consumer re-renders when the user toggles light↔dark.
 *
 * Initial state is ``false`` (matches SSR) and the real value lands on the
 * first effect tick — same shape as ``useThemePreferences``.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setIsDark(root.getAttribute("data-theme-kind") === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme-kind"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
