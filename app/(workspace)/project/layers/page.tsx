import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectLayers } from "@/components/features/project/project-layers";

export default function LayersPage() {
  return (
    <ProjectSettingsPage title="Layers">
      <ProjectLayers />
    </ProjectSettingsPage>
  );
}
