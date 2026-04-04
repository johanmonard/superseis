"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "todo" | "ongoing" | "completed";

type SettingsStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  href: string;
  status: StepStatus;
};

// ---------------------------------------------------------------------------
// Project settings pages — one step per page
// ---------------------------------------------------------------------------

function createInitialSteps(): SettingsStep[] {
  return [
    { id: "definition", number: 1, title: "Definition", description: "Project base information.", href: "/project/definition", status: "todo" },
    { id: "partitioning", number: 2, title: "Partitioning", description: "Partition the project area in regions.", href: "/project/partitioning", status: "todo" },
    { id: "design", number: 3, title: "Design", description: "Survey design parameters & region assignment.", href: "/project/design", status: "todo" },
    { id: "terrain", number: 4, title: "Terrain", description: "Define project extents and boundaries.", href: "/project/terrain", status: "todo" },
    { id: "osm", number: 5, title: "OSM", description: "OpenStreetMap data configuration.", href: "/project/osm", status: "todo" },
    { id: "layers", number: 6, title: "Layers", description: "Layer management and configuration.", href: "/project/layers", status: "todo" },
    { id: "maps", number: 7, title: "Maps", description: "Map layer composition and sorting.", href: "/project/maps", status: "todo" },
    { id: "offsetters", number: 8, title: "Offsetters", description: "Offset relocation parameters.", href: "/project/offsetters", status: "todo" },
  ];
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

function SettingsStepCard({
  step,
  onCycleStatus,
  onNavigate,
}: {
  step: SettingsStep;
  onCycleStatus: (id: string) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(step.href)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate(step.href); }}
      className="group w-52 cursor-pointer rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-[var(--space-3)] text-left shadow-[0_1px_2px_var(--color-shadow-alpha)] transition-colors hover:border-[var(--color-accent)]"
    >
      <div className="flex items-center gap-[var(--space-2)]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCycleStatus(step.id);
          }}
          className="cursor-pointer"
        >
          <span
            className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-opacity hover:opacity-80 " +
              (step.status === "completed"
                ? "bg-[var(--color-status-success)] text-white"
                : step.status === "ongoing"
                  ? "bg-[var(--color-status-info)] text-white"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]")
            }
          >
            {step.status === "completed" ? "\u2713" : step.number}
          </span>
        </button>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {step.title}
        </span>
      </div>
      <p className="mt-[var(--space-1)] text-xs text-[var(--color-text-secondary)] line-clamp-2">
        {step.description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical connector
// ---------------------------------------------------------------------------

function VLine({ height = 24 }: { height?: number }) {
  return (
    // eslint-disable-next-line template/no-jsx-style-prop -- runtime sizing
    <div className="flex justify-center" style={{ height }}>
      <div className="w-px bg-[var(--color-border-strong)] h-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectSettingsWorkflow() {
  const router = useRouter();
  const [steps, setSteps] = useState<SettingsStep[]>(createInitialSteps);

  const cycleStatus = useCallback((id: string) => {
    const cycle: Record<StepStatus, StepStatus> = { todo: "ongoing", ongoing: "completed", completed: "todo" };
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: cycle[s.status] } : s))
    );
  }, []);

  const navigate = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-[var(--space-4)] text-sm font-semibold text-[var(--color-text-primary)]">
        Project Settings
      </h2>
      {steps.map((step, i) => (
        <div key={step.id}>
          {i > 0 && <VLine />}
          <div className="flex justify-center">
            <SettingsStepCard
              step={step}
              onCycleStatus={cycleStatus}
              onNavigate={navigate}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
