export type ThemeMode = "light" | "dark";
export type ThemeDensity = "compact" | "comfortable" | "dense";

export interface ThemePreferences {
  mode: ThemeMode;
  density: ThemeDensity;
}

export const THEME_STORAGE_KEY = "app:theme-preferences";

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: "light",
  density: "compact",
};

const VALID_DENSITIES: readonly ThemeDensity[] = ["compact", "comfortable", "dense"];

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
      mode: parsed.mode === "dark" ? "dark" : "light",
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
  element.setAttribute("data-theme", prefs.mode);
  element.setAttribute("data-density", prefs.density);
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  applyThemePreferences(prefs);
}
