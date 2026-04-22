"use client";

import * as React from "react";
import { useActiveProject } from "@/lib/use-active-project";
import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { appIcons } from "@/components/ui/icon";
import {
  fetchPipelinePlan,
  fetchProjectOptions,
  runPipelineStep,
  fetchPipelineStatus,
  fetchStepConfig,
  fetchStepProgress,
  resetPipeline,
  resetPipelineStep,
  setActiveOption,
  type StepPlan,
  type StepConfig,
  type StepStatus as PipelineStepStatus,
  type ProjectOptions,
} from "@/services/api/project-pipeline";

const {
  play: Play,
  circleCheck: CircleCheck,
  clock: Clock,
  loader: Loader,
  alertTriangle: AlertTriangle,
  refresh: Refresh,
} = appIcons;

// ---------------------------------------------------------------------------
// Pipeline step definitions (matches dojo v3 pipeline.py)
// ---------------------------------------------------------------------------

interface StepDef {
  id: string;
  number: number;
  title: string;
  description: string;
  configSections: string[];
  dependencies: string[];
}

const PIPELINE_STEPS: StepDef[] = [
  {
    id: "referentials",
    number: 1,
    title: "Referentials",
    description:
      "Build coordinate reference systems, compute survey extents and referential grids from the active terrain/survey option.",
    configSections: ["survey"],
    dependencies: [],
  },
  {
    id: "gis_files",
    number: 2,
    title: "GIS Files",
    description:
      "Process GIS input files: crop, reproject, and tile geopackage layers for the survey area.",
    configSections: ["survey"],
    dependencies: ["referentials"],
  },
  {
    id: "layers",
    number: 3,
    title: "Layers",
    description:
      "Build zone layers from GIS files — rasterize vector features into spatial zones used by mappers and offsetters.",
    configSections: ["survey", "layers"],
    dependencies: ["referentials", "gis_files"],
  },
  {
    id: "mappers",
    number: 4,
    title: "Mappers",
    description:
      "Create mapper lookup tables that group layers into named zone maps, used by grid and resource configurations.",
    configSections: ["layers", "mappers"],
    dependencies: ["layers"],
  },
  {
    id: "grid",
    number: 5,
    title: "Grid",
    description:
      "Generate the theoretical acquisition grid: source/receiver positions from design intervals, orientation, and polygon. No offsets applied.",
    configSections: ["survey", "grid"],
    dependencies: ["referentials"],
  },
  {
    id: "offsets",
    number: 6,
    title: "Offsets",
    description:
      "Apply regioning, multioffset, and feature snap to the theoretical grid. Produces the final station positions and pseq/pid identifiers.",
    configSections: ["survey", "grid", "mappers", "offsetters"],
    dependencies: ["grid", "mappers"],
  },
  {
    id: "sequences",
    number: 7,
    title: "Sequences",
    description:
      "Compute acquisition sequences: strip definitions, clustering, and ordering for each resource/department.",
    configSections: ["grid", "resources"],
    dependencies: ["offsets"],
  },
  {
    id: "simulations",
    number: 8,
    title: "Simulations",
    description:
      "Run crew motion simulations — compute production timelines for each department using sequenced grid and crew parameters.",
    configSections: ["grid", "resources", "crew"],
    dependencies: ["sequences"],
  },
];

// ---------------------------------------------------------------------------
// Project options section (one line per active option)
// ---------------------------------------------------------------------------

const OPTION_LABELS: {
  key: keyof Pick<ProjectOptions, "survey" | "grid" | "offsetters" | "crew">;
  activeKey: string; // field name in active_options on the backend
  label: string;
}[] = [
  { key: "survey", activeKey: "survey", label: "Survey" },
  { key: "grid", activeKey: "grid", label: "Grid" },
  { key: "offsetters", activeKey: "offsetter", label: "Offsets" },
  { key: "crew", activeKey: "crew", label: "Crew" },
];

function ProjectOptionsSection({
  projectId,
  options,
  loading,
  onOptionsChanged,
}: {
  projectId: number;
  options: ProjectOptions | null;
  loading: boolean;
  onOptionsChanged: () => void;
}) {
  const [switching, setSwitching] = React.useState<string | null>(null);

  const handleChange = React.useCallback(
    async (activeKey: string, value: string) => {
      setSwitching(activeKey);
      try {
        await setActiveOption(projectId, activeKey, value);
        onOptionsChanged();
      } finally {
        setSwitching(null);
      }
    },
    [projectId, onOptionsChanged],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)]">
        <Loader size={12} className="animate-spin" />
        Loading...
      </div>
    );
  }

  if (!options) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        Options unavailable.
      </p>
    );
  }

  return (
    <div className="space-y-[var(--space-2)]">
      {OPTION_LABELS.map(({ key, activeKey, label }) => {
        const items = options[key];
        const active = items?.find((o) => o.is_active);
        const isSwitching = switching === activeKey;
        return (
          <div
            key={key}
            className="flex items-center gap-[var(--space-2)] text-xs"
          >
            <span className="w-16 shrink-0 font-medium text-[var(--color-text-muted)]">
              {label}
            </span>
            {items && items.length > 0 ? (
              <select
                className="flex-1 truncate rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-input)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-primary)] outline-none"
                value={active?.key ?? ""}
                disabled={isSwitching}
                onChange={(e) => handleChange(activeKey, e.target.value)}
              >
                {!active && <option value="">— select —</option>}
                {items.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.key}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[var(--color-text-muted)]">
                not configured
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step config parameters display
// ---------------------------------------------------------------------------

function StepConfigDisplay({
  stepConfig,
  isLoading,
}: {
  stepConfig: StepConfig | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-[var(--space-2)] text-sm text-[var(--color-text-muted)]">
        <Loader size={14} className="animate-spin" />
        Loading config...
      </div>
    );
  }
  if (!stepConfig) return null;

  const sections = stepConfig.config_sections;
  const sectionKeys = Object.keys(sections);

  if (sectionKeys.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        No config sections for this step.
      </p>
    );
  }

  return (
    <div className="space-y-[var(--space-2)]">
      <div className="text-xs font-semibold text-[var(--color-text-secondary)]">
        Input parameters from project
      </div>
      {/* Active options */}
      {Object.keys(stepConfig.active_options).length > 0 && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-[var(--space-3)] py-[var(--space-2)]">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Active Options
          </div>
          <div className="flex flex-wrap gap-x-[var(--space-4)] gap-y-1">
            {Object.entries(stepConfig.active_options).map(([key, val]) =>
              val ? (
                <span
                  key={key}
                  className="text-xs text-[var(--color-text-primary)]"
                >
                  <span className="text-[var(--color-text-muted)]">
                    {key}:
                  </span>{" "}
                  {val}
                </span>
              ) : null,
            )}
          </div>
        </div>
      )}
      {/* Config sections */}
      {sectionKeys.map((key) => {
        const data = sections[key];
        const isEmpty =
          data === null ||
          data === undefined ||
          (typeof data === "object" &&
            Object.keys(data as object).length === 0);
        return (
          <div
            key={key}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-[var(--space-3)] py-[var(--space-2)]"
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {key}
            </div>
            {isEmpty ? (
              <span className="text-xs text-[var(--color-text-muted)]">
                Not configured
              </span>
            ) : (
              <pre className="max-h-40 overflow-auto text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow section
// ---------------------------------------------------------------------------

function WorkflowSection({
  projectId,
  onStepRun,
  onStepReset,
  stepStatuses,
  plan,
  runningStep,
}: {
  projectId: number;
  onStepRun: (step: StepDef) => void;
  onStepReset: (stepId: string) => void;
  stepStatuses: Record<string, PipelineStepStatus>;
  plan: StepPlan[] | null;
  runningStep: string | null;
}) {
  const [selectedStepId, setSelectedStepId] = React.useState(
    PIPELINE_STEPS[0].id,
  );
  const [stepConfig, setStepConfig] = React.useState<StepConfig | null>(null);
  const [configLoading, setConfigLoading] = React.useState(false);

  const selectedStep = PIPELINE_STEPS.find((s) => s.id === selectedStepId)!;
  const stepStatus = stepStatuses[selectedStepId];
  const stepPlan = plan?.find((s) => s.step === selectedStepId);

  // Fetch config when step changes
  React.useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    fetchStepConfig(projectId, selectedStepId)
      .then((data) => {
        if (!cancelled) setStepConfig(data);
      })
      .catch(() => {
        if (!cancelled) setStepConfig(null);
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedStepId]);

  return (
    <div className="space-y-[var(--space-4)]">
      {/* Step selector */}
      <Select
        value={selectedStepId}
        onChange={(e) => setSelectedStepId(e.target.value)}
      >
        {PIPELINE_STEPS.map((step) => {
          const st = stepStatuses[step.id];
          const statusLabel = st
            ? st.status === "completed"
              ? " \u2713"
              : st.status === "failed"
                ? " \u2717"
                : st.status === "running"
                  ? " \u25B6"
                  : ""
            : "";
          return (
            <option key={step.id} value={step.id}>
              Step {step.number}: {step.title}
              {statusLabel}
            </option>
          );
        })}
      </Select>

      {/* Step header */}
      <div className="space-y-[var(--space-1)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {selectedStep.title}
        </h3>
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {selectedStep.description}
        </p>
      </div>

      {/* Dependencies */}
      {selectedStep.dependencies.length > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          <span className="font-medium">Depends on:</span>{" "}
          {selectedStep.dependencies
            .map((d) => PIPELINE_STEPS.find((s) => s.id === d)?.title ?? d)
            .join(", ")}
        </div>
      )}

      {/* Plan info */}
      {stepPlan && (
        <div
          className={`flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-2)] text-xs ${
            stepPlan.needs_run
              ? "border border-[var(--color-status-warning-border,#fbbf24)] bg-[var(--color-status-warning-bg,#fef3c7)] text-[var(--color-status-warning-text,#92400e)]"
              : "border border-[var(--color-status-success-border,#34d399)] bg-[var(--color-status-success-bg,#d1fae5)] text-[var(--color-status-success-text,#065f46)]"
          }`}
        >
          {stepPlan.needs_run ? (
            <>
              <AlertTriangle size={13} />
              Needs run: {stepPlan.reasons.join(", ")}
            </>
          ) : (
            <>
              <CircleCheck size={13} />
              Up to date
            </>
          )}
        </div>
      )}

      {/* Current status */}
      {stepStatus && stepStatus.status !== "pending" && (
        <div className="flex items-center gap-[var(--space-2)] text-xs text-[var(--color-text-secondary)]">
          <StatusIcon status={stepStatus.status} />
          <span className="capitalize">{stepStatus.status}</span>
          {stepStatus.error && (
            <span className="text-[var(--color-status-danger)]">
              — {stepStatus.error}
            </span>
          )}
        </div>
      )}

      {/* Config sections */}
      <StepConfigDisplay stepConfig={stepConfig} isLoading={configLoading} />

      {/* Run / reset */}
      <div className="flex items-center gap-[var(--space-2)]">
        <Button
          onClick={() => onStepRun(selectedStep)}
          disabled={runningStep !== null}
          className="gap-[var(--space-2)]"
        >
          {runningStep === selectedStep.id ? (
            <Loader size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          Run Step {selectedStep.number}: {selectedStep.title}
        </Button>
        <button
          type="button"
          onClick={() => onStepReset(selectedStep.id)}
          disabled={runningStep !== null}
          className="flex items-center gap-1 text-xs text-[var(--color-status-danger)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
        >
          <Refresh size={12} />
          Reset step
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <CircleCheck
          size={13}
          className="text-[var(--color-status-success)]"
        />
      );
    case "running":
      return (
        <Loader
          size={13}
          className="animate-spin text-[var(--color-status-info)]"
        />
      );
    case "failed":
      return (
        <AlertTriangle
          size={13}
          className="text-[var(--color-status-danger)]"
        />
      );
    default:
      return <Clock size={13} className="text-[var(--color-text-muted)]" />;
  }
}

// ---------------------------------------------------------------------------
// Viewport: execution log & progress
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: Date;
  step: string;
  type: "info" | "success" | "error" | "progress";
  message: string;
}

function WorkflowViewport({
  log,
  runningStep,
}: {
  log: LogEntry[];
  runningStep: string | null;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log]);

  if (log.length === 0 && !runningStep) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[var(--space-4)] text-[var(--color-text-muted)]">
        <Play size={48} strokeWidth={1} />
        <span className="text-sm">Select a step and click Run to start</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Running indicator */}
      {runningStep && (
        <div className="flex items-center gap-[var(--space-2)] border-b border-[var(--color-border-subtle)] bg-[var(--color-status-info-bg,#dbeafe)] px-[var(--space-4)] py-[var(--space-2)]">
          <Loader
            size={14}
            className="animate-spin text-[var(--color-status-info)]"
          />
          <span className="text-xs font-medium text-[var(--color-status-info)]">
            Running:{" "}
            {PIPELINE_STEPS.find((s) => s.id === runningStep)?.title ??
              runningStep}
          </span>
        </div>
      )}

      {/* Log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-[var(--space-4)] font-mono text-xs leading-relaxed"
      >
        {log.map((entry, i) => (
          <div key={i} className="flex gap-[var(--space-3)] py-px">
            <span className="shrink-0 text-[var(--color-text-muted)]">
              {entry.timestamp.toLocaleTimeString()}
            </span>
            <span className="w-20 shrink-0 text-[var(--color-text-muted)]">
              [{entry.step}]
            </span>
            <span
              className={
                entry.type === "error"
                  ? "text-[var(--color-status-danger)]"
                  : entry.type === "success"
                    ? "text-[var(--color-status-success)]"
                    : entry.type === "progress"
                      ? "text-[var(--color-status-info)]"
                      : "text-[var(--color-text-primary)]"
              }
            >
              {entry.type === "success" && "\u2713 "}
              {entry.type === "error" && "\u2717 "}
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DemoWorkflowPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const [options, setOptions] = React.useState<ProjectOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = React.useState(false);
  const [plan, setPlan] = React.useState<StepPlan[] | null>(null);
  const [stepStatuses, setStepStatuses] = React.useState<
    Record<string, PipelineStepStatus>
  >({});
  const [log, setLog] = React.useState<LogEntry[]>([]);
  const [runningStep, setRunningStep] = React.useState<string | null>(null);

  // Fetch options + plan + status when project loads
  React.useEffect(() => {
    if (!projectId) {
      setOptions(null);
      setPlan(null);
      setStepStatuses({});
      return;
    }
    let cancelled = false;

    setOptionsLoading(true);

    // Fetch independently so a plan/status failure doesn't break options
    fetchProjectOptions(projectId)
      .then((data) => { if (!cancelled) setOptions(data); })
      .catch(() => { if (!cancelled) setOptions(null); })
      .finally(() => { if (!cancelled) setOptionsLoading(false); });

    fetchPipelinePlan(projectId)
      .then((data) => { if (!cancelled) setPlan(data.steps); })
      .catch(() => { if (!cancelled) setPlan(null); });

    fetchPipelineStatus(projectId)
      .then((data) => { if (!cancelled) setStepStatuses(data); })
      .catch(() => { if (!cancelled) setStepStatuses({}); });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const addLog = React.useCallback(
    (step: string, type: LogEntry["type"], message: string) => {
      setLog((prev) => [
        ...prev,
        { timestamp: new Date(), step, type, message },
      ]);
    },
    [],
  );

  const refreshOptions = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await fetchProjectOptions(projectId);
      setOptions(data);
    } catch {
      // ignore
    }
  }, [projectId]);

  const refreshStatus = React.useCallback(async () => {
    if (!projectId) return;
    try {
      const [planData, statusData] = await Promise.all([
        fetchPipelinePlan(projectId),
        fetchPipelineStatus(projectId),
      ]);
      setPlan(planData.steps);
      setStepStatuses(statusData);
    } catch {
      // ignore
    }
  }, [projectId]);

  const handleReset = React.useCallback(async () => {
    if (!projectId) return;
    try {
      await resetPipeline(projectId);
      await refreshStatus();
      addLog("pipeline", "info", "Pipeline reset — all steps marked dirty.");
    } catch {
      addLog("pipeline", "error", "Failed to reset pipeline.");
    }
  }, [projectId, refreshStatus, addLog]);

  const handleResetStep = React.useCallback(
    async (stepId: string) => {
      if (!projectId) return;
      try {
        await resetPipelineStep(projectId, stepId);
        await refreshStatus();
        addLog(stepId, "info", `Step "${stepId}" reset — marked dirty.`);
      } catch {
        addLog(stepId, "error", `Failed to reset step "${stepId}".`);
      }
    },
    [projectId, refreshStatus, addLog],
  );

  const handleRunStep = React.useCallback(
    async (step: StepDef) => {
      if (!projectId || runningStep) return;

      setRunningStep(step.id);
      addLog(step.id, "info", `Starting step ${step.number}: ${step.title}...`);

      try {
        // Fire-and-forget: start the step
        await runPipelineStep(projectId, step.id);

        // Poll for progress
        let seenMessages = 0;
        const poll = async (): Promise<void> => {
          for (;;) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const p = await fetchStepProgress(projectId, step.id);

              // Log new messages
              for (let i = seenMessages; i < p.messages.length; i++) {
                addLog(step.id, "progress", p.messages[i]);
              }
              seenMessages = p.messages.length;

              if (p.done) {
                const result = p.result;
                if (result?.status === "completed") {
                  addLog(step.id, "success", `Step ${step.number}: ${step.title} completed.`);
                } else if (result?.status === "failed") {
                  addLog(step.id, "error", `Step ${step.number}: ${step.title} failed: ${result.error ?? "Unknown error"}`);
                }
                return;
              }
            } catch {
              // Polling failed, keep trying
            }
          }
        };
        await poll();
      } catch (err) {
        addLog(step.id, "error", `Step ${step.number}: ${step.title} — request failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      setRunningStep(null);
      await refreshStatus();
    },
    [projectId, runningStep, addLog, refreshStatus],
  );

  // No project loaded
  if (!projectId) {
    return (
      <ProjectSettingsPage
        title="Workflow"
        panelTitle="Pipeline"
        viewport={
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder
              variant="constellation"
              message="Load a project to start"
            />
          </div>
        }
      >
        <p className="text-sm text-[var(--color-text-muted)]">
          Load a project to test the v3 pipeline workflow.
        </p>
      </ProjectSettingsPage>
    );
  }

  return (
    <ProjectSettingsPage
      title="Workflow"
      panelTitle="Pipeline"
      viewport={<WorkflowViewport log={log} runningStep={runningStep} />}
    >
      {/* Section 1: Project options */}
      <div className="space-y-[var(--space-2)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Project Options
          </h3>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {activeProject?.name}
          </span>
        </div>
        <ProjectOptionsSection
          projectId={projectId}
          options={options}
          loading={optionsLoading}
          onOptionsChanged={refreshOptions}
        />
      </div>

      {/* Divider */}
      <div className="my-[var(--space-4)] border-t border-[var(--color-border-subtle)]" />

      {/* Section 2: Workflow steps */}
      <div className="space-y-[var(--space-2)]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Workflow
          </h3>
          <div className="flex items-center gap-[var(--space-3)]">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 text-xs text-[var(--color-status-danger)] hover:text-[var(--color-text-primary)]"
            >
              <Refresh size={12} />
              Reset all
            </button>
            <button
              type="button"
              onClick={refreshStatus}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <Refresh size={12} />
              Refresh
            </button>
          </div>
        </div>
        <WorkflowSection
          projectId={projectId}
          onStepRun={handleRunStep}
          onStepReset={handleResetStep}
          stepStatuses={stepStatuses}
          plan={plan}
          runningStep={runningStep}
        />
      </div>
    </ProjectSettingsPage>
  );
}
