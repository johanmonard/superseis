import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectDesign } from "@/components/features/project/project-design";
import { ProjectDesignOptions } from "@/components/features/project/project-design-options";

export default function DesignPage() {
  return (
    <ProjectSettingsPage title="Design" panelTitle="Attributes">
      <ProjectDesign />
      <div className="mt-[var(--control-height-md)]">
        <h2 className="mb-[var(--space-4)] text-sm font-semibold text-[var(--color-text-primary)]">
          Options
        </h2>
        <ProjectDesignOptions />
      </div>
    </ProjectSettingsPage>
  );
}
