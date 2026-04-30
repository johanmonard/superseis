"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } =
  appIcons;

interface CrewResource {
  id: string;
  name: string;
  max: number;
}
interface CrewActivity {
  id: string;
  name: string;
  pointType: "SP" | "RP";
  resources: CrewResource[];
}
interface CrewOption {
  id: string;
  name: string;
  activities: CrewActivity[];
}
interface CrewSectionData {
  options: CrewOption[];
  activeId: string;
}
const DEFAULT_CREW_SECTION: CrewSectionData = { options: [], activeId: "" };

type SimType = "resource" | "activity";

interface SimulationConfig {
  id: string;
  name: string;
  /** Map keyed `${activityId}|${resourceId}` → number of teams. */
  teams: Record<string, number>;
  simType: SimType;
  /** Selected resource id when `simType === "resource"`. Ignored otherwise. */
  resourceId: string | null;
  deadlockCheck: boolean;
  debugLog: boolean;
  windows: number[];
  windowsQuick: number[];
}

interface SimulatorManualSectionData {
  simulations: SimulationConfig[];
  activeId: string;
}

function createSimulation(name: string): SimulationConfig {
  return {
    id: crypto.randomUUID(),
    name,
    teams: {},
    simType: "resource",
    resourceId: null,
    deadlockCheck: false,
    debugLog: false,
    windows: [50, 200, 500],
    windowsQuick: [10, 50, 100],
  };
}

const DEFAULT_SIMULATOR_MANUAL_SECTION: SimulatorManualSectionData = {
  simulations: [createSimulation("Simulation 1")],
  activeId: "",
};

const teamsKey = (activityId: string, resourceId: string) =>
  `${activityId}|${resourceId}`;

/* -------------------------------------------------------------------------- */
/*  Simulation selector — pill bar with +, rename, delete                     */
/* -------------------------------------------------------------------------- */

function SimulationSelector({
  simulations,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  simulations: SimulationConfig[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingId) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editingId]);

  const startEdit = (sim: SimulationConfig) => {
    setEditingId(sim.id);
    setEditValue(sim.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {simulations.map((s) => {
          const isActive = s.id === activeId;
          const isEditing = s.id === editingId;

          if (isEditing) {
            return (
              <div
                key={s.id}
                className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-bg-surface)] px-[var(--space-1)]"
              >
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 w-32 bg-transparent px-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={commitEdit}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-status-success)]"
                >
                  <Check size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"
                >
                  <X size={10} />
                </button>
              </div>
            );
          }

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                isActive
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {s.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add simulation"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = simulations.find((s) => s.id === activeId);
            if (active) startEdit(active);
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Pencil size={10} /> Rename
        </button>
        {simulations.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Trash2 size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dynamic windows field                                                     */
/* -------------------------------------------------------------------------- */

function WindowsField({
  label,
  idPrefix,
  values,
  onChange,
}: {
  label: string;
  idPrefix: string;
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const updateAt = (idx: number, raw: string) => {
    if (raw === "") {
      onChange(values.map((v, i) => (i === idx ? 0 : v)));
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    onChange(values.map((v, i) => (i === idx ? parsed : v)));
  };
  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };
  const add = () => {
    onChange([...values, 0]);
  };

  const addLink = (
    <button
      type="button"
      onClick={add}
      className="ml-auto inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-1)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:underline"
    >
      <Icon icon={appIcons.plus} size={12} />
      Add
    </button>
  );

  return (
    <Field label={label} layout="horizontal">
      <div className="flex flex-col gap-[var(--space-2)]">
        {values.length === 0 ? (
          <div className="flex items-center">{addLink}</div>
        ) : (
          values.map((value, idx) => {
            const id = `${idPrefix}-${idx}`;
            const isLast = idx === values.length - 1;
            return (
              <div key={idx} className="flex items-center gap-[var(--space-2)]">
                <label
                  htmlFor={id}
                  className="w-6 shrink-0 text-xs text-[var(--color-text-muted)]"
                >
                  {`w${idx + 1}`}
                </label>
                <div className="w-[3.5rem]">
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={String(value)}
                    onChange={(e) => updateAt(idx, e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  aria-label={`Remove w${idx + 1}`}
                  className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
                >
                  <Icon icon={appIcons.x} size={12} />
                </button>
                {isLast ? addLink : null}
              </div>
            );
          })
        )}
      </div>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function SimulatorManualPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: crewSection } = useSectionData<CrewSectionData>(
    projectId,
    "crew",
    DEFAULT_CREW_SECTION,
  );
  const { data: manualSection, update: updateManualSection } =
    useSectionData<SimulatorManualSectionData>(
      projectId,
      "simulator_manual",
      DEFAULT_SIMULATOR_MANUAL_SECTION,
    );

  const simulations = manualSection.simulations;
  const activeSimId =
    manualSection.activeId || simulations[0]?.id || "";
  const activeSim =
    simulations.find((s) => s.id === activeSimId) ?? simulations[0];

  const updateActiveSim = React.useCallback(
    (patch: Partial<SimulationConfig>) => {
      if (!activeSim) return;
      updateManualSection({
        ...manualSection,
        simulations: manualSection.simulations.map((s) =>
          s.id === activeSim.id ? { ...s, ...patch } : s,
        ),
      });
    },
    [activeSim, manualSection, updateManualSection],
  );

  const handleAddSim = React.useCallback(() => {
    const next = createSimulation(`Simulation ${simulations.length + 1}`);
    updateManualSection({
      ...manualSection,
      simulations: [...manualSection.simulations, next],
      activeId: next.id,
    });
  }, [manualSection, simulations.length, updateManualSection]);

  const handleRenameSim = React.useCallback(
    (id: string, name: string) => {
      updateManualSection({
        ...manualSection,
        simulations: manualSection.simulations.map((s) =>
          s.id === id ? { ...s, name } : s,
        ),
      });
    },
    [manualSection, updateManualSection],
  );

  const handleDeleteSim = React.useCallback(
    (id: string) => {
      const next = manualSection.simulations.filter((s) => s.id !== id);
      const newActiveId =
        manualSection.activeId === id && next.length > 0
          ? next[0].id
          : manualSection.activeId;
      updateManualSection({
        ...manualSection,
        simulations: next,
        activeId: newActiveId,
      });
    },
    [manualSection, updateManualSection],
  );

  const activeOption = React.useMemo(
    () =>
      crewSection.options.find((o) => o.id === crewSection.activeId) ??
      crewSection.options[0] ??
      null,
    [crewSection],
  );

  const activities = activeOption?.activities ?? [];

  const [selectedActivityId, setSelectedActivityId] = React.useState<string>("");

  React.useEffect(() => {
    if (activities.length === 0) {
      if (selectedActivityId !== "") setSelectedActivityId("");
      return;
    }
    if (!activities.some((a) => a.id === selectedActivityId)) {
      setSelectedActivityId(activities[0].id);
    }
  }, [activities, selectedActivityId]);

  const selectedActivity = activities.find((a) => a.id === selectedActivityId);

  // Empty input clears the stored override → display falls back to the
  // resource's `max` from the Crew configuration.
  const handleTeamsChange = React.useCallback(
    (activityId: string, resourceId: string, raw: string) => {
      if (!activeSim) return;
      const key = teamsKey(activityId, resourceId);
      const next = { ...activeSim.teams };
      if (raw === "") {
        delete next[key];
      } else {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isNaN(parsed) || parsed < 0) return;
        next[key] = parsed;
      }
      updateActiveSim({ teams: next });
    },
    [activeSim, updateActiveSim],
  );

  const noCrewMsg =
    activeOption == null
      ? "No crew option configured. Set one up in the Crew page."
      : activities.length === 0
        ? "The active crew option has no activities."
        : null;

  const handleStart = () => {
    // TODO: wire up to the simulator backend.
    // eslint-disable-next-line no-console -- placeholder until the API exists
    console.info("[simulator] start", activeSim);
  };

  // Defensive: simulations should never be empty thanks to defaults, but if a
  // bad write empties the list, stop rendering controls that depend on a sim.
  if (!activeSim) {
    return (
      <ProjectSettingsPage
        title="Manual"
        viewport={
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder
              variant="wave-mesh"
              message="Manual simulator viewport"
            />
          </div>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            No simulations yet.
          </p>
          <Button onClick={handleAddSim} className="self-start">
            <Plus size={12} className="mr-[var(--space-1)]" />
            Add simulation
          </Button>
        </div>
      </ProjectSettingsPage>
    );
  }

  return (
    <ProjectSettingsPage
      title="Manual"
      viewport={
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder
            variant="wave-mesh"
            message="Manual simulator viewport"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <SimulationSelector
          simulations={simulations}
          activeId={activeSim.id}
          onSelect={(id) =>
            updateManualSection({ ...manualSection, activeId: id })
          }
          onAdd={handleAddSim}
          onRename={handleRenameSim}
          onDelete={handleDeleteSim}
        />

        <div className="h-px bg-[var(--color-border-subtle)]" />

        <Field label="Activity" htmlFor="manual-activity" layout="horizontal">
          <Select
            id="manual-activity"
            value={selectedActivityId}
            onChange={(e) => setSelectedActivityId(e.target.value)}
            disabled={activities.length === 0}
          >
            {activities.length === 0 ? (
              <option value="">— none available —</option>
            ) : null}
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        {noCrewMsg ? (
          <p className="text-sm text-[var(--color-text-muted)]">{noCrewMsg}</p>
        ) : selectedActivity == null ? null : selectedActivity.resources.length ===
          0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            This activity has no resources.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-[var(--space-3)]">
              <span aria-hidden className="w-[6rem] shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Teams #
              </span>
            </div>
            {selectedActivity.resources.map((res) => {
              const key = teamsKey(selectedActivity.id, res.id);
              const stored = activeSim.teams[key];
              const value = stored ?? res.max;
              return (
                <Field
                  key={res.id}
                  label={res.name}
                  htmlFor={`manual-teams-${res.id}`}
                  layout="horizontal"
                >
                  <div className="w-[3.5rem]">
                    <Input
                      id={`manual-teams-${res.id}`}
                      type="number"
                      min={0}
                      max={res.max > 0 ? res.max : undefined}
                      value={String(value)}
                      onChange={(e) =>
                        handleTeamsChange(
                          selectedActivity.id,
                          res.id,
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </Field>
              );
            })}
          </>
        )}

        <hr className="border-t border-[var(--color-border-subtle)]" />

        <Field label="SIM type" htmlFor="manual-sim-type" layout="horizontal">
          <Select
            id="manual-sim-type"
            value={activeSim.simType}
            onChange={(e) =>
              updateActiveSim({ simType: e.target.value as SimType })
            }
          >
            <option value="resource">Resource</option>
            <option value="activity">Activity</option>
          </Select>
        </Field>

        <Field label="Resource" htmlFor="manual-resource" layout="horizontal">
          {activeSim.simType === "activity" ? (
            <Select id="manual-resource" value="all" disabled>
              <option value="all">All</option>
            </Select>
          ) : (
            <Select
              id="manual-resource"
              value={activeSim.resourceId ?? ""}
              onChange={(e) =>
                updateActiveSim({ resourceId: e.target.value || null })
              }
              disabled={
                selectedActivity == null ||
                selectedActivity.resources.length === 0
              }
            >
              <option value="">Select…</option>
              {selectedActivity?.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Deadlock check" htmlFor="manual-deadlock" layout="horizontal">
          <Switch
            id="manual-deadlock"
            checked={activeSim.deadlockCheck}
            onCheckedChange={(v) => updateActiveSim({ deadlockCheck: v })}
          />
        </Field>

        <Field label="Debug log" htmlFor="manual-debug" layout="horizontal">
          <Switch
            id="manual-debug"
            checked={activeSim.debugLog}
            onCheckedChange={(v) => updateActiveSim({ debugLog: v })}
          />
        </Field>

        <WindowsField
          label="Window"
          idPrefix="manual-window"
          values={activeSim.windows}
          onChange={(next) => updateActiveSim({ windows: next })}
        />

        <WindowsField
          label="Window quick"
          idPrefix="manual-window-quick"
          values={activeSim.windowsQuick}
          onChange={(next) => updateActiveSim({ windowsQuick: next })}
        />

        <div className="flex items-start gap-[var(--space-3)]">
          <span aria-hidden className="w-[6rem] shrink-0" />
          <Button onClick={handleStart}>START SIMULATION</Button>
        </div>
      </div>
    </ProjectSettingsPage>
  );
}
