"use client";

import * as React from "react";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectCrew, type CrewActivityInfo } from "@/components/features/project/project-crew";
import {
  CrewActivityGraph,
  DEFAULT_GRAPH_CONFIG,
  type GraphConfig,
  type EdgeType,
  type RankDirection,
} from "@/components/features/project/crew-activity-graph";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { appIcons } from "@/components/ui/icon";

const { settings: Settings, x: X } = appIcons;

function GraphSettingsPanel({
  config,
  onUpdate,
}: {
  config: GraphConfig;
  onUpdate: <K extends keyof GraphConfig>(key: K, value: GraphConfig[K]) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="absolute top-[var(--space-2)] right-[var(--space-2)] z-10">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:text-[var(--color-text-primary)]"
          aria-label="Graph settings"
        >
          <Settings size={14} />
        </button>
      ) : (
        <div className="w-64 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[0_4px_12px_var(--color-shadow-alpha)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--space-3)] py-[var(--space-2)]">
            <span className="text-xs font-semibold text-[var(--color-text-primary)]">Graph Settings</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
          <div className="space-y-[var(--space-3)] p-[var(--space-3)]">
            <Field label="Edge Type" layout="horizontal">
              <Select
                value={config.edgeType}
                onChange={(e) => onUpdate("edgeType", e.target.value as EdgeType)}
              >
                <option value="smoothstep">Smooth Step</option>
                <option value="default">Bezier</option>
                <option value="straight">Straight</option>
                <option value="step">Step</option>
              </Select>
            </Field>

            <Field label="Direction" layout="horizontal">
              <Select
                value={config.rankDirection}
                onChange={(e) => onUpdate("rankDirection", e.target.value as RankDirection)}
              >
                <option value="TB">Top to Bottom</option>
                <option value="LR">Left to Right</option>
                <option value="BT">Bottom to Top</option>
                <option value="RL">Right to Left</option>
              </Select>
            </Field>

            <Field label="Node Spacing" layout="horizontal">
              <Input
                type="number"
                min={10}
                max={200}
                value={config.nodeSpacing}
                onChange={(e) => onUpdate("nodeSpacing", Number(e.target.value))}
              />
            </Field>

            <Field label="Rank Spacing" layout="horizontal">
              <Input
                type="number"
                min={10}
                max={200}
                value={config.rankSpacing}
                onChange={(e) => onUpdate("rankSpacing", Number(e.target.value))}
              />
            </Field>

            <Field label="Animated" layout="horizontal">
              <label className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-primary)]">
                <Checkbox
                  checked={config.animated}
                  onCheckedChange={(checked) => onUpdate("animated", Boolean(checked))}
                />
                Enable
              </label>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrewPage() {
  const [activities, setActivities] = React.useState<CrewActivityInfo[]>([]);
  const [graphConfig, setGraphConfig] = React.useState<GraphConfig>(DEFAULT_GRAPH_CONFIG);

  const updateConfig = React.useCallback(
    <K extends keyof GraphConfig>(key: K, value: GraphConfig[K]) =>
      setGraphConfig((prev) => ({ ...prev, [key]: value })),
    []
  );

  const viewport = (
    <div className="relative h-full w-full">
      <CrewActivityGraph activities={activities} config={graphConfig} />
      <GraphSettingsPanel config={graphConfig} onUpdate={updateConfig} />
    </div>
  );

  return (
    <ProjectSettingsPage
      title="Crew"
      panelTitle="Crew Options"
      viewport={viewport}
    >
      <ProjectCrew onActivitiesChange={setActivities} />
    </ProjectSettingsPage>
  );
}
