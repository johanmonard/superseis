export interface ThemeDefinition {
  id: string;
  label: string;
  description?: string;
  kind: "light" | "dark";
  counterpart?: string;
  /** Display name for the theme family — the list picker groups by this. */
  family: string;
}

export const THEME_REGISTRY: readonly ThemeDefinition[] = [
  { id: "default", label: "Default", family: "Default", kind: "light", counterpart: "dark", description: "Baseline light appearance" },
  { id: "light", label: "Light", family: "Default", kind: "light", counterpart: "dark", description: "Editable light variant" },
  { id: "dark", label: "Dark", family: "Default", kind: "dark", counterpart: "default", description: "Dark surfaces and elevated contrast" },
  { id: "test-1-light", label: "Test 1 — Light", family: "Test 1", kind: "light", counterpart: "test-1-dark", description: "Flat-pane IDE, zinc + orange" },
  { id: "test-1-dark", label: "Test 1 — Dark", family: "Test 1", kind: "dark", counterpart: "test-1-light", description: "Flat-pane IDE, zinc + orange" },
  { id: "test-2-light", label: "Test 2 — Light", family: "Test 2", kind: "light", counterpart: "test-2-dark", description: "Flat-pane IDE, hairline separators" },
  { id: "test-2-dark", label: "Test 2 — Dark", family: "Test 2", kind: "dark", counterpart: "test-2-light", description: "Flat-pane IDE, hairline separators" },
  { id: "zen-1-light", label: "Zen 1 — Light", family: "Zen 1", kind: "light", counterpart: "zen-1-dark", description: "Matcha + almond, warm earth tones" },
  { id: "zen-1-dark", label: "Zen 1 — Dark", family: "Zen 1", kind: "dark", counterpart: "zen-1-light", description: "Matcha + almond, warm earth tones" },
  { id: "zen-2-light", label: "Zen 2 — Light", family: "Zen 2", kind: "light", counterpart: "zen-2-dark", description: "Zen palette on Test 2 hairline flat-pane IDE" },
  { id: "zen-2-dark", label: "Zen 2 — Dark", family: "Zen 2", kind: "dark", counterpart: "zen-2-light", description: "Zen palette on Test 2 hairline flat-pane IDE" },
  { id: "happy-1-light", label: "Happy 1 — Light", family: "Happy 1", kind: "light", counterpart: "happy-1-dark", description: "Vivid red-orange + pink + amber on cream" },
  { id: "happy-1-dark", label: "Happy 1 — Dark", family: "Happy 1", kind: "dark", counterpart: "happy-1-light", description: "Vivid red-orange + pink + amber on cream" },
  { id: "happy-2-light", label: "Happy 2 — Light", family: "Happy 2", kind: "light", counterpart: "happy-2-dark", description: "Sage + forest green with yellow + amber accents" },
  { id: "happy-2-dark", label: "Happy 2 — Dark", family: "Happy 2", kind: "dark", counterpart: "happy-2-light", description: "Sage + forest green with yellow + amber accents" },
] as const;

/**
 * Unique theme families in registry order, each paired with the id to apply
 * for a given kind (dark/light). Falls back to the other variant when a
 * family has only one side defined.
 */
export function getThemeFamilies(): readonly {
  family: string;
  description?: string;
  lightId: ThemeMode;
  darkId: ThemeMode;
}[] {
  const families = new Map<
    string,
    { family: string; description?: string; lightId?: ThemeMode; darkId?: ThemeMode }
  >();
  for (const t of THEME_REGISTRY) {
    const entry = families.get(t.family) ?? { family: t.family, description: t.description };
    if (t.kind === "light" && !entry.lightId) entry.lightId = t.id;
    if (t.kind === "dark" && !entry.darkId) entry.darkId = t.id;
    if (!entry.description) entry.description = t.description;
    families.set(t.family, entry);
  }
  return Array.from(families.values()).map((e) => ({
    family: e.family,
    description: e.description,
    lightId: (e.lightId ?? e.darkId) as ThemeMode,
    darkId: (e.darkId ?? e.lightId) as ThemeMode,
  }));
}

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
