/**
 * Pick the default basemap tile index based on the active theme. Dark themes
 * land on CartoDB Dark, light themes on CartoDB Positron. Falls back to
 * index 0 if neither name is in the supplied source list.
 *
 * Synchronous (reads `data-theme-kind` directly) so callers can use it from
 * a `useState` initializer without flicker.
 */
export function defaultTileIndex(
  sources: ReadonlyArray<{ name: string }>,
): number {
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-theme-kind") === "dark";
  const target = isDark ? "CartoDB Dark" : "CartoDB Positron";
  const idx = sources.findIndex((s) => s.name === target);
  return idx >= 0 ? idx : 0;
}
