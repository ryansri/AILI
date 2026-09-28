import { getTemplates, getWorkspace } from "@/lib/data";
import { TemplatesSettings } from "@/components/templates/templates-settings";
import { SettingsPage } from "@/components/settings/settings-parts";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const workspace = await getWorkspace();
  const templates = await getTemplates(workspace.id);
  return (
    <SettingsPage title="Templates" lead="Saved messages. {first_name}, {company} and the other fields fill in for each person.">
      <TemplatesSettings templates={templates} />
    </SettingsPage>
  );
}
