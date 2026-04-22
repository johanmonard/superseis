export interface ThemeDefinition {
  id: string;
  label: string;
  description?: string;
  kind: "light" | "dark";
  counterpart?: string;
}

export const THEME_REGISTRY: readonly ThemeDefinition[] = [
  { id: "default", label: "Default", kind: "light", counterpart: "dark", description: "Baseline light appearance" },
  { id: "light", label: "Light", kind: "light", counterpart: "dark", description: "Editable light variant" },
  { id: "dark", label: "Dark", kind: "dark", counterpart: "default", description: "Dark surfaces and elevated contrast" },
  { id: "test-1-light", label: "Test 1 — Light", kind: "light", counterpart: "test-1-dark", description: "Flat-pane IDE, zinc + orange" },
  { id: "test-1-dark", label: "Test 1 — Dark", kind: "dark", counterpart: "test-1-light", description: "Flat-pane IDE, zinc + orange" },
  { id: "test-2-light", label: "Test 2 — Light", kind: "light", counterpart: "test-2-dark", description: "Flat-pane IDE, hairline separators" },
  { id: "test-2-dark", label: "Test 2 — Dark", kind: "dark", counterpart: "test-2-light", description: "Flat-pane IDE, hairline separators" },
] as const;

export type ThemeMode = (typeof THEME_REGISTRY)[number]["id"];
export type ThemeDensity = "compact" | "comfortable" | "dense";

export interface ThemePreferences {
  mode: ThemeMode;
  density: ThemeDensity;
}

export const THEME_STORAGE_KEY = "app:theme-preferences";

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: "default",
  density: "compact",
};

const VALID_DENSITIES: readonly ThemeDensity[] = ["compact", "comfortable", "dense"];
const VALID_MODES: readonly ThemeMode[] = THEME_REGISTRY.map((t) => t.id);

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (VALID_MODES as readonly string[]).includes(value);
}

export function createDefaultThemePreferences(): ThemePreferences {
  return { ...DEFAULT_THEME_PREFERENCES };
}

export function loadThemePreferences(): ThemePreferences {
  if (typeof window === "undefined") {
    return createDefaultThemePreferences();
  }

  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return createDefaultThemePreferences();
    }

    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
    return {
      mode: isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_PREFERENCES.mode,
      density: VALID_DENSITIES.includes(parsed.density as ThemeDensity)
        ? (parsed.density as ThemeDensity)
        : DEFAULT_THEME_PREFERENCES.density,
    };
  } catch {
    return createDefaultThemePreferences();
  }
}

export function applyThemePreferences(prefs: ThemePreferences): void {
  const element = document.documentElement;
  const def = THEME_REGISTRY.find((t) => t.id === prefs.mode);
  element.setAttribute("data-theme", prefs.mode);
  element.setAttribute("data-theme-kind", def?.kind ?? "light");
  element.setAttribute("data-density", prefs.density);
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  applyThemePreferences(prefs);
}
