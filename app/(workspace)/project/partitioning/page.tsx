import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectPartitioning } from "@/components/features/project/project-partitioning";

export default function PartitioningPage() {
  return (
    <ProjectSettingsPage title="Partitioning">
      <ProjectPartitioning />
    </ProjectSettingsPage>
  );
}
