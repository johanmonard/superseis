"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CheckboxMatrix } from "./checkbox-matrix";
import { EditableMatrix } from "./editable-matrix";
import { InlineTagSelect } from "./inline-tag-select";
import { Section } from "./section";
import { TabbedPanel } from "./tabbed-panel";
import type {
  Activity,
  ActivityParameters,
  ActivitySequenceDef,
  ActivityStripDef,
  ActivityTimeEntry,
} from "@/services/api/activities";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";

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

interface MapsSectionData {
  maps: Array<{ id: string; name: string; layers: string[] }>;
  activeId: string;
}
const DEFAULT_MAPS_SECTION: MapsSectionData = { maps: [], activeId: "" };

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

/* -------------------------------------------------------------------------- */
/*  Dummy option data — to be replaced incrementally as the form gets wired   */
/* -------------------------------------------------------------------------- */

const DUMMY_DESIGN_GROUPS = ["Design Group A", "Design Group B"];
const DUMMY_MASTER_DESIGNS = ["Master 1", "Master 2", "Master 3"];
const DUMMY_REGIONING_GROUPS = ["Region Group North", "Region Group South"];
const DUMMY_POLYGONS = ["Polygon A", "Polygon B", "Polygon C", "Polygon D"];

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

function defaultStrip(): ActivityStripDef {
  return {
    id: crypto.randomUUID(),
    label: "Strip 1",
    regions: [],
    design: "",
    stripType: "inline",
    grouping: "",
    start: "highest",
  };
}

function defaultSequence(): ActivitySequenceDef {
  return {
    id: crypto.randomUUID(),
    label: "Seq 1",
    regions: [],
    design: "",
    stripType: "inline",
    grouping: "",
    start: "highest",
    clusterType: "weight",
    target: "",
    startCluster: "highest",
  };
}

function defaultParameters(): ActivityParameters {
  return {
    description: "",
    pType: "s",
    baseMap: "",
    allocation: {},
    slipTimes: {},
    timetables: {},
    designOption: "",
    masterDesign: "",
    sequenceRegioning: "",
    strips: [defaultStrip()],
    sequences: [defaultSequence()],
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
  // State strategy: same as the Settings pages (project-crew.tsx, etc.).
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

  const { data: mapsSection } = useSectionData<MapsSectionData>(
    projectId,
    "maps",
    DEFAULT_MAPS_SECTION,
  );
  const availableMaps = mapsSection.maps;
  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );

  // Parameters live in the section. We compute a defaults-merged view per
  // render so every field always has a defined initial value even if the
  // entry's stored params predate a newly-added field.
  const parameters: ActivityParameters = React.useMemo(
    () => ({ ...defaultParameters(), ...(entry?.parameters ?? {}) }),
    [entry?.parameters],
  );

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

  // General Information
  const [name, setName] = React.useState(activityName);
  React.useEffect(() => setName(activityName), [activityName]);
  const [description, setDescription] = field("description");
  const [pType, setPType] = field("pType");

  // Resources
  const [baseMap, setBaseMap] = field("baseMap");
  const [allocation, setAllocation] = field("allocation");

  // Slip Times
  const [slipTimes, setSlipTimes] = field("slipTimes");

  // Timetables
  const [timetables, setTimetables] = field("timetables");

  // Derived option lists. `layerOptions` follows the selected base map;
  // `resourceOptions` lists all resources whose `parameters.activity`
  // matches the activity name we're editing.
  const selectedMap = React.useMemo(
    () => availableMaps.find((m) => m.name === parameters.baseMap),
    [availableMaps, parameters.baseMap],
  );
  const layerOptions = selectedMap?.layers ?? [];
  // Resources for this activity come from the active crew option — that's
  // the canonical mapping. (We deliberately don't filter the registry by
  // any per-resource `activity` field; the crew page is the source of truth.)
  const resourceOptions = React.useMemo(() => {
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return [];
    const act = opt.activities.find((a) => a.name === activityName);
    return act ? act.resources.map((r) => r.name) : [];
  }, [crewSection, activityName]);

  const [expandedResource, setExpandedResource] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    setExpandedResource((prev) =>
      prev && resourceOptions.includes(prev) ? prev : resourceOptions[0] ?? null,
    );
  }, [resourceOptions]);

  // Sequencing
  const [designOption, setDesignOption] = field("designOption");
  const [masterDesign, setMasterDesign] = field("masterDesign");
  const [sequenceRegioning, setSequenceRegioning] = field("sequenceRegioning");

  // Base Strips
  const [strips, setStrips] = field("strips");
  const [activeStripId, setActiveStripId] = React.useState<string | null>(
    parameters.strips[0]?.id ?? null,
  );

  // Sequences
  const [sequences, setSequences] = field("sequences");
  const [activeSeqId, setActiveSeqId] = React.useState<string | null>(
    parameters.sequences[0]?.id ?? null,
  );

  // Motion
  const [motion, setMotion] = field("motion");

  // Dynamic
  const [dynamicMappingKw, setDynamicMappingKw] = field("dynamicMappingKw");

  /* Helpers */
  const addTimeEntry = (resource: string) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: [
        ...(prev[resource] ?? []),
        { id: crypto.randomUUID(), from: "", to: "", returnToBase: false },
      ],
    }));
  };

  const updateTimeEntry = (
    resource: string,
    id: string,
    patch: Partial<ActivityTimeEntry>,
  ) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: (prev[resource] ?? []).map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
  };

  const removeTimeEntry = (resource: string, id: string) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: (prev[resource] ?? []).filter((e) => e.id !== id),
    }));
  };

  const updateStrip = (id: string, patch: Partial<ActivityStripDef>) => {
    setStrips((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateSequence = (id: string, patch: Partial<ActivitySequenceDef>) => {
    setSequences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  return (
    <div className="space-y-[var(--space-2)]">
      {/* ── General Information ───────────────────────────────────────── */}
      <Section title="General Information">
        <Field label="Name" htmlFor="act-name" layout="horizontal">
          <Input
            id="act-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={15}
          />
        </Field>
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

      {/* ── Resources ─────────────────────────────────────────────────── */}
      <Section title="Resources">
        <Field label="Base Map" htmlFor="act-basemap" layout="horizontal">
          <Select id="act-basemap" value={baseMap} onChange={(e) => setBaseMap(e.target.value)}>
            <option value="">Select...</option>
            {availableMaps.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Allocation" layout="horizontal">
          {layerOptions.length === 0 || resourceOptions.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              {layerOptions.length === 0
                ? "Select a Base Map to populate rows."
                : "No resources point to this activity."}
            </p>
          ) : (
            <CheckboxMatrix
              rows={layerOptions}
              columns={resourceOptions}
              value={allocation}
              onChange={setAllocation}
            />
          )}
        </Field>
      </Section>

      {/* ── Slip Times ────────────────────────────────────────────────── */}
      <Section title="Slip Times" defaultOpen={false}>
        {resourceOptions.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No resources point to this activity.
          </p>
        ) : (
          <EditableMatrix
            labels={resourceOptions}
            value={slipTimes}
            onChange={setSlipTimes}
          />
        )}
      </Section>

      {/* ── Timetables ────────────────────────────────────────────────── */}
      <Section title="Timetables" defaultOpen={false}>
        {resourceOptions.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No resources point to this activity.
          </p>
        ) : null}
        {resourceOptions.map((resource) => (
          <div key={resource}>
            <button
              type="button"
              onClick={() =>
                setExpandedResource((prev) => (prev === resource ? null : resource))
              }
              className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <span>{resource}</span>
              <span className="text-[var(--color-text-muted)]">
                {timetables[resource]?.length ?? 0} entries
              </span>
            </button>
            {expandedResource === resource && (
              <div className="mt-1 space-y-1 pl-[var(--space-2)]">
                {timetables[resource]?.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={entry.from}
                      onChange={(e) => updateTimeEntry(resource, entry.id, { from: e.target.value })}
                      placeholder="From"
                      maxLength={2}
                      className="w-16 text-xs"
                    />
                    <Input
                      type="number"
                      value={entry.to}
                      onChange={(e) => updateTimeEntry(resource, entry.id, { to: e.target.value })}
                      placeholder="To"
                      maxLength={2}
                      className="w-16 text-xs"
                    />
                    <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                      <Checkbox
                        checked={entry.returnToBase}
                        onCheckedChange={(checked) =>
                          updateTimeEntry(resource, entry.id, { returnToBase: checked === true })
                        }
                      />
                      Return
                    </label>
                    <button
                      type="button"
                      onClick={() => removeTimeEntry(resource, entry.id)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-status-danger)]"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addTimeEntry(resource)}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  + Add entry
                </button>
              </div>
            )}
          </div>
        ))}
      </Section>

      {/* ── Sequencing ────────────────────────────────────────────────── */}
      <Section title="Sequencing" defaultOpen={false}>
        <Field label="Design option" htmlFor="act-design-opt" layout="horizontal">
          <Select id="act-design-opt" value={designOption} onChange={(e) => setDesignOption(e.target.value)}>
            <option value="">Select...</option>
            {DUMMY_DESIGN_GROUPS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Master design" htmlFor="act-master" layout="horizontal">
          <Select id="act-master" value={masterDesign} onChange={(e) => setMasterDesign(e.target.value)}>
            <option value="">Select...</option>
            {DUMMY_MASTER_DESIGNS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sequence regioning" htmlFor="act-seq-reg" layout="horizontal">
          <Select id="act-seq-reg" value={sequenceRegioning} onChange={(e) => setSequenceRegioning(e.target.value)}>
            <option value="">Select...</option>
            {DUMMY_REGIONING_GROUPS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>

        {/* ── Base Strips Definition ──────────────────────────────────── */}
        <Section title="Base Strips Definition" defaultOpen={false} variant="secondary" className="mt-[var(--space-6)]">
          <TabbedPanel
            items={strips}
            activeId={activeStripId}
            onSelect={setActiveStripId}
            onAdd={() => {
              const id = crypto.randomUUID();
              setStrips((prev) => [
                ...prev,
                { id, label: `Strip ${prev.length + 1}`, regions: [], design: "", stripType: "inline", grouping: "", start: "highest" },
              ]);
              setActiveStripId(id);
            }}
            onRemove={(id) => {
              setStrips((prev) => prev.filter((s) => s.id !== id));
              setActiveStripId((prev) => (prev === id ? strips[0]?.id ?? null : prev));
            }}
          >
            {(strip) => (
              <div className="space-y-[var(--space-3)]">
                <Field label="Regions" layout="horizontal">
                  <InlineTagSelect
                    options={DUMMY_POLYGONS}
                    value={strip.regions}
                    onChange={(v) => updateStrip(strip.id, { regions: v })}
                  />
                </Field>
                <Field label="Design" htmlFor={`strip-design-${strip.id}`} layout="horizontal">
                  <Select
                    id={`strip-design-${strip.id}`}
                    value={strip.design}
                    onChange={(e) => updateStrip(strip.id, { design: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {DUMMY_MASTER_DESIGNS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Strip-type" layout="horizontal">
                  <Select
                    value={strip.stripType}
                    onChange={(e) => updateStrip(strip.id, { stripType: e.target.value })}
                  >
                    <option value="inline">inline</option>
                    <option value="crossline">crossline</option>
                  </Select>
                </Field>
                <Field label="Grouping" htmlFor={`strip-group-${strip.id}`} layout="horizontal">
                  <Input
                    id={`strip-group-${strip.id}`}
                    type="number"
                    value={strip.grouping}
                    onChange={(e) => updateStrip(strip.id, { grouping: e.target.value })}
                  />
                </Field>
                <Field label="Start" layout="horizontal">
                  <Select
                    value={strip.start}
                    onChange={(e) => updateStrip(strip.id, { start: e.target.value })}
                  >
                    <option value="highest">highest</option>
                    <option value="lowest">lowest</option>
                  </Select>
                </Field>
              </div>
            )}
          </TabbedPanel>
        </Section>

        {/* ── Sequences Definition ────────────────────────────────────── */}
        <Section title="Sequences Definition" defaultOpen={false} variant="secondary" className="mt-[var(--space-6)]">
          <TabbedPanel
            items={sequences}
            activeId={activeSeqId}
            onSelect={setActiveSeqId}
            onAdd={() => {
              const id = crypto.randomUUID();
              setSequences((prev) => [
                ...prev,
                { id, label: `Seq ${prev.length + 1}`, regions: [], design: "", stripType: "inline", grouping: "", start: "highest", clusterType: "weight", target: "", startCluster: "highest" },
              ]);
              setActiveSeqId(id);
            }}
            onRemove={(id) => {
              setSequences((prev) => prev.filter((s) => s.id !== id));
              setActiveSeqId((prev) => (prev === id ? sequences[0]?.id ?? null : prev));
            }}
          >
            {(seq) => (
              <div className="space-y-[var(--space-3)]">
                <Field label="Regions" layout="horizontal">
                  <InlineTagSelect
                    options={DUMMY_POLYGONS}
                    value={seq.regions}
                    onChange={(v) => updateSequence(seq.id, { regions: v })}
                  />
                </Field>
                <Field label="Design" htmlFor={`seq-design-${seq.id}`} layout="horizontal">
                  <Select
                    id={`seq-design-${seq.id}`}
                    value={seq.design}
                    onChange={(e) => updateSequence(seq.id, { design: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {DUMMY_MASTER_DESIGNS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Strip-type" layout="horizontal">
                  <Select
                    value={seq.stripType}
                    onChange={(e) => updateSequence(seq.id, { stripType: e.target.value })}
                  >
                    <option value="inline">inline</option>
                    <option value="crossline">crossline</option>
                  </Select>
                </Field>
                <Field label="Grouping" htmlFor={`seq-group-${seq.id}`} layout="horizontal">
                  <Input
                    id={`seq-group-${seq.id}`}
                    type="number"
                    value={seq.grouping}
                    onChange={(e) => updateSequence(seq.id, { grouping: e.target.value })}
                  />
                </Field>
                <Field label="Start" layout="horizontal">
                  <Select
                    value={seq.start}
                    onChange={(e) => updateSequence(seq.id, { start: e.target.value })}
                  >
                    <option value="highest">highest</option>
                    <option value="lowest">lowest</option>
                  </Select>
                </Field>
                <Field label="Cluster-type" layout="horizontal">
                  <Select
                    value={seq.clusterType}
                    onChange={(e) => updateSequence(seq.id, { clusterType: e.target.value })}
                  >
                    <option value="weight">weight</option>
                    <option value="number">number</option>
                    <option value="size">size</option>
                  </Select>
                </Field>
                <Field label="Target" htmlFor={`seq-target-${seq.id}`} layout="horizontal">
                  <Input
                    id={`seq-target-${seq.id}`}
                    type="number"
                    value={seq.target}
                    onChange={(e) => updateSequence(seq.id, { target: e.target.value })}
                  />
                </Field>
                <Field label="Start (cluster)" layout="horizontal">
                  <Select
                    value={seq.startCluster}
                    onChange={(e) => updateSequence(seq.id, { startCluster: e.target.value })}
                  >
                    <option value="highest">highest</option>
                    <option value="lowest">lowest</option>
                  </Select>
                </Field>
              </div>
            )}
          </TabbedPanel>
        </Section>
      </Section>

      {/* ── Motion ────────────────────────────────────────────────────── */}
      <Section title="Motion" defaultOpen={false}>
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
      <Section title="Dynamic" defaultOpen={false}>
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
