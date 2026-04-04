import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectTerrain } from "@/components/features/project/project-terrain";

export default function TerrainPage() {
  return (
    <ProjectSettingsPage title="Terrain">
      <ProjectTerrain />
    </ProjectSettingsPage>
  );
}
