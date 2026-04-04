import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectOsm } from "@/components/features/project/project-osm";

export default function OsmPage() {
  return (
    <ProjectSettingsPage title="OSM">
      <ProjectOsm />
    </ProjectSettingsPage>
  );
}
