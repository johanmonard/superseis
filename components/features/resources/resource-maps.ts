export interface ResourceMapConfig {
  id: string;
  name: string;
  layers: string[];
}

export interface ResourceMapsCrewSection {
  options: Array<{
    id: string;
    name: string;
    activities: Array<{
      id: string;
      name: string;
      resources: Array<{ id?: string; name: string }>;
    }>;
  }>;
  activeId: string;
}

export interface ResourceMapRow {
  layer: string;
  canEditWorkTime: boolean;
  canEditMoveSpeed: boolean;
  canEditTravelSpeed: boolean;
}

export function buildResourceMapRows({
  resourceName,
  maps,
  movingMapName,
  travelMapName,
  crewSection,
  motionCells,
}: {
  resourceName: string;
  maps: ResourceMapConfig[];
  movingMapName: string;
  travelMapName: string;
  crewSection: ResourceMapsCrewSection;
  motionCells: Record<string, boolean>;
}): ResourceMapRow[] {
  const movingMap = maps.find((m) => m.name === movingMapName);
  const travelMap = maps.find((m) => m.name === travelMapName);
  const movingLayers = new Set(movingMap?.layers ?? []);
  const travelLayers = new Set(travelMap?.layers ?? []);

  const activeCrew =
    crewSection.options.find((o) => o.id === crewSection.activeId) ??
    crewSection.options[0];

  const motionLayers = new Set<string>();
  if (activeCrew) {
    const resourceKeys = new Set<string>();
    for (const activity of activeCrew.activities) {
      for (const resource of activity.resources) {
        if (resource.name === resourceName) {
          if (resource.id) resourceKeys.add(`|${activity.id}|${resource.id}`);
          resourceKeys.add(`|${activity.name}|${resource.name}`);
        }
      }
    }

    for (const [key, selected] of Object.entries(motionCells)) {
      if (!selected) continue;
      const resourceKey = Array.from(resourceKeys).find((suffix) =>
        key.endsWith(suffix),
      );
      if (!resourceKey) continue;
      const layer = key.slice(0, key.length - resourceKey.length);
      if (layer) motionLayers.add(layer);
    }
  }

  const orderedLayers: string[] = [];
  const seenLayers = new Set<string>();
  const addLayer = (layer: string) => {
    if (!layer || seenLayers.has(layer)) return;
    seenLayers.add(layer);
    orderedLayers.push(layer);
  };

  travelMap?.layers.forEach(addLayer);
  movingMap?.layers.forEach(addLayer);
  motionLayers.forEach(addLayer);

  return orderedLayers.map((layer) => ({
    layer,
    canEditWorkTime: motionLayers.has(layer),
    canEditMoveSpeed: movingLayers.has(layer),
    canEditTravelSpeed: travelLayers.has(layer),
  }));
}
