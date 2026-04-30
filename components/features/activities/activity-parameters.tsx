"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EditableMatrix } from "./editable-matrix";
import { InlineTagSelect } from "./inline-tag-select";
import { Section } from "./section";
import { StripColumnHeader } from "./strip-column-header";
import type {
  Activity,
  ActivityParameters,
  ActivityScenarioBucket,
  ActivitySequenceDef,
  ActivityStripDef,
} from "@/services/api/activities";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { useSectionOpenStates } from "@/lib/use-section-open-states";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Live data sources — pulled from sibling sections of the same project      */
/* -------------------------------------------------------------------------- */

interface ActivitiesSectionData {
  items: Activity[];
  nextId: number;
}
const DEFAULT_ACTIVITIES_SECTION: ActivitiesSectionData = {
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
      resources: Array<{ name: string }>;
    }>;
  }>;
  activeId: string;
}
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

/** Mirror of the shape persisted by `project-design-options.tsx`. We only
 *  read the fields needed to populate the dropdowns / radio list. */
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

/** Mirror of the shape persisted by `project-partitions.tsx`. We read the
 *  group names for the Partitions dropdown and the per-group `polygons`
 *  list so the strip/sequence Regions selectors can show the regions
 *  belonging to whichever partition the activity has chosen. */
interface PartitioningSectionData {
  groups: Array<{ id: string; name: string; polygons: string[] }>;
  activeId: string;
}
const DEFAULT_PARTITIONING_SECTION: PartitioningSectionData = {
  groups: [],
  activeId: "",
};

/** Mirror of the shape persisted by Project → Scenarios. We narrow the
 *  Grid option / Partitions selectors here to only the values actually
 *  used by at least one scenario, so the activity form stays in sync with
 *  the project's chosen scenarios. */
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

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

function defaultScenarioBucket(): ActivityScenarioBucket {
  return {
    masterDesign: "",
    strips: [],
    sequences: [],
  };
}

function defaultParameters(): ActivityParameters {
  return {
    description: "",
    pType: "s",
    baseMap: "",
    allocation: {},
    slipTimes: {},
    designOption: "",
    sequenceRegioning: "",
    scenarios: {},
    motion: {
      gid_ttype_shift: "",
      gid_swath_shift: "",
      buffer_len_min: "",
      buffer_len_max: "",
      gid_sub_shift: "",
    },
    dynamicMappingKw: "",
  };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ActivityParameters({
  activityName,
  activitySlug,
}: {
  activityName: string;
  /** Optional — if set, parameters are persisted to this activity's registry entry. */
  activitySlug?: string;
}) {
  // ──────────────────────────────────────────────────────────────────────
  // State strategy: same as the Project pages (project-crew.tsx, etc.).
  // `useSectionData` IS the source of truth — no local React.useState,
  // no separate persist effect. Every field setter writes the patched
  // entry back through `update`, which optimistically refreshes the
  // cache and debounce-saves to the backend.
  // ──────────────────────────────────────────────────────────────────────
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: activitiesSection, update: updateActivitiesSection } =
    useSectionData<ActivitiesSectionData>(
      projectId,
      "activities",
      DEFAULT_ACTIVITIES_SECTION,
    );
  const entry = activitySlug
    ? activitiesSection.items.find((a) => a.slug === activitySlug)
    : undefined;

  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );

  const { data: designOptionsSection } = useSectionData<DesignOptionsSectionData>(
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

  // Parameters live in the section. We compute a defaults-merged view per
  // render so every field always has a defined initial value even if the
  // entry's stored params predate a newly-added field.
  const parameters: ActivityParameters = React.useMemo(() => {
    const raw = (entry?.parameters ?? {}) as Record<string, unknown>;
    const merged: ActivityParameters = {
      ...defaultParameters(),
      ...(raw as Partial<ActivityParameters>),
    };
    // Defensive: stored data may be a partial Record, ensure scenarios is
    // an object so the lookups below never crash.
    if (!merged.scenarios || typeof merged.scenarios !== "object") {
      merged.scenarios = {};
    }
    // One-shot migration from the old flat shape. If `scenarios` is empty
    // but the legacy `masterDesign` / `strips` / `sequences` fields are
    // present on disk, materialise a single bucket keyed by the current
    // (designOption|sequenceRegioning) pair so users don't lose their
    // existing sequencing configuration.
    if (Object.keys(merged.scenarios).length === 0) {
      const oldMaster =
        typeof raw.masterDesign === "string" ? raw.masterDesign : "";
      const oldStrips = Array.isArray(raw.strips)
        ? (raw.strips as ActivityStripDef[])
        : [];
      const oldSequences = Array.isArray(raw.sequences)
        ? (raw.sequences as ActivitySequenceDef[])
        : [];
      if (oldMaster || oldStrips.length > 0 || oldSequences.length > 0) {
        const key = `${merged.designOption}|${merged.sequenceRegioning}`;
        merged.scenarios = {
          [key]: {
            masterDesign: oldMaster,
            strips: oldStrips,
            sequences: oldSequences,
          },
        };
      }
    }
    return merged;
  }, [entry?.parameters]);

  // Patch helper — applies an update to a single key, writes the new
  // entry back into the section, and lets `useSectionData` debounce the
  // save. Reads `live` data directly from the React Query cache (rather
  // than the closed-over render snapshot) so back-to-back edits within a
  // single render stack correctly.
  const setParameters = React.useCallback(
    (updater: React.SetStateAction<ActivityParameters>) => {
      if (!activitySlug) return;
      const live = activitiesSection;
      const target = live.items.find((a) => a.slug === activitySlug);
      if (!target) return;
      const prev: ActivityParameters = {
        ...defaultParameters(),
        ...(target.parameters ?? {}),
      };
      const next =
        typeof updater === "function"
          ? (updater as (v: ActivityParameters) => ActivityParameters)(prev)
          : updater;
      updateActivitiesSection({
        ...live,
        items: live.items.map((a) =>
          a.slug === activitySlug ? { ...a, parameters: next } : a,
        ),
      });
    },
    [activitySlug, activitiesSection, updateActivitiesSection],
  );

  // Helper: per-key setter that supports both bare values and the React
  // functional updater form. Keeps the JSX below identical to the previous
  // useState-based version.
  function field<K extends keyof ActivityParameters>(
    key: K,
  ): [
    ActivityParameters[K],
    (value: React.SetStateAction<ActivityParameters[K]>) => void,
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
                    v: ActivityParameters[K],
                  ) => ActivityParameters[K]
                )(prev[key])
              : updater,
        })),
    ];
  }

  // Helper for fields scoped to the (Grid option, Partition) bucket.
  // The key composition (`${designOption}|${sequenceRegioning}`) is read at
  // setter call time via `setParameters((prev) => …)` so writes always land
  // in the bucket selected by the current dropdowns.
  function bucketField<K extends keyof ActivityScenarioBucket>(
    key: K,
  ): [
    ActivityScenarioBucket[K],
    (value: React.SetStateAction<ActivityScenarioBucket[K]>) => void,
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
                    v: ActivityScenarioBucket[K],
                  ) => ActivityScenarioBucket[K]
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

  // General Information — name lives on the entry (renamed from the
  // sidebar) and shows up in the page title, so it's not a form field
  // here anymore.
  const [description, setDescription] = field("description");
  const [pType, setPType] = field("pType");

  // Slip Times
  const [slipTimes, setSlipTimes] = field("slipTimes");

  // Resources for this activity come from the active crew option — used as
  // the labels in Slip Times. (Allocation moved to Crew/Motion and
  // Working Time moved to the per-resource page, since both are intrinsic
  // to the resource, not the activity.)
  const resourceOptions = React.useMemo(() => {
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return [];
    const act = opt.activities.find((a) => a.name === activityName);
    return act ? act.resources.map((r) => r.name) : [];
  }, [crewSection, activityName]);

  // Default every Slip-Times cell to "0" so the matrix visually starts at
  // zero without any user action. Only `null`/`undefined` cells are filled
  // (`?? "0"` only replaces missing values) — an empty string the user
  // typed explicitly is preserved. When the user edits any cell, the
  // matrix's change handler shallow-copies this filled view, so the zeros
  // for the other cells get persisted alongside the edit.
  const slipTimesView = React.useMemo<
    Record<string, Record<string, string>>
  >(() => {
    if (resourceOptions.length === 0) return slipTimes;
    const out: Record<string, Record<string, string>> = {};
    for (const row of resourceOptions) {
      const rowVal: Record<string, string> = {};
      for (const col of resourceOptions) {
        rowVal[col] = slipTimes[row]?.[col] ?? "0";
      }
      out[row] = rowVal;
    }
    return out;
  }, [slipTimes, resourceOptions]);

  // Sequencing
  const [designOption, setDesignOption] = field("designOption");
  // `sequenceRegioning` is the underlying field; the UI now labels it
  // "Partitions" and is populated from the project's partitioning section.
  const [sequenceRegioning, setSequenceRegioning] = field("sequenceRegioning");

  // Active sequencing bucket — keyed by the (Grid option, Partition) pair.
  // Switching either pill swaps in the bucket for the new pair (or the
  // default bucket if none has been written yet).
  const currentScenarioKey = `${designOption}|${sequenceRegioning}`;
  const currentBucket: ActivityScenarioBucket =
    parameters.scenarios[currentScenarioKey] ?? defaultScenarioBucket();
  const [masterDesign, setMasterDesign] = bucketField("masterDesign");

  // Names actually used by at least one scenario (Project → Scenarios).
  // We narrow the Grid option and Partitions pickers to these so the
  // activity form only offers values the project has committed to.
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

  // Available design-option names — Project → Design Options, filtered
  // to those used in at least one scenario.
  const designOptionNames = React.useMemo(
    () =>
      designOptionsSection.options
        .map((o) => o.name)
        .filter((n) => usedGridOptions.has(n)),
    [designOptionsSection.options, usedGridOptions],
  );

  // Designs belonging to the currently-selected design option. Pulled from
  // that option's `rows[].design`, deduplicated, dropping empty values. The
  // "Master design" radio list iterates over this.
  const designsForSelectedOption = React.useMemo(() => {
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
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- `designOption` is a stable string snapshot from `parameters`
  }, [designOptionsSection, designOption]);

  // Available partition (region group) names — Project → Partitions,
  // filtered to those used in at least one scenario.
  const partitionNames = React.useMemo(
    () =>
      partitioningSection.groups
        .map((g) => g.name)
        .filter((n) => usedPartitions.has(n)),
    [partitioningSection.groups, usedPartitions],
  );

  // Polygons that belong to the activity's currently-selected partition.
  // Strip/sequence Regions selectors use this in place of the old dummy
  // polygons list. If no partition is chosen yet the list is empty —
  // letting the InlineTagSelect render with no available tags rather than
  // showing a stale dummy palette.
  const polygonsForSelectedPartition = React.useMemo(() => {
    const grp = partitioningSection.groups.find(
      (g) => g.name === sequenceRegioning,
    );
    return grp?.polygons ?? [];
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- `sequenceRegioning` is a stable string snapshot from `parameters`
  }, [partitioningSection, sequenceRegioning]);

  // Auto-select the first design as master whenever the current selection
  // isn't valid for the chosen design option — covers both "nothing
  // picked yet" and "design option just changed and the previous master is
  // no longer in the list". Only writes when the persisted activity entry
  // exists, so we don't churn the cache on the empty pre-load render.
  React.useEffect(() => {
    if (!entry) return;
    if (designsForSelectedOption.length === 0) return;
    if (masterDesign && designsForSelectedOption.includes(masterDesign)) return;
    setMasterDesign(designsForSelectedOption[0]);
  }, [entry, designsForSelectedOption, masterDesign, setMasterDesign]);

  // Base Strips — scoped to the active scenario bucket. Rendered as a
  // column-per-area table below so all strips are visible at once.
  const [strips, setStrips] = bucketField("strips");

  // Sequences — scoped to the active scenario bucket. Rendered as a
  // column-per-area table below so all sequences are visible at once.
  const [sequences, setSequences] = bucketField("sequences");

  // Motion
  const [motion, setMotion] = field("motion");

  // Dynamic
  const [dynamicMappingKw, setDynamicMappingKw] = field("dynamicMappingKw");

  const updateStrip = (id: string, patch: Partial<ActivityStripDef>) => {
    setStrips((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateSequence = (id: string, patch: Partial<ActivitySequenceDef>) => {
    setSequences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  // Persisted open/closed state for the collapsible sections below — kept
  // in localStorage so it survives the remount that happens when the user
  // switches activities (the page passes `key={slug}` to this component).
  const sectionStates = useSectionOpenStates(
    "seiseye.activity-parameters.sections",
  );
  const sectionProps = (title: string, defaultOpen: boolean) => ({
    open: sectionStates.isOpen(title, defaultOpen),
    onToggle: (next: boolean) => sectionStates.setOpen(title, next),
  });

  return (
    <div className="space-y-[var(--space-2)]">
      {/* ── General Information ───────────────────────────────────────── */}
      <Section title="General Information" {...sectionProps("General Information", true)}>
        <Field label="Description" htmlFor="act-desc" layout="horizontal">
          <Input
            id="act-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={25}
          />
        </Field>
        <Field label="Point Type" layout="horizontal">
          <div className="flex items-center gap-[var(--space-4)]">
            {([["r", "Receivers"], ["s", "Sources"]] as const).map(([val, label]) => (
              <label key={val} className="flex items-center gap-[var(--space-2)] text-sm text-[var(--color-text-primary)]">
                <Checkbox
                  checked={pType === val}
                  onCheckedChange={() => setPType(val)}
                />
                {label}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      {/* ── Slip Times ────────────────────────────────────────────────── */}
      <Section title="Slip Times" {...sectionProps("Slip Times", false)}>
        {resourceOptions.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No resources point to this activity.
          </p>
        ) : (
          <EditableMatrix
            labels={resourceOptions}
            value={slipTimesView}
            onChange={setSlipTimes}
          />
        )}
      </Section>

      {/* ── Sequencing ────────────────────────────────────────────────── */}
      <Section title="Sequencing" {...sectionProps("Sequencing", false)}>
        {/* Grid option — pill-bar selector populated from Project → Design
            Options. The selection (along with Partitions below) scopes
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
        {/* Partitions — pill-bar selector populated from Project →
            Partitions. The underlying field is still `sequenceRegioning`
            so existing saved data continues to round-trip. */}
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

        {/* ── Activity level strip partitioning ───────────────────────── */}
        <Section
          title="Activity level strip partitioning"
          variant="secondary"
          collapsible={false}
          className="mt-[var(--space-6)]"
        >
          {/* Master design — radio buttons over the designs that belong to
              the currently-selected grid option (deduped from its rows).
              Pick one; that name is persisted to `parameters.masterDesign`. */}
          <Field label="Master design" layout="horizontal" labelWidth="7rem">
            {designsForSelectedOption.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                {designOption
                  ? "Selected grid option has no designs."
                  : "Select a grid option to choose its master."}
              </p>
            ) : (
              <div className="flex flex-row flex-wrap items-center gap-x-[var(--space-4)] gap-y-[var(--space-2)] pt-[5px]">
                {designsForSelectedOption.map((d) => (
                  <label
                    key={d}
                    className="flex items-center gap-[var(--space-2)] text-sm text-[var(--color-text-primary)]"
                  >
                    <input
                      type="radio"
                      name={`master-design-${activitySlug ?? "_"}`}
                      value={d}
                      checked={masterDesign === d}
                      onChange={() => setMasterDesign(d)}
                      className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                    />
                    {d}
                  </label>
                ))}
              </div>
            )}
          </Field>
          {/* One column per area, label column on the left. The whole grid
              scrolls horizontally if the user keeps adding areas so we
              never get overflow into the page chrome. */}
          {(() => {
            const addStrip = () => {
              setStrips((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  label: `Area ${prev.length + 1}`,
                  regions: [],
                  design: "",
                  stripType: "inline",
                  grouping: "",
                  start: "highest",
                },
              ]);
            };
            if (strips.length === 0) {
              return (
                <button
                  type="button"
                  onClick={addStrip}
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
                    gridTemplateColumns: `7rem repeat(${strips.length}, minmax(60px, 110px)) 1.5rem`,
                  }}
                >
                  {/* Header row: empty label cell + area name per column + add */}
                  <div />
                  {strips.map((strip) => (
                    <StripColumnHeader
                      key={strip.id}
                      label={strip.label}
                      canRemove={strips.length > 1}
                      onRename={(label) => updateStrip(strip.id, { label })}
                      onRemove={() =>
                        setStrips((prev) => prev.filter((s) => s.id !== strip.id))
                      }
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addStrip}
                    className="mt-[var(--space-1)] flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
                    aria-label="Add area"
                  >
                    <Icon icon={appIcons.plus} size={12} />
                  </button>

                  {/* Regions */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Regions
                  </label>
                  {strips.map((strip) => (
                    <div key={strip.id} className="min-w-0 pt-[5px]">
                      <InlineTagSelect
                        options={polygonsForSelectedPartition}
                        value={strip.regions}
                        onChange={(v) => updateStrip(strip.id, { regions: v })}
                      />
                    </div>
                  ))}
                  <div />

                  {/* Strip type */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strip type
                  </label>
                  {strips.map((strip) => (
                    <div key={strip.id} className="min-w-0">
                      <Select
                        value={strip.stripType}
                        onChange={(e) =>
                          updateStrip(strip.id, { stripType: e.target.value })
                        }
                      >
                        <option value="inline">inline</option>
                        <option value="crossline">crossline</option>
                      </Select>
                    </div>
                  ))}
                  <div />

                  {/* Strip grouping */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strip grouping
                  </label>
                  {strips.map((strip) => (
                    <div key={strip.id} className="min-w-0">
                      <Input
                        id={`strip-group-${strip.id}`}
                        type="number"
                        value={strip.grouping}
                        onChange={(e) =>
                          updateStrip(strip.id, { grouping: e.target.value })
                        }
                      />
                    </div>
                  ))}
                  <div />

                  {/* Strip start */}
                  <label className="pt-[7px] text-xs font-medium text-[var(--color-text-secondary)]">
                    Strip start
                  </label>
                  {strips.map((strip) => (
                    <div key={strip.id} className="min-w-0">
                      <Select
                        value={strip.start}
                        onChange={(e) =>
                          updateStrip(strip.id, { start: e.target.value })
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

        {/* ── In-strip partitioning ──────────────────────────────────── */}
        <Section
          title="Resource level strip/in-strip partitioning"
          tooltip="Default configuration to be applied at resource level when it does not have its own specific partitioning parameters."
          variant="secondary"
          collapsible={false}
          className="mt-[var(--space-6)]"
        >
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
      </Section>

      {/* ── Motion ────────────────────────────────────────────────────── */}
      <Section title="Motion" {...sectionProps("Motion", false)}>
        {(
          [
            ["gid_ttype_shift", "gid_ttype_shift"],
            ["gid_swath_shift", "gid_swath_shift"],
            ["buffer_len_min", "buffer_len min"],
            ["buffer_len_max", "buffer_len max"],
            ["gid_sub_shift", "gid_sub_shift"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`motion-${key}`} layout="horizontal">
            <Input
              id={`motion-${key}`}
              type="number"
              value={motion[key]}
              onChange={(e) => setMotion((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </Field>
        ))}
      </Section>

      {/* ── Dynamic ───────────────────────────────────────────────────── */}
      <Section title="Dynamic" {...sectionProps("Dynamic", false)}>
        <Field label="dynamic_mapping_kw" htmlFor="act-dyn-kw" layout="horizontal">
          <Input
            id="act-dyn-kw"
            value={dynamicMappingKw}
            onChange={(e) => setDynamicMappingKw(e.target.value)}
          />
        </Field>
      </Section>
    </div>
  );
}
