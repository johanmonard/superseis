/**
 * Activity types — the runtime store now lives in `services/query/activities.ts`,
 * persisted per-project via `useSectionData` into `config.json` under
 * the `activities` section.
 */

export interface ActivityStripDef {
  id: string;
  label: string;
  regions: string[];
  design: string;
  stripType: string;
  grouping: string;
  start: string;
}

export interface ActivitySequenceDef extends ActivityStripDef {
  clusterType: string;
  target: string;
  startCluster: string;
}

export interface ActivityMotion {
  gid_ttype_shift: string;
  gid_swath_shift: string;
  buffer_len_min: string;
  buffer_len_max: string;
  gid_sub_shift: string;
}

/** Sequencing data scoped to a (Grid Option, Partition) pair. Stored per
 *  pair in `ActivityParameters.scenarios`, keyed by
 *  `${designOption}|${sequenceRegioning}`. */
export interface ActivityScenarioBucket {
  masterDesign: string;
  strips: ActivityStripDef[];
  sequences: ActivitySequenceDef[];
}

/** Mirror of the local-state shape inside `activity-parameters.tsx`. */
export interface ActivityParameters {
  description: string;
  pType: "s" | "r";
  baseMap: string;
  allocation: Record<string, string | null>;
  slipTimes: Record<string, Record<string, string>>;
  designOption: string;
  sequenceRegioning: string;
  /** Per-(Grid option, Partition) buckets — see `ActivityScenarioBucket`. */
  scenarios: Record<string, ActivityScenarioBucket>;
  motion: ActivityMotion;
  dynamicMappingKw: string;
}

export type Activity = {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  parameters?: ActivityParameters;
};

export type ActivityCreate = {
  name: string;
};
