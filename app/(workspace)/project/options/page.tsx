"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { Field } from "@/components/ui/field";
import { Icon, appIcons } from "@/components/ui/icon";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

const { check: Check, pencil: Pencil, plus: Plus, trash: Trash2, x: X } =
  appIcons;

/* -------------------------------------------------------------------------- */
/*  External section shapes — minimal subsets we read                         */
/* -------------------------------------------------------------------------- */

interface NamedGroup {
  id: string;
  name: string;
}
interface PartitioningSectionData {
  groups: NamedGroup[];
}
const DEFAULT_PARTITIONING: PartitioningSectionData = { groups: [] };

interface SurveySectionData {
  groups: NamedGroup[];
}
const DEFAULT_SURVEY: SurveySectionData = { groups: [] };

interface DesignOption {
  name: string;
}
interface DesignOptionsSectionData {
  options?: DesignOption[];
}
const DEFAULT_DESIGN_OPTIONS: DesignOptionsSectionData = { options: [] };

/* -------------------------------------------------------------------------- */
/*  Options section                                                           */
/* -------------------------------------------------------------------------- */

interface OptionConfig {
  id: string;
  name: string;
  /** Name of the partitioning group (Sequence partitions). */
  partitionName: string;
  /** Name of the survey group (Survey option). */
  surveyOptionName: string;
  /** Name of the grid option (Design option). */
  gridOptionName: string;
}

interface OptionsSectionData {
  options: OptionConfig[];
  activeId: string;
}

function createOption(name: string): OptionConfig {
  return {
    id: crypto.randomUUID(),
    name,
    partitionName: "",
    surveyOptionName: "",
    gridOptionName: "",
  };
}

const DEFAULT_OPTIONS: OptionsSectionData = {
  options: [createOption("Scenario 1")],
  activeId: "",
};

/* -------------------------------------------------------------------------- */
/*  Option selector — pill bar with +, rename, delete                         */
/* -------------------------------------------------------------------------- */

function OptionSelector({
  options,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  options: OptionConfig[];
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
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        {options.map((o) => {
          if (o.id === editingId) {
            return (
              <div
                key={o.id}
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
                  <Icon icon={Check} size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex h-5 w-5 items-center justify-center text-[var(--color-text-muted)]"
                >
                  <Icon icon={X} size={10} />
                </button>
              </div>
            );
          }
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              className={cn(
                "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                o.id === activeId
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                  : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {o.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
          aria-label="Add scenario"
        >
          <Icon icon={Plus} size={12} />
        </button>
      </div>
      <div className="flex items-center gap-[var(--space-1)]">
        <button
          type="button"
          onClick={() => {
            const active = options.find((o) => o.id === activeId);
            if (active) {
              setEditingId(active.id);
              setEditValue(active.name);
            }
          }}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
        >
          <Icon icon={Pencil} size={10} /> Rename
        </button>
        {options.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-[var(--space-1)] text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-status-danger)]"
          >
            <Icon icon={Trash2} size={10} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pill picker for a single string field with a known set of names           */
/* -------------------------------------------------------------------------- */

function PillPicker({
  names,
  value,
  onChange,
  emptyHint,
}: {
  names: string[];
  value: string;
  onChange: (next: string) => void;
  emptyHint: string;
}) {
  if (names.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] pt-[5px]">
        {emptyHint}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-[var(--space-1)] pt-[5px]">
      {names.map((n) => {
        const isActive = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
              isActive
                ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function OptionsPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: partitioningSection } = useSectionData<PartitioningSectionData>(
    projectId,
    "partitioning",
    DEFAULT_PARTITIONING,
  );
  const { data: surveySection } = useSectionData<SurveySectionData>(
    projectId,
    "survey",
    DEFAULT_SURVEY,
  );
  const { data: designOptionsSection } = useSectionData<DesignOptionsSectionData>(
    projectId,
    "design_options",
    DEFAULT_DESIGN_OPTIONS,
  );
  const { data: optionsSection, update: updateOptionsSection } =
    useSectionData<OptionsSectionData>(projectId, "options", DEFAULT_OPTIONS);

  const partitionNames = React.useMemo(
    () =>
      (partitioningSection.groups ?? [])
        .map((g) => g.name)
        .filter((n) => n && n.length > 0),
    [partitioningSection.groups],
  );
  const surveyNames = React.useMemo(
    () =>
      (surveySection.groups ?? [])
        .map((g) => g.name)
        .filter((n) => n && n.length > 0),
    [surveySection.groups],
  );
  const gridOptionNames = React.useMemo(
    () =>
      (designOptionsSection.options ?? [])
        .map((o) => o.name)
        .filter((n) => n && n.length > 0),
    [designOptionsSection.options],
  );

  const options = optionsSection.options;
  const activeOptionId = optionsSection.activeId || options[0]?.id || "";
  const activeOption =
    options.find((o) => o.id === activeOptionId) ?? options[0];

  const updateActiveOption = React.useCallback(
    (patch: Partial<OptionConfig>) => {
      if (!activeOption) return;
      updateOptionsSection({
        ...optionsSection,
        options: optionsSection.options.map((o) =>
          o.id === activeOption.id ? { ...o, ...patch } : o,
        ),
      });
    },
    [activeOption, optionsSection, updateOptionsSection],
  );

  const handleAdd = React.useCallback(() => {
    const next = createOption(`Scenario ${options.length + 1}`);
    updateOptionsSection({
      ...optionsSection,
      options: [...optionsSection.options, next],
      activeId: next.id,
    });
  }, [options.length, optionsSection, updateOptionsSection]);

  const handleRename = React.useCallback(
    (id: string, name: string) => {
      updateOptionsSection({
        ...optionsSection,
        options: optionsSection.options.map((o) =>
          o.id === id ? { ...o, name } : o,
        ),
      });
    },
    [optionsSection, updateOptionsSection],
  );

  const handleDelete = React.useCallback(
    (id: string) => {
      const remaining = optionsSection.options.filter((o) => o.id !== id);
      const newActiveId =
        optionsSection.activeId === id && remaining.length > 0
          ? remaining[0].id
          : optionsSection.activeId;
      updateOptionsSection({
        ...optionsSection,
        options: remaining,
        activeId: newActiveId,
      });
    },
    [optionsSection, updateOptionsSection],
  );

  if (!activeOption) {
    return (
      <ProjectSettingsPage
        title="Scenarios"
        viewport={
          <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
            <ViewportPlaceholder
              variant="wave-mesh"
              message="Scenarios viewport"
            />
          </div>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            No scenarios yet.
          </p>
          <button
            type="button"
            onClick={handleAdd}
            className="self-start inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]"
          >
            <Icon icon={Plus} size={12} /> Add scenario
          </button>
        </div>
      </ProjectSettingsPage>
    );
  }

  return (
    <ProjectSettingsPage
      title="Scenarios"
      viewport={
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder
            variant="wave-mesh"
            message="Scenarios viewport"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <OptionSelector
          options={options}
          activeId={activeOption.id}
          onSelect={(id) =>
            updateOptionsSection({ ...optionsSection, activeId: id })
          }
          onAdd={handleAdd}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        <div className="h-px bg-[var(--color-border-subtle)]" />

        <Field label="Survey option" layout="horizontal">
          <PillPicker
            names={surveyNames}
            value={activeOption.surveyOptionName}
            onChange={(n) => updateActiveOption({ surveyOptionName: n })}
            emptyHint="No survey options configured. Set them up in Project → Survey."
          />
        </Field>

        <Field label="Grid option" layout="horizontal">
          <PillPicker
            names={gridOptionNames}
            value={activeOption.gridOptionName}
            onChange={(n) => updateActiveOption({ gridOptionName: n })}
            emptyHint="No grid options configured. Set them up in Project → Design."
          />
        </Field>

        <Field label="Zippers/patches" layout="horizontal">
          <PillPicker
            names={partitionNames}
            value={activeOption.partitionName}
            onChange={(n) => updateActiveOption({ partitionName: n })}
            emptyHint="No partitions configured. Set them up in Project → Partitions."
          />
        </Field>
      </div>
    </ProjectSettingsPage>
  );
}
