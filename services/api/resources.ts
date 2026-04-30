/**
 * Resource types — the runtime store now lives in `services/query/resources.ts`,
 * persisted per-project via `useSectionData` into `config.json` under
 * the `resources` section.
 */

import type { ActivitySequenceDef } from "./activities";

export type MotionMode = "MOVE" | "TRAV" | "WORK";

export interface ResourceRandShapeEntry {
  low: string;
  mode: string;
  high: string;
}

/** Legacy per-resource sequence shape. Kept so older saved data can be
 *  migrated into the new per-(Grid option, Partition) scenario buckets,
 *  which use the activity sequence shape so the form mirrors the
 *  activity's resource-level partitioning section exactly. */
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

export interface ResourceWorkingTimeEntry {
  id: string;
  from: string;
  to: string;
  returnToBase: boolean;
}

/** Sequencing data scoped to a (Grid Option, Partition) pair — same idea
 *  as `ActivityScenarioBucket`, minus the activity-level master design /
 *  base strips (those don't apply to a single resource). */
export interface ResourceScenarioBucket {
  sequences: ActivitySequenceDef[];
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
  designOption: string;
  sequenceRegioning: string;
  /** Per-(Grid option, Partition) buckets — see `ResourceScenarioBucket`. */
  scenarios: Record<string, ResourceScenarioBucket>;
  campMapper: string;
  campMappingEntries: ResourceCampMappingEntry[];
  campStart: string;
  mappingModes: Record<string, MotionMode>;
  workMapping: Record<string, string>;
  timeMapMove: ResourceTimeMapDef;
  timeMapTrav: ResourceTimeMapDef;
  workingTime: ResourceWorkingTimeEntry[];
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
