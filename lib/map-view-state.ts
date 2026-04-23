/**
 * In-memory session cache for settings-page map viewports.
 *
 * Callers key entries by ``"<page>:<projectId>"``. The cache records
 * transient UI state that should survive client-side navigation within
 * a session — camera, tile provider, left-panel ticks — but is
 * intentionally not persisted across page reloads.
 *
 * Fields are optional: pages that only need camera restoration just use
 * ``camera``; the Files page additionally stores ``tileIndex`` and
 * ``selectedFiles``. Writers merge into the existing entry so each
 * surface can own its slice without stepping on another's.
 */

export type MapCameraState = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

export type MapSessionState = {
  camera?: MapCameraState;
  tileIndex?: number;
  selectedFiles?: string[];
  alignToGridNorth?: boolean;
};

const cache = new Map<string, MapSessionState>();

export function getMapSessionState(
  key: string | null | undefined
): MapSessionState | undefined {
  return key ? cache.get(key) : undefined;
}

export function updateMapSessionState(
  key: string | null | undefined,
  patch: Partial<MapSessionState>
): void {
  if (!key) return;
  const prev = cache.get(key) ?? {};
  cache.set(key, { ...prev, ...patch });
}

export function clearMapSessionState(key: string): void {
  cache.delete(key);
}

// Camera-only convenience wrappers — most callers only care about
// centre/zoom/bearing/pitch, and treating camera as a first-class slot
// keeps their call sites short.
export function getMapViewState(
  key: string | null | undefined
): MapCameraState | undefined {
  return getMapSessionState(key)?.camera;
}

export function setMapViewState(
  key: string | null | undefined,
  camera: MapCameraState
): void {
  updateMapSessionState(key, { camera });
}
