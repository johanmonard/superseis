"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { InlineTagSelect } from "../activities/inline-tag-select";
import { Section } from "../activities/section";
import { StripColumnHeader } from "../activities/strip-column-header";
import { formatUnitValue, parseUnitValue } from "./resource-units";
import type { ActivitySequenceDef } from "@/services/api/activities";
import type {
  MotionMode,
  Resource,
  ResourceCampMappingEntry,
  ResourceParameters,
  ResourceScenarioBucket,
  ResourceWorkingTimeEntry,
} from "@/services/api/resources";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { useSectionOpenStates } from "@/lib/use-section-open-states";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Live data sources — pulled from sibling sections of the same project      */
/* -------------------------------------------------------------------------- */

interface ResourcesSectionData {
  items: Resource[];
  nextId: number;
}
const DEFAULT_RESOURCES_SECTION: ResourcesSectionData = {
  items: [],
  nextId: 1,
};

interface CrewSectionData {
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
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

/** Mirror of the design options section — same shape as in
 *  `activity-parameters.tsx`. We read it to populate the Grid option pill
 *  bar and the per-grid-option Design dropdown. */
interface DesignOptionsSectionData {
  options: Array<{
    id: string;
    name: string;
    rows: Array<{ design: string }>;
  }>;
  activeId: string;
}
const DEFAULT_DESIGN_OPTIONS_SECTION: DesignOptionsSectionData = {
  options: [],
  activeId: "",
};

/** Mirror of the partitioning section. We read group names for the
 *  Partitions pill bar and per-group polygons for the Regions selector. */
interface PartitioningSectionData {
  groups: Array<{ id: string; name: string; polygons: string[] }>;
  activeId: string;
}
const DEFAULT_PARTITIONING_SECTION: PartitioningSectionData = {
  groups: [],
  activeId: "",
};

/** Mirror of Project → Scenarios. Only the fields we use to narrow the
 *  Grid option / Partitions pickers to values committed by a scenario. */
interface OptionsSectionData {
  options: Array<{
    id: string;
    name: string;
    partitionName: string;
    gridOptionName: string;
  }>;
  activeId: string;
}
const DEFAULT_OPTIONS_SECTION: OptionsSectionData = {
  options: [],
  activeId: "",
};

/** Mirror of Project → Maps. We read the map names for the Camps
 *  Definition Map dropdown and the per-map ordered layer list for the
 *  per-entry Layer dropdown. */
interface MapsSectionData {
  maps: Array<{ id: string; name: string; layers: string[] }>;
  activeId: string;
}
const DEFAULT_MAPS_SECTION: MapsSectionData = { maps: [], activeId: "" };

/** Mirror of Project → Survey. We read the active group's POIs for the
 *  Camps Definition entry Key dropdown and the POI Start dropdown. */
interface SurveySectionData {
  groups: Array<{ id: string; name: string; pois: string[] }>;
  activeGroupId: string;
}
const DEFAULT_SURVEY_SECTION: SurveySectionData = {
  groups: [],
  activeGroupId: "",
};

const MOTION_MODES = ["MOVE", "TRAV", "WORK"] as const;

const MAPPING_MODE_KEYS = ["BASE", "CGRP", "CPRG", "CURRENT", "SWITCH"] as const;
export const WORK_TIME_UNITS = ["s", "mn", "h", "d"] as const;
export const SPEED_UNITS = ["kmph", "kts"] as const;

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

function defaultScenarioBucket(): ResourceScenarioBucket {
  return { sequences: [] };
}

function defaultParameters(): ResourceParameters {
  return {
    designation: "",
    activity: "",
    greedy: false,
    abtb: false,
    mttf: "",
    mtbd: "",
    btbBuffer: "",
    randShape: {
      MOVE: { low: "", mode: "", high: "" },
      TRAV: { low: "", mode: "", high: "" },
      WORK: { low: "", mode: "", high: "" },
    },
    designOption: "",
    sequenceRegioning: "",
    scenarios: {},
    campMapper: "",
    campMappingEntries: [{ key: "", value: "" }],
    campStart: "",
    mappingModes: Object.fromEntries(
      MAPPING_MODE_KEYS.map((k) => [k, "MOVE" as MotionMode]),
    ),
    workMapping: {},
    timeMapMove: {
      mapper: "",
      mapping: {},
    },
    timeMapTrav: {
      mapper: "",
      mapping: {},
    },
    workingTime: [],
  };
}

/** Convert a legacy `ResourceSequenceDef[]` (top-level `sequences`) into
 *  the activity-shape `ActivitySequenceDef[]` used inside scenario buckets,
 *  so existing saved data keeps its values when the resource form moves to
 *  the activity sequencing layout. */
function migrateLegacySequences(raw: unknown): ActivitySequenceDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : crypto.randomUUID(),
    label: typeof s.label === "string" ? s.label : "Seq",
    regions: Array.isArray(s.regions) ? (s.regions as string[]) : [],
    design:
      typeof s.designRegion === "string"
        ? s.designRegion
        : typeof s.design === "string"
          ? s.design
          : "",
    stripType: typeof s.stripType === "string" ? s.stripType : "inline",
    grouping:
      typeof s.stripGrouping === "string"
        ? s.stripGrouping
        : typeof s.grouping === "string"
          ? s.grouping
          : "",
    clusterType: typeof s.clusterType === "string" ? s.clusterType : "weight",
    target:
      typeof s.clusterTarget === "string"
        ? s.clusterTarget
        : typeof s.target === "string"
          ? s.target
          : "",
    start:
      typeof s.stripStart === "string"
        ? s.stripStart
        : typeof s.start === "string"
          ? s.start
          : "highest",
    startCluster:
      typeof s.clusterStart === "string"
        ? s.clusterStart
        : typeof s.startCluster === "string"
          ? s.startCluster
          : "highest",
  }));
}

export function UnitValueControl({
  value,
  units,
  defaultUnit,
  ariaLabel,
  onChange,
}: {
  value: string;
  units: readonly string[];
  defaultUnit: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseUnitValue(value, defaultUnit, units);
  // Persisted strings drop the unit when the value is empty (formatUnitValue
  // returns ""), so a unit-only change on an empty cell would round-trip back
  // to defaultUnit. Hold the chosen unit locally so it sticks until the user
  // either types a value (parsed.unit takes over) or picks a different unit.
  const [pendingUnit, setPendingUnit] = React.useState<string | null>(null);
  const displayUnit = parsed.value ? parsed.unit : (pendingUnit ?? parsed.unit);
  const commit = (nextValue: string, nextUnit: string) => {
    setPendingUnit(nextUnit);
    onChange(formatUnitValue(nextValue, nextUnit));
  };
  const unitWidth = units.includes("kmph") ? "w-[2.4rem]" : "w-[1.5rem]";

  return (
    <div className="flex w-full items-center gap-[var(--space-1)]">
      <Input
        value={parsed.value}
        onChange={(e) => commit(e.target.value.replace(/[^0-9]/g, ""), displayUnit)}
        aria-label={ariaLabel}
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-[var(--control-height-sm)] min-w-0 flex-1 [appearance:textfield] px-[var(--space-1)] text-right text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <select
        value={displayUnit}
        onChange={(e) => commit(parsed.value, e.target.value)}
        aria-label={`${ariaLabel} unit`}
        className={cn(
          "h-[var(--control-height-sm)] shrink-0 cursor-pointer appearance-none bg-transparent px-0 text-xs font-medium text-[var(--color-text-secondary)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] [&>option]:bg-[var(--color-bg-surface)] [&>option]:text-[var(--color-text-primary)]",
          unitWidth,
        )}
      >
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ResourceParameters({
  resourceName,
  resourceSlug,
}: {
  resourceName: string;
  /** Optional — if set, parameters are persisted to this resource's registry entry. */
  resourceSlug?: string;
}) {
  // ──────────────────────────────────────────────────────────────────────
  // Same direct-`useSectionData` pattern as the Project pages: the
  // section IS the source of truth, no local React.useState, no separate
  // persist effect. Field setters write the patched entry back through
  // `update`, which optimistically refreshes the cache and debounce-saves.
  // ──────────────────────────────────────────────────────────────────────
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: resourcesSection, update: updateResourcesSection } =
    useSectionData<ResourcesSectionData>(
      projectId,
      "resources",
      DEFAULT_RESOURCES_SECTION,
    );
  const entry = resourceSlug
    ? resourcesSection.items.find((r) => r.slug === resourceSlug)
    : undefined;

  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );
  const { data: designOptionsSection } =
    useSectionData<DesignOptionsSectionData>(
      projectId,
      "design_options",
      DEFAULT_DESIGN_OPTIONS_SECTION,
    );
  const { data: partitioningSection } = useSectionData<PartitioningSectionData>(
    projectId,
    "partitioning",
    DEFAULT_PARTITIONING_SECTION,
  );
  const { data: optionsSection } = useSectionData<OptionsSectionData>(
    projectId,
    "options",
    DEFAULT_OPTIONS_SECTION,
  );
  const { data: mapsSection } = useSectionData<MapsSectionData>(
    projectId,
    "maps",
    DEFAULT_MAPS_SECTION,
  );
  const { data: surveySection } = useSectionData<SurveySectionData>(
    projectId,
    "survey",
    DEFAULT_SURVEY_SECTION,
  );
  const parameters: ResourceParameters = React.useMemo(() => {
    const raw = (entry?.parameters ?? {}) as Record<string, unknown>;
    const merged: ResourceParameters = {
      ...defaultParameters(),
      ...(raw as Partial<ResourceParameters>),
    };
    if (!merged.scenarios || typeof merged.scenarios !== "object") {
      merged.scenarios = {};
    }
    // One-shot migration: legacy `sequences` (top-level, ResourceSequenceDef
    // shape) → a single bucket keyed by the current (Grid option, Partition)
    // pair, in the activity-shape ActivitySequenceDef so the form mirrors
    // the activity's resource-level partitioning section exactly.
    if (Object.keys(merged.scenarios).length === 0) {
      const migrated = migrateLegacySequences(raw.sequences);
      if (migrated.length > 0) {
        const key = `${merged.designOption}|${merged.sequenceRegioning}`;
        merged.scenarios = { [key]: { sequences: migrated } };
      }
    }
    return merged;
  }, [entry?.parameters]);

  const setParameters = React.useCallback(
    (updater: React.SetStateAction<ResourceParameters>) => {
      if (!resourceSlug) return;
      const live = resourcesSection;
      const target = live.items.find((r) => r.slug === resourceSlug);
      if (!target) return;
      const prev: ResourceParameters = {
        ...defaultParameters(),
        ...(target.parameters ?? {}),
      };
      const next =
        typeof updater === "function"
          ? (updater as (v: ResourceParameters) => ResourceParameters)(prev)
          : updater;
      updateResourcesSection({
        ...live,
        items: live.items.map((r) =>
          r.slug === resourceSlug ? { ...r, parameters: next } : r,
        ),
      });
    },
    [resourceSlug, resourcesSection, updateResourcesSection],
  );

  function field<K extends keyof ResourceParameters>(
    key: K,
  ): [
    ResourceParameters[K],
    (value: React.SetStateAction<ResourceParameters[K]>) => void,
  ] {
    return [
      parameters[key],
      (updater) =>
        setParameters((prev) => ({
          ...prev,
          [key]:
            typeof updater === "function"
              ? (
                  updater as (
                    v: ResourceParameters[K],
                  ) => ResourceParameters[K]
                )(prev[key])
              : updater,
        })),
    ];
  }

  /** Helper for fields scoped to the active (Grid option, Partition)
   *  bucket. Mirrors the same helper in `activity-parameters.tsx`. The key
   *  is recomputed at write time so writes always land in the bucket
   *  selected by the current dropdowns. */
  function bucketField<K extends keyof ResourceScenarioBucket>(
    key: K,
  ): [
    ResourceScenarioBucket[K],
    (value: React.SetStateAction<ResourceScenarioBucket[K]>) => void,
  ] {
    return [
      currentBucket[key],
      (updater) =>
        setParameters((prev) => {
          const k = `${prev.designOption}|${prev.sequenceRegioning}`;
          const prevBucket = prev.scenarios[k] ?? defaultScenarioBucket();
          const nextValue =
            typeof updater === "function"
              ? (
                  updater as (
                    v: ResourceScenarioBucket[K],
                  ) => ResourceScenarioBucket[K]
                )(prevBucket[key])
              : updater;
          return {
            ...prev,
            scenarios: {
              ...prev.scenarios,
              [k]: { ...prevBucket, [key]: nextValue },
            },
          };
        }),
    ];
  }

  /* ── Motion ──────────────────────────────────────────────────────────── */
  const [greedy, setGreedy] = field("greedy");
  const [abtb, setAbtb] = field("abtb");
  const [mttf, setMttf] = field("mttf");
  const [mtbd, setMtbd] = field("mtbd");
  const [btbBuffer, setBtbBuffer] = field("btbBuffer");
  const [randShape, setRandShape] = field("randShape");

  /* ── Sequencing ──────────────────────────────────────────────────────── */
  const [designOption, setDesignOption] = field("designOption");
  const [sequenceRegioning, setSequenceRegioning] = field("sequenceRegioning");

  // Active sequencing bucket — keyed by `${designOption}|${sequenceRegioning}`.
  // Switching either pill swaps in the bucket for the new pair (or an empty
  // default bucket if none has been written yet).
  const currentScenarioKey = `${designOption}|${sequenceRegioning}`;
  const currentBucket: ResourceScenarioBucket =
    parameters.scenarios[currentScenarioKey] ?? defaultScenarioBucket();

  // Names actually used by at least one scenario (Project → Scenarios).
  // We narrow the Grid option / Partitions pickers to these so the form
  // only offers values the project has committed to — same rule as the
  // activity Sequencing section.
  const usedGridOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const o of optionsSection.options) {
      if (o.gridOptionName) set.add(o.gridOptionName);
    }
    return set;
  }, [optionsSection.options]);
  const usedPartitions = React.useMemo(() => {
    const set = new Set<string>();
    for (const o of optionsSection.options) {
      if (o.partitionName) set.add(o.partitionName);
    }
    return set;
  }, [optionsSection.options]);

  const designOptionNames = React.useMemo(
    () =>
      designOptionsSection.options
        .map((o) => o.name)
        .filter((n) => usedGridOptions.has(n)),
    [designOptionsSection.options, usedGridOptions],
  );
  const partitionNames = React.useMemo(
    () =>
      partitioningSection.groups
        .map((g) => g.name)
        .filter((n) => usedPartitions.has(n)),
    [partitioningSection.groups, usedPartitions],
  );

  // Designs belonging to the currently-selected design option (deduped).
  const designsForSelectedOption = (() => {
    const opt = designOptionsSection.options.find(
      (o) => o.name === designOption,
    );
    if (!opt) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of opt.rows) {
      const name = row.design?.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  })();

  // Polygons of the currently-selected partition group.
  const polygonsForSelectedPartition = (() => {
    const group = partitioningSection.groups.find(
      (g) => g.name === sequenceRegioning,
    );
    return group?.polygons ?? [];
  })();

  // Sequences — scoped to the active scenario bucket. Rendered as a
  // column-per-area table below so all sequences are visible at once.
  const [sequences, setSequences] = bucketField("sequences");

  /* ── Terrain ─────────────────────────────────────────────────────────── */
  const [campMapper, setCampMapper] = field("campMapper");
  const [campMappingEntries, setCampMappingEntries] = field("campMappingEntries");
  const [campStart, setCampStart] = field("campStart");

  // Available map names (Project → Maps).
  const availableMaps = React.useMemo(
    () => mapsSection.maps.map((m) => m.name).filter((n) => n),
    [mapsSection.maps],
  );
  // Layers belonging to the map currently picked in `campMapper`.
  const selectedMapLayers = React.useMemo(() => {
    const m = mapsSection.maps.find((mm) => mm.name === campMapper);
    return m?.layers ?? [];
  }, [mapsSection.maps, campMapper]);
  // POIs from the active survey group (Project → Survey).
  const availablePois = React.useMemo(() => {
    const group =
      surveySection.groups.find((g) => g.id === surveySection.activeGroupId) ??
      surveySection.groups[0];
    return group?.pois ?? [];
  }, [surveySection]);
  const [mappingModes, setMappingModes] = field("mappingModes");

  /* ── Working Time ─────────────────────────────────────────────────────── */
  const [workingTime, setWorkingTime] = field("workingTime");

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const updateRandShape = (
    mode: MotionMode,
    fieldName: keyof (typeof randShape)["MOVE"],
    value: string,
  ) => {
    setRandShape((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [fieldName]: value },
    }));
  };

  const updateSequence = (id: string, patch: Partial<ActivitySequenceDef>) => {
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateCampEntry = (idx: number, patch: Partial<ResourceCampMappingEntry>) => {
    setCampMappingEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)),
    );
  };

  const addCampEntry = () => {
    setCampMappingEntries((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeCampEntry = (idx: number) => {
    setCampMappingEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const addWorkingTimeEntry = () => {
    setWorkingTime((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from: "", to: "", returnToBase: false },
    ]);
  };
  const updateWorkingTimeEntry = (
    id: string,
    patch: Partial<ResourceWorkingTimeEntry>,
  ) => {
    setWorkingTime((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const removeWorkingTimeEntry = (id: string) => {
    setWorkingTime((prev) => prev.filter((e) => e.id !== id));
  };

  // Persisted open/closed state for the collapsible sections — kept in
  // localStorage so it survives the remount that happens when the user
  // switches resources (the page passes `key={slug}` to this component).
  const sectionStates = useSectionOpenStates(
    "seiseye.resource-parameters.sections",
  );
  const sectionProps = (title: string, defaultOpen: boolean) => ({
    open: sectionStates.isOpen(title, defaultOpen),
    onToggle: (next: boolean) => sectionStates.setOpen(title, next),
  });

  return (
    <div className="space-y-[var(--space-2)]">
      {/* ── Motion ────────────────────────────────────────────────────── */}
      <Section title="Motion" {...sectionProps("Motion", false)}>
        {/* Field horizontal puts pt-[7px] on its label to align with text
            inputs; for a 16px checkbox that drops the label below the box,
            so we render this row manually with items-center. */}
        <div className="flex items-center gap-[var(--space-3)]">
          <span className="w-24 shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">
            Greedy
          </span>
          <Checkbox
            checked={greedy}
            onCheckedChange={(checked) => setGreedy(checked === true)}
          />
        </div>
        <Field label="MTTF" htmlFor="res-mttf" layout="horizontal">
          <Input
            id="res-mttf"
            type="number"
            value={mttf}
            onChange={(e) => setMttf(e.target.value)}
          />
        </Field>
        <Field label="MTBD" htmlFor="res-mtbd" layout="horizontal">
          <Input
            id="res-mtbd"
            type="number"
            value={mtbd}
            onChange={(e) => setMtbd(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-[var(--space-3)]">
          <span className="w-24 shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">
            Anticipated BTB
          </span>
          <Checkbox
            checked={abtb}
            onCheckedChange={(checked) => setAbtb(checked === true)}
          />
        </div>
        <Field label="BTB Buffer" htmlFor="res-btb-buffer" layout="horizontal">
          <Input
            id="res-btb-buffer"
            type="number"
            value={btbBuffer}
            onChange={(e) => setBtbBuffer(e.target.value)}
          />
        </Field>

        {/* Random shape ranges — always expanded, laid out as a table:
            modes as row headers, low/mode/high as column headers. */}
        <div className="mt-[var(--space-4)] space-y-[var(--space-2)]">
          <h4 className="text-xs font-medium text-[var(--color-text-secondary)]">
            Random Shape
          </h4>
          <table className="text-xs">
            <thead>
              <tr>
                <th className="pb-1 pr-2" />
                {(["low", "mode", "high"] as const).map((f) => (
                  <th
                    key={f}
                    className="pb-1 px-1 text-center font-medium text-[var(--color-text-muted)]"
                  >
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOTION_MODES.map((mode) => (
                <tr key={mode}>
                  <th
                    scope="row"
                    className="py-1 pr-2 text-left font-medium text-[var(--color-text-secondary)]"
                  >
                    {mode}
                  </th>
                  {(["low", "mode", "high"] as const).map((f) => (
                    <td key={f} className="px-1 py-1">
                      <Input
                        id={`rs-${mode}-${f}`}
                        type="number"
                        value={randShape[mode][f]}
                        onChange={(e) => updateRandShape(mode, f, e.target.value)}
                        className="w-20"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Working Time ─────────────────────────────────────────────── */}
      <Section title="Working Time" {...sectionProps("Working Time", false)}>
        <div className="flex flex-col gap-[var(--space-1)]">
          {workingTime.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No working-time entries yet.
            </p>
          ) : null}
          {workingTime.map((entry) => (
            <div key={entry.id} className="flex items-center gap-[var(--space-2)]">
              <Input
                type="number"
                value={entry.from}
                onChange={(e) =>
                  updateWorkingTimeEntry(entry.id, { from: e.target.value })
                }
                placeholder="From"
                maxLength={4}
                className="w-16 text-xs"
              />
              <Input
                type="number"
                value={entry.to}
                onChange={(e) =>
                  updateWorkingTimeEntry(entry.id, { to: e.target.value })
                }
                placeholder="To"
                maxLength={4}
                className="w-16 text-xs"
              />
              <label className="flex items-center gap-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
                <Checkbox
                  checked={entry.returnToBase}
                  onCheckedChange={(checked) =>
                    updateWorkingTimeEntry(entry.id, {
                      returnToBase: checked === true,
                    })
                  }
                />
                Return
              </label>
              <button
                type="button"
                onClick={() => removeWorkingTimeEntry(entry.id)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                aria-label="Remove entry"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addWorkingTimeEntry}
            className="self-start text-xs text-[var(--color-accent)] hover:underline"
          >
            + Add entry
          </button>
        </div>
      </Section>

      {/* ── Sequencing ────────────────────────────────────────────────── */}
      <Section title="Sequencing" {...sectionProps("Sequencing", false)}>
        {/* Grid option — pill-bar selector populated from Project →
            Design Options, narrowed to those used by at least one
            scenario. The selection (along with Partitions below) scopes
            everything else in this section. */}
        <Field label="Grid option" layout="horizontal">
          {designOptionNames.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] pt-[5px]">
              No grid options used by any scenario. Configure scenarios in Project → Scenarios.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-[var(--space-1)] pt-[5px]">
              {designOptionNames.map((d) => {
                const isActive = d === designOption;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDesignOption(d)}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                      isActive
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Partitions" layout="horizontal">
          {partitionNames.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] pt-[5px]">
              No partitions used by any scenario. Configure scenarios in Project → Scenarios.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-[var(--space-1)] pt-[5px]">
              {partitionNames.map((p) => {
                const isActive = p === sequenceRegioning;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSequenceRegioning(p)}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                      isActive
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                        : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        {/* ── Resource level strip/in-strip partitioning ─────────────── */}
        <h3 className="mt-[var(--space-6)] text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
          Resource level strip/in-strip partitioning
        </h3>
        {(() => {
            const addSequence = () => {
              setSequences((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  label: `Area ${prev.length + 1}`,
                  regions: [],
                  design: "",
                  stripType: "inline",
                  grouping: "",
                  start: "highest",
                  clusterType: "weight",
                  target: "",
                  startCluster: "highest",
                },
              ]);
            };
            if (sequences.length === 0) {
              return (
                <button
                  type="button"
                  onClick={addSequence}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                >
                  <Icon icon={appIcons.plus} size={12} />
                  Add area
                </button>
              );
            }
            return (
              <div className="overflow-x-auto">
                <div
                  className="grid items-start gap-x-[var(--space-3)] gap-y-[var(--space-2)]"
                  // eslint-disable-next-line template/no-jsx-style-prop -- column count is dynamic
                  style={{
                    gridTemplateColumns: `7rem repeat(${sequences.length}, minmax(60px, 110px)) 1.5rem`,
                  }}
                >
                  {/* Header row: empty label cell + area name per column + add */}
                  <div />
                  {sequences.map((seq) => (
                    <StripColumnHeader
                      key={seq.id}
                      label={seq.label}
                      canRemove={sequences.length > 1}
                      onRename={(label) => updateSequence(seq.id, { label })}
                      onRemove={() =>
                        setSequences((prev) => prev.filter((s) => s.id !== seq.id))
                      }
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addSequence}
                    className="mt-[var(--space-1)] flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                    aria-label="Add area"
                  >
                    <Icon icon={appIcons.plus} size={12} />
                  </button>

                  {/* Regions */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Regions
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0 pt-[5px]">
                      <InlineTagSelect
                        options={polygonsForSelectedPartition}
                        value={seq.regions}
                        onChange={(v) => updateSequence(seq.id, { regions: v })}
                      />
                    </div>
                  ))}
                  <div />

                  {/* Design */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Design
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Select
                        id={`seq-design-${seq.id}`}
                        value={seq.design}
                        onChange={(e) =>
                          updateSequence(seq.id, { design: e.target.value })
                        }
                      >
                        <option value="">Select...</option>
                        {designsForSelectedOption.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ))}
                  <div />

                  {/* Strip type */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strip type
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Select
                        value={seq.stripType}
                        onChange={(e) =>
                          updateSequence(seq.id, { stripType: e.target.value })
                        }
                      >
                        <option value="inline">inline</option>
                        <option value="crossline">crossline</option>
                      </Select>
                    </div>
                  ))}
                  <div />

                  {/* Strips merging */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strips merging
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Input
                        id={`seq-group-${seq.id}`}
                        type="number"
                        value={seq.grouping}
                        onChange={(e) =>
                          updateSequence(seq.id, { grouping: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div />

                  {/* Strip start */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strip start
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Select
                        value={seq.start}
                        onChange={(e) =>
                          updateSequence(seq.id, { start: e.target.value })
                        }
                      >
                        <option value="highest">highest</option>
                        <option value="lowest">lowest</option>
                      </Select>
                    </div>
                  ))}
                  <div />

                  {/* Grouping type */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Grouping type
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Select
                        value={seq.clusterType}
                        onChange={(e) =>
                          updateSequence(seq.id, { clusterType: e.target.value })
                        }
                      >
                        <option value="weight">weight</option>
                        <option value="number">number</option>
                        <option value="size">size</option>
                      </Select>
                    </div>
                  ))}
                  <div />

                  {/* Grouping target */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Grouping target
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Input
                        id={`seq-target-${seq.id}`}
                        type="number"
                        value={seq.target}
                        onChange={(e) =>
                          updateSequence(seq.id, { target: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div />

                  {/* Group start */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Group start
                  </label>
                  {sequences.map((seq) => (
                    <div key={seq.id} className="min-w-0">
                      <Select
                        value={seq.startCluster}
                        onChange={(e) =>
                          updateSequence(seq.id, { startCluster: e.target.value })
                        }
                      >
                        <option value="highest">highest</option>
                        <option value="lowest">lowest</option>
                      </Select>
                    </div>
                  ))}
                  <div />
                </div>
              </div>
            );
          })()}
      </Section>

      {/* ── Terrain ───────────────────────────────────────────────────── */}
      <Section title="Terrain" {...sectionProps("Terrain", false)}>
        {/* Camps Definition */}
        <Section
          title="Camps Definition"
          variant="secondary"
          collapsible={false}
        >
          <Field label="Map" htmlFor="camp-mapper" layout="horizontal">
            <Select
              id="camp-mapper"
              value={campMapper}
              onChange={(e) => setCampMapper(e.target.value)}
            >
              <option value="">Select...</option>
              {availableMaps.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>

          <Field label="POI vs Region" layout="horizontal">
            <div className="space-y-1">
              {campMappingEntries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-[var(--space-2)]">
                  <Select
                    value={entry.key}
                    onChange={(e) => updateCampEntry(idx, { key: e.target.value })}
                    className="w-28"
                  >
                    <option value="">POI...</option>
                    {availablePois.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                  <Select
                    value={entry.value}
                    onChange={(e) => updateCampEntry(idx, { value: e.target.value })}
                  >
                    <option value="">Layer...</option>
                    {selectedMapLayers.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </Select>
                  {campMappingEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCampEntry(idx)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addCampEntry}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                + Add entry
              </button>
            </div>
          </Field>

          <Field label="POI Start" htmlFor="camp-start" layout="horizontal">
            <Select
              id="camp-start"
              value={campStart}
              onChange={(e) => setCampStart(e.target.value)}
            >
              <option value="">Select...</option>
              {availablePois.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </Section>

        {/* Mapping Modes */}
        <Section
          title="Mapping Modes"
          variant="secondary"
          collapsible={false}
          className="mt-[var(--space-4)]"
        >
          {MAPPING_MODE_KEYS.map((key) => (
            <Field key={key} label={key} layout="horizontal">
              <Select
                value={mappingModes[key]}
                onChange={(e) =>
                  setMappingModes((prev) => ({ ...prev, [key]: e.target.value as MotionMode }))
                }
              >
                {MOTION_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
          ))}
        </Section>
      </Section>
    </div>
  );
}
