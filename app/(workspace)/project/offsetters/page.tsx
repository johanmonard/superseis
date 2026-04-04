import { ProjectSettingsPage } from "@/components/features/project/project-settings-page";
import { ProjectOffsetters } from "@/components/features/project/project-offsetters";

export default function OffsettersPage() {
  return (
    <ProjectSettingsPage title="Offsetters">
      <ProjectOffsetters />
    </ProjectSettingsPage>
  );
}
