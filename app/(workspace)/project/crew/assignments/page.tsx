"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";

/* -------------------------------------------------------------------------- */
/*  Section shapes — minimal subset of what we read                           */
/* -------------------------------------------------------------------------- */

interface MapsSectionData {
  maps: Array<{ id: string; name: string; layers: string[] }>;
  activeId: string;
}
const DEFAULT_MAPS_SECTION: MapsSectionData = { maps: [], activeId: "" };

interface CrewAssignmentsSectionData {
  cells: Record<string, boolean>;
}
const DEFAULT_CREW_ASSIGNMENTS_SECTION: CrewAssignmentsSectionData = { cells: {} };

interface CrewSectionData {
  options: Array<{
    id: string;
    name: string;
    activities: Array<{
      id: string;
      name: string;
      pointType: "SP" | "RP";
      resources: Array<{ id: string; name: string; max: number }>;
    }>;
  }>;
  activeId: string;
}
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

/* -------------------------------------------------------------------------- */
/*  Right-panel table: layers (rows) × resources grouped by activity (cols)   */
/* -------------------------------------------------------------------------- */

function ResourcesAssignmentsTable({
  layers,
  activities,
  cells,
  onToggle,
}: {
  layers: string[];
  activities: Array<{ name: string; resources: string[] }>;
  cells: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  const toggle = onToggle;

  if (layers.length === 0 || activities.every((a) => a.resources.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center p-[var(--space-4)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          {layers.length === 0
            ? "No layers found in any Map. Add layers in the Maps page first."
            : "No resources mapped to any activity in the active crew option."}
        </p>
      </div>
    );
  }

  // Flatten resources, tagging each cell with (a) its activity index — used
  // to alternate background tints — and (b) whether it's the last column of
  // its activity, which gets a heavier right border to mark the group end.
  const flatResources: Array<{
    activity: string;
    resource: string;
    activityIdx: number;
    isLastInGroup: boolean;
  }> = [];
  activities.forEach((act, activityIdx) => {
    act.resources.forEach((res, resIdx) => {
      flatResources.push({
        activity: act.name,
        resource: res,
        activityIdx,
        isLastInGroup: resIdx === act.resources.length - 1,
      });
    });
  });

  // Two subtle band tints, alternating per activity. Using color-mix on the
  // accent so it picks up the active theme without hard-coding hex values.
  const bandBg = (activityIdx: number) =>
    activityIdx % 2 === 0
      ? "bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-bg-surface))]"
      : "bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-bg-surface))]";

  // Group divider — heavier right border on the last cell of each activity
  // (skip the last column overall to avoid a stray edge inside the table).
  const groupDivider = (idx: number, isLastInGroup: boolean) =>
    isLastInGroup && idx !== flatResources.length - 1
      ? "border-r-[2px] border-r-[var(--color-border-strong)]"
      : "";

  return (
    <div className="h-full overflow-auto p-[var(--space-3)]">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-20 bg-[var(--color-bg-surface)]">
          {/* Activity headers — one cell per activity, spanning its resources. */}
          <tr>
            <th className="sticky left-0 z-10 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-[var(--space-1)] text-left font-semibold text-[var(--color-text-secondary)]">
              {/* corner */}
            </th>
            {activities.map((act, idx) =>
              act.resources.length === 0 ? null : (
                <th
                  key={act.name}
                  colSpan={act.resources.length}
                  className={`border border-[var(--color-border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-center text-sm font-semibold uppercase tracking-wide text-[var(--color-text-primary)] ${bandBg(idx)} ${idx !== activities.filter((a) => a.resources.length > 0).length - 1 ? "border-r-[2px] border-r-[var(--color-border-strong)]" : ""}`}
                >
                  {act.name}
                </th>
              ),
            )}
          </tr>
          {/* Resource sub-headers. */}
          <tr>
            <th className="sticky left-0 z-10 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-[var(--space-1)] text-left font-medium text-[var(--color-text-muted)]">
              Layer
            </th>
            {flatResources.map((c, i) => (
              <th
                key={`${c.activity}|${c.resource}|${i}`}
                className={`border border-[var(--color-border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-center font-medium text-[var(--color-text-secondary)] ${bandBg(c.activityIdx)} ${groupDivider(i, c.isLastInGroup)}`}
              >
                {c.resource}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {layers.map((layer) => (
            <tr key={layer}>
              <th
                scope="row"
                className="sticky left-0 z-0 border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-2)] py-[var(--space-1)] text-left font-medium text-[var(--color-text-primary)]"
              >
                {layer}
              </th>
              {flatResources.map((c, i) => {
                const key = `${layer}|${c.activity}|${c.resource}`;
                return (
                  <td
                    key={`${key}|${i}`}
                    className={`border border-[var(--color-border-subtle)] px-[var(--space-2)] py-[var(--space-1)] text-center ${bandBg(c.activityIdx)} ${groupDivider(i, c.isLastInGroup)}`}
                  >
                    <Checkbox
                      checked={cells[key] === true}
                      onCheckedChange={(v) => toggle(key, v === true)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function CrewAssignmentsPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: mapsSection } = useSectionData<MapsSectionData>(
    projectId,
    "maps",
    DEFAULT_MAPS_SECTION,
  );
  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );
  const { data: assignments, update: updateAssignments } =
    useSectionData<CrewAssignmentsSectionData>(
      projectId,
      "crew_assignments",
      DEFAULT_CREW_ASSIGNMENTS_SECTION,
    );

  // Toggle one cell. We always write a flat dict back — no need for a
  // mutation-style hook since useSectionData already debounces saves.
  const handleToggle = React.useCallback(
    (key: string, value: boolean) => {
      const next = { ...assignments.cells };
      if (value) next[key] = true;
      else delete next[key];
      updateAssignments({ cells: next });
    },
    [assignments, updateAssignments],
  );

  // Tracks which view is currently active in the right panel. SP / RP show
  // the resource matrix filtered to source-side or receiver-side activities.
  const [activeView, setActiveView] = React.useState<"sp" | "rp" | null>(null);

  // Unique layer names across all maps in the project's Maps page.
  const uniqueLayers = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const map of mapsSection.maps) {
      for (const layer of map.layers) {
        if (!seen.has(layer)) {
          seen.add(layer);
          out.push(layer);
        }
      }
    }
    return out;
  }, [mapsSection]);

  // Activities (and their resources) from the active crew option, split by
  // point type so each button feeds the right slice into the table.
  const { spActivities, rpActivities } = React.useMemo(() => {
    const opt =
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0];
    if (!opt) return { spActivities: [], rpActivities: [] };
    const sp: Array<{ name: string; resources: string[] }> = [];
    const rp: Array<{ name: string; resources: string[] }> = [];
    for (const a of opt.activities) {
      const entry = { name: a.name, resources: a.resources.map((r) => r.name) };
      (a.pointType === "RP" ? rp : sp).push(entry);
    }
    return { spActivities: sp, rpActivities: rp };
  }, [crewSection]);

  const viewport =
    activeView === "sp" ? (
      <ResourcesAssignmentsTable
        layers={uniqueLayers}
        activities={spActivities}
        cells={assignments.cells}
        onToggle={handleToggle}
      />
    ) : activeView === "rp" ? (
      <ResourcesAssignmentsTable
        layers={uniqueLayers}
        activities={rpActivities}
        cells={assignments.cells}
        onToggle={handleToggle}
      />
    ) : undefined;

  return (
    <ProjectSettingsPage title="Assignments" panelTitle="Assignments" viewport={viewport}>
      <div className="flex flex-col gap-[var(--space-2)]">
        <Button
          variant={activeView === "sp" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setActiveView((prev) => (prev === "sp" ? null : "sp"))}
          className="self-start"
        >
          SP Resources assignment
        </Button>
        <Button
          variant={activeView === "rp" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setActiveView((prev) => (prev === "rp" ? null : "rp"))}
          className="self-start"
        >
          RP Resources assignment
        </Button>
      </div>
    </ProjectSettingsPage>
  );
}
