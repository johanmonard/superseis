"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { InlineTagSelect } from "../activities/inline-tag-select";
import { Section } from "../activities/section";
import { TabbedPanel } from "../activities/tabbed-panel";

/* -------------------------------------------------------------------------- */
/*  Dummy option data — replace with real queries when backend is ready       */
/* -------------------------------------------------------------------------- */

const DUMMY_ACTIVITIES = ["Acquisition", "Drilling", "Surveying"];
const DUMMY_MAPS = ["Base Map A", "Base Map B", "Topographic"];
const DUMMY_LAYERS = ["Roads", "Rivers", "Exclusion Zones", "Elevation"];
const DUMMY_POLYGONS = ["Polygon A", "Polygon B", "Polygon C", "Polygon D"];
const DUMMY_CAMP_KEYS = ["Camp Alpha", "Camp Bravo", "Camp Charlie"];

const MOTION_MODES = ["MOVE", "TRAV", "WORK"] as const;
type MotionMode = (typeof MOTION_MODES)[number];

const MAPPING_MODE_KEYS = ["BASE", "CGRP", "CPRG", "CURRENT", "SWITCH"] as const;

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type RandShapeEntry = { low: string; mode: string; high: string };

type SequenceDef = {
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
};

type CampMappingEntry = { key: string; value: string };

type TimeMapDef = { mapper: string; mapping: Record<string, string> };

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function ResourceParameters({ resourceName }: { resourceName: string }) {
  /* ── General Information ─────────────────────────────────────────────── */
  const [name, setName] = React.useState(resourceName);
  const [designation, setDesignation] = React.useState("");
  const [activity, setActivity] = React.useState("");

  /* ── Motion ──────────────────────────────────────────────────────────── */
  const [greedy, setGreedy] = React.useState(false);
  const [abtb, setAbtb] = React.useState(false);
  const [mttf, setMttf] = React.useState("");
  const [mtbd, setMtbd] = React.useState("");
  const [btbBuffer, setBtbBuffer] = React.useState("");
  const [randShape, setRandShape] = React.useState<Record<MotionMode, RandShapeEntry>>({
    MOVE: { low: "", mode: "", high: "" },
    TRAV: { low: "", mode: "", high: "" },
    WORK: { low: "", mode: "", high: "" },
  });

  /* ── Sequencing ──────────────────────────────────────────────────────── */
  const [sequences, setSequences] = React.useState<SequenceDef[]>([
    {
      id: crypto.randomUUID(),
      label: "Seq 1",
      regions: [],
      designRegion: "",
      stripType: "inline",
      stripGrouping: "",
      clusterType: "weight",
      clusterTarget: "",
      stripStart: "highest",
      clusterStart: "highest",
    },
  ]);
  const [activeSeqId, setActiveSeqId] = React.useState<string | null>(sequences[0].id);

  /* ── Terrain ─────────────────────────────────────────────────────────── */
  const [campMapper, setCampMapper] = React.useState("");
  const [campMappingEntries, setCampMappingEntries] = React.useState<CampMappingEntry[]>([
    { key: "", value: "" },
  ]);
  const [campStart, setCampStart] = React.useState("");
  const [mappingModes, setMappingModes] = React.useState<Record<string, MotionMode>>(() =>
    Object.fromEntries(MAPPING_MODE_KEYS.map((k) => [k, "MOVE" as MotionMode]))
  );
  const [workMapping, setWorkMapping] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(DUMMY_LAYERS.map((l) => [l, ""]))
  );
  const [timeMapMove, setTimeMapMove] = React.useState<TimeMapDef>({
    mapper: "",
    mapping: Object.fromEntries(DUMMY_LAYERS.map((l) => [l, ""])),
  });
  const [timeMapTrav, setTimeMapTrav] = React.useState<TimeMapDef>({
    mapper: "",
    mapping: Object.fromEntries(DUMMY_LAYERS.map((l) => [l, ""])),
  });

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  const updateRandShape = (mode: MotionMode, field: keyof RandShapeEntry, value: string) => {
    setRandShape((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], [field]: value },
    }));
  };

  const updateSequence = (id: string, patch: Partial<SequenceDef>) => {
    setSequences((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateCampEntry = (idx: number, patch: Partial<CampMappingEntry>) => {
    setCampMappingEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, ...patch } : e))
    );
  };

  const addCampEntry = () => {
    setCampMappingEntries((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeCampEntry = (idx: number) => {
    setCampMappingEntries((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTimeMap = (
    setter: React.Dispatch<React.SetStateAction<TimeMapDef>>,
    patch: Partial<TimeMapDef> | { layer: string; value: string }
  ) => {
    if ("layer" in patch) {
      setter((prev) => ({
        ...prev,
        mapping: { ...prev.mapping, [patch.layer]: patch.value },
      }));
    } else {
      setter((prev) => ({ ...prev, ...patch }));
    }
  };

  return (
    <div className="space-y-[var(--space-2)]">
      {/* ── General Information ───────────────────────────────────────── */}
      <Section title="General Information">
        <Field label="Name" htmlFor="res-name" layout="horizontal">
          <Input
            id="res-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={15}
          />
        </Field>
        <Field label="Designation" htmlFor="res-designation" layout="horizontal">
          <Input
            id="res-designation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            maxLength={25}
          />
        </Field>
        <Field label="Activity" htmlFor="res-activity" layout="horizontal">
          <Select
            id="res-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            <option value="">Select...</option>
            {DUMMY_ACTIVITIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </Field>
      </Section>

      {/* ── Motion ────────────────────────────────────────────────────── */}
      <Section title="Motion" defaultOpen={false}>
        <Field label="Greedy" layout="horizontal">
          <Checkbox
            checked={greedy}
            onCheckedChange={(checked) => setGreedy(checked === true)}
          />
        </Field>
        <Field label="Anticipated BTB" layout="horizontal">
          <Checkbox
            checked={abtb}
            onCheckedChange={(checked) => setAbtb(checked === true)}
          />
        </Field>
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
        <Field label="BTB Buffer" htmlFor="res-btb-buffer" layout="horizontal">
          <Input
            id="res-btb-buffer"
            type="number"
            value={btbBuffer}
            onChange={(e) => setBtbBuffer(e.target.value)}
          />
        </Field>

        {/* Random shape ranges */}
        <Section title="Random Shape" defaultOpen={false} variant="secondary" className="mt-[var(--space-4)]">
          {MOTION_MODES.map((mode) => (
            <div key={mode} className="space-y-[var(--space-2)]">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">{mode}</p>
              <div className="flex items-center gap-[var(--space-2)]">
                {(["low", "mode", "high"] as const).map((field) => (
                  <Field key={field} label={field} htmlFor={`rs-${mode}-${field}`} layout="vertical">
                    <Input
                      id={`rs-${mode}-${field}`}
                      type="number"
                      value={randShape[mode][field]}
                      onChange={(e) => updateRandShape(mode, field, e.target.value)}
                      className="w-20"
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </Section>
      </Section>

      {/* ── Sequencing ────────────────────────────────────────────────── */}
      <Section title="Sequencing" defaultOpen={false}>
        <TabbedPanel
          items={sequences}
          activeId={activeSeqId}
          onSelect={setActiveSeqId}
          onAdd={() => {
            const id = crypto.randomUUID();
            setSequences((prev) => [
              ...prev,
              {
                id,
                label: `Seq ${prev.length + 1}`,
                regions: [],
                designRegion: "",
                stripType: "inline",
                stripGrouping: "",
                clusterType: "weight",
                clusterTarget: "",
                stripStart: "highest",
                clusterStart: "highest",
              },
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
              <Field label="Design region" htmlFor={`seq-dr-${seq.id}`} layout="horizontal">
                <Input
                  id={`seq-dr-${seq.id}`}
                  value={seq.designRegion}
                  onChange={(e) => updateSequence(seq.id, { designRegion: e.target.value })}
                />
              </Field>
              <Field label="Strip type" layout="horizontal">
                <Select
                  value={seq.stripType}
                  onChange={(e) => updateSequence(seq.id, { stripType: e.target.value as "inline" | "crossline" })}
                >
                  <option value="inline">inline</option>
                  <option value="crossline">crossline</option>
                </Select>
              </Field>
              <Field label="Grouping" htmlFor={`seq-grp-${seq.id}`} layout="horizontal">
                <Input
                  id={`seq-grp-${seq.id}`}
                  type="number"
                  value={seq.stripGrouping}
                  onChange={(e) => updateSequence(seq.id, { stripGrouping: e.target.value })}
                />
              </Field>
              <Field label="Cluster type" layout="horizontal">
                <Select
                  value={seq.clusterType}
                  onChange={(e) => updateSequence(seq.id, { clusterType: e.target.value as "weight" | "number" | "size" })}
                >
                  <option value="weight">weight</option>
                  <option value="number">number</option>
                  <option value="size">size</option>
                </Select>
              </Field>
              <Field label="Cluster target" htmlFor={`seq-ct-${seq.id}`} layout="horizontal">
                <Input
                  id={`seq-ct-${seq.id}`}
                  type="number"
                  value={seq.clusterTarget}
                  onChange={(e) => updateSequence(seq.id, { clusterTarget: e.target.value })}
                />
              </Field>
              <Field label="Strip start" layout="horizontal">
                <Select
                  value={seq.stripStart}
                  onChange={(e) => updateSequence(seq.id, { stripStart: e.target.value as "highest" | "lowest" })}
                >
                  <option value="highest">highest</option>
                  <option value="lowest">lowest</option>
                </Select>
              </Field>
              <Field label="Cluster start" layout="horizontal">
                <Select
                  value={seq.clusterStart}
                  onChange={(e) => updateSequence(seq.id, { clusterStart: e.target.value as "highest" | "lowest" })}
                >
                  <option value="highest">highest</option>
                  <option value="lowest">lowest</option>
                </Select>
              </Field>
            </div>
          )}
        </TabbedPanel>
      </Section>

      {/* ── Terrain ───────────────────────────────────────────────────── */}
      <Section title="Terrain" defaultOpen={false}>
        {/* Camps Definition */}
        <Section title="Camps Definition" defaultOpen={false} variant="secondary">
          <Field label="Mapper" htmlFor="camp-mapper" layout="horizontal">
            <Select
              id="camp-mapper"
              value={campMapper}
              onChange={(e) => setCampMapper(e.target.value)}
            >
              <option value="">Select...</option>
              {DUMMY_MAPS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>

          <Field label="Mapping entries" layout="horizontal">
            <div className="space-y-1">
              {campMappingEntries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-[var(--space-2)]">
                  <Input
                    value={entry.key}
                    onChange={(e) => updateCampEntry(idx, { key: e.target.value })}
                    placeholder="Key"
                    className="w-28"
                  />
                  <Select
                    value={entry.value}
                    onChange={(e) => updateCampEntry(idx, { value: e.target.value })}
                  >
                    <option value="">Layer...</option>
                    {DUMMY_LAYERS.map((l) => (
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

          <Field label="Camp start" htmlFor="camp-start" layout="horizontal">
            <Select
              id="camp-start"
              value={campStart}
              onChange={(e) => setCampStart(e.target.value)}
            >
              <option value="">Select...</option>
              {campMappingEntries
                .filter((e) => e.key.trim())
                .map((e) => (
                  <option key={e.key} value={e.key}>{e.key}</option>
                ))}
            </Select>
          </Field>
        </Section>

        {/* Mapping Modes */}
        <Section title="Mapping Modes" defaultOpen={false} variant="secondary" className="mt-[var(--space-4)]">
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

        {/* Work Mapping */}
        <Section title="Work Mapping" defaultOpen={false} variant="secondary" className="mt-[var(--space-4)]">
          {DUMMY_LAYERS.map((layer) => (
            <Field key={layer} label={layer} htmlFor={`wm-${layer}`} layout="horizontal">
              <Input
                id={`wm-${layer}`}
                value={workMapping[layer]}
                onChange={(e) =>
                  setWorkMapping((prev) => ({ ...prev, [layer]: e.target.value }))
                }
              />
            </Field>
          ))}
        </Section>

        {/* Time Maps */}
        {([
          ["MOVE", timeMapMove, setTimeMapMove],
          ["TRAV", timeMapTrav, setTimeMapTrav],
        ] as const).map(([label, state, setter]) => (
          <Section
            key={label}
            title={`${label} Time Map`}
            defaultOpen={false}
            variant="secondary"
            className="mt-[var(--space-4)]"
          >
            <Field label="Mapper" htmlFor={`tm-mapper-${label}`} layout="horizontal">
              <Select
                id={`tm-mapper-${label}`}
                value={state.mapper}
                onChange={(e) => updateTimeMap(setter, { mapper: e.target.value })}
              >
                <option value="">Select...</option>
                {DUMMY_MAPS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
            {DUMMY_LAYERS.map((layer) => (
              <Field key={layer} label={layer} htmlFor={`tm-${label}-${layer}`} layout="horizontal">
                <Input
                  id={`tm-${label}-${layer}`}
                  value={state.mapping[layer] ?? ""}
                  onChange={(e) => updateTimeMap(setter, { layer, value: e.target.value })}
                />
              </Field>
            ))}
          </Section>
        ))}
      </Section>
    </div>
  );
}
