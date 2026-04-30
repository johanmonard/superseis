"use client";

import * as React from "react";

import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";
import { useActiveProject } from "@/lib/use-active-project";
import { useSectionData } from "@/lib/use-autosave";
import { cn } from "@/lib/utils";

interface DesignOption {
  name: string;
}
interface DesignOptionsSectionData {
  options?: DesignOption[];
}
const DEFAULT_DESIGN_OPTIONS: DesignOptionsSectionData = { options: [] };

interface SequencesUiSectionData {
  activeOptionName: string;
}
const DEFAULT_SEQUENCES_UI: SequencesUiSectionData = { activeOptionName: "" };

export default function SequencesPage() {
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const { data: designOptionsSection } = useSectionData<DesignOptionsSectionData>(
    projectId,
    "design_options",
    DEFAULT_DESIGN_OPTIONS,
  );
  const { data: ui, update: updateUi } = useSectionData<SequencesUiSectionData>(
    projectId,
    "sequences_ui",
    DEFAULT_SEQUENCES_UI,
  );

  const options = React.useMemo(
    () =>
      (designOptionsSection.options ?? []).filter(
        (o) => o.name && o.name.length > 0,
      ),
    [designOptionsSection],
  );

  // Make sure the persisted active name still matches a real option; if not,
  // fall back to the first one so the page never sits on a ghost selection.
  React.useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((o) => o.name === ui.activeOptionName)) {
      updateUi({ activeOptionName: options[0].name });
    }
  }, [options, ui.activeOptionName, updateUi]);

  return (
    <ProjectSettingsPage
      title="Sequences"
      viewport={
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder
            variant="wave-mesh"
            message="Sequences viewport"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        {options.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No grid options configured. Set them up in the Design page.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-[var(--space-1)]">
            {options.map((o) => {
              const isActive = o.name === ui.activeOptionName;
              return (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => updateUi({ activeOptionName: o.name })}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-[var(--space-3)] py-[var(--space-1)] text-xs font-medium transition-colors",
                    isActive
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                      : "bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {o.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="h-px bg-[var(--color-border-subtle)]" />
      </div>
    </ProjectSettingsPage>
  );
}
