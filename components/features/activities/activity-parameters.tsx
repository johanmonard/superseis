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

/* -------------------------------------------------------------------------- */
/*  Dummy option data — replace with real queries when backend is ready       */
/* -------------------------------------------------------------------------- */

const DUMMY_MAPS = ["Base Map A", "Base Map B", "Topographic"];
const DUMMY_LAYERS = ["Roads", "Rivers", "Exclusion Zones", "Elevation"];
const DUMMY_RESOURCES = ["Crew 1", "Crew 2", "Crew 3"];
const DUMMY_DESIGN_GROUPS = ["Design Group A", "Design Group B"];
const DUMMY_MASTER_DESIGNS = ["Master 1", "Master 2", "Master 3"];
const DUMMY_REGIONING_GROUPS = ["Region Group North", "Region Group South"];
const DUMMY_POLYGONS = ["Polygon A", "Polygon B", "Polygon C", "Polygon D"];

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type TimeEntry = {
  id: string;
  from: string;
  to: string;
  returnToBase: boolean;
};

type StripDef = {
  id: string;
  label: string;
  regions: string[];
  design: string;
  stripType: string;
  grouping: string;
  start: string;
};

type SequenceDef = StripDef & {
  clusterType: string;
  target: string;
  startCluster: string;
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ActivityParameters({ activityName }: { activityName: string }) {
  // General Information
  const [name, setName] = React.useState(activityName);
  const [description, setDescription] = React.useState("");
  const [pType, setPType] = React.useState("s");

  // Resources
  const [baseMap, setBaseMap] = React.useState("");
  const [allocation, setAllocation] = React.useState<Record<string, string | null>>({});

  // Slip Times
  const [slipTimes, setSlipTimes] = React.useState<Record<string, Record<string, string>>>({});

  // Timetables
  const [timetables, setTimetables] = React.useState<Record<string, TimeEntry[]>>(() =>
    Object.fromEntries(DUMMY_RESOURCES.map((r) => [r, []]))
  );
  const [expandedResource, setExpandedResource] = React.useState<string | null>(DUMMY_RESOURCES[0]);

  // Sequencing
  const [designOption, setDesignOption] = React.useState("");
  const [masterDesign, setMasterDesign] = React.useState("");
  const [sequenceRegioning, setSequenceRegioning] = React.useState("");

  // Base Strips
  const [strips, setStrips] = React.useState<StripDef[]>([
    { id: crypto.randomUUID(), label: "Strip 1", regions: [], design: "", stripType: "inline", grouping: "", start: "highest" },
  ]);
  const [activeStripId, setActiveStripId] = React.useState<string | null>(strips[0].id);

  // Sequences
  const [sequences, setSequences] = React.useState<SequenceDef[]>([
    { id: crypto.randomUUID(), label: "Seq 1", regions: [], design: "", stripType: "inline", grouping: "", start: "highest", clusterType: "weight", target: "", startCluster: "highest" },
  ]);
  const [activeSeqId, setActiveSeqId] = React.useState<string | null>(sequences[0].id);

  // Motion
  const [motion, setMotion] = React.useState({
    gid_ttype_shift: "",
    gid_swath_shift: "",
    buffer_len_min: "",
    buffer_len_max: "",
    gid_sub_shift: "",
  });

  // Dynamic
  const [dynamicMappingKw, setDynamicMappingKw] = React.useState("");

  /* Helpers */
  const addTimeEntry = (resource: string) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: [
        ...prev[resource],
        { id: crypto.randomUUID(), from: "", to: "", returnToBase: false },
      ],
    }));
  };

  const updateTimeEntry = (resource: string, id: string, patch: Partial<TimeEntry>) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: prev[resource].map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  };

  const removeTimeEntry = (resource: string, id: string) => {
    setTimetables((prev) => ({
      ...prev,
      [resource]: prev[resource].filter((e) => e.id !== id),
    }));
  };

  const updateStrip = (id: string, patch: Partial<StripDef>) => {
    setStrips((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateSequence = (id: string, patch: Partial<SequenceDef>) => {
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
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
            {DUMMY_MAPS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Allocation" layout="horizontal">
          <CheckboxMatrix
            rows={DUMMY_LAYERS}
            columns={DUMMY_RESOURCES}
            value={allocation}
            onChange={setAllocation}
          />
        </Field>
      </Section>

      {/* ── Slip Times ────────────────────────────────────────────────── */}
      <Section title="Slip Times" defaultOpen={false}>
        <EditableMatrix
          labels={DUMMY_RESOURCES}
          value={slipTimes}
          onChange={setSlipTimes}
        />
      </Section>

      {/* ── Timetables ────────────────────────────────────────────────── */}
      <Section title="Timetables" defaultOpen={false}>
        {DUMMY_RESOURCES.map((resource) => (
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
