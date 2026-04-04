import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectMaps } from "@/components/features/project/project-maps";

export default function MapsPage() {
  return (
    <ProjectSettingsPage title="Maps">
      <ProjectMaps />
    </ProjectSettingsPage>
  );
}
