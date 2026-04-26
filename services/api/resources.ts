/**
 * Resource types — the runtime store now lives in `services/query/resources.ts`,
 * persisted per-project via `useSectionData` into `config.json` under
 * the `resources` section.
 */

export type MotionMode = "MOVE" | "TRAV" | "WORK";

export interface ResourceRandShapeEntry {
  low: string;
  mode: string;
  high: string;
}

export interface ResourceSequenceDef {
  id: string;
  label: string;
  regions: string[];
  designRegion: string;
  stripType: "inline" | "crossline";
  stripGrouping: string;
  clusterType: "weight" | "number" | "size";
  clusterTarget: string;
  stripStart: "highest" | "lowest";
  clusterStart: "highest" | "lowest";
}

export interface ResourceCampMappingEntry {
  key: string;
  value: string;
}

export interface ResourceTimeMapDef {
  mapper: string;
  mapping: Record<string, string>;
}

/** Mirror of the local-state shape inside `resource-parameters.tsx`. */
export interface ResourceParameters {
  designation: string;
  activity: string;
  greedy: boolean;
  abtb: boolean;
  mttf: string;
  mtbd: string;
  btbBuffer: string;
  randShape: Record<MotionMode, ResourceRandShapeEntry>;
  sequences: ResourceSequenceDef[];
  campMapper: string;
  campMappingEntries: ResourceCampMappingEntry[];
  campStart: string;
  mappingModes: Record<string, MotionMode>;
  workMapping: Record<string, string>;
  timeMapMove: ResourceTimeMapDef;
  timeMapTrav: ResourceTimeMapDef;
}

export type Resource = {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  parameters?: ResourceParameters;
};

export type ResourceCreate = {
  name: string;
};
