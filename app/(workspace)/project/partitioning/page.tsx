import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectPartitioning } from "@/components/features/project/project-partitioning";
import { ViewportPlaceholder } from "@/components/features/project/viewport-placeholder";

export default function PartitioningPage() {
  return (
    <ProjectSettingsPage
      title="Partitioning"
      viewport={
        <div className="flex h-full flex-col items-center justify-center p-[var(--space-4)]">
          <ViewportPlaceholder variant="constellation" message="Add polygons" />
        </div>
      }
    >
      <ProjectPartitioning />
    </ProjectSettingsPage>
  );
}
