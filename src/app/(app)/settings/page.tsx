import { getWorkspace, getAccount, getTemplates, helperTokenFor } from "@/lib/data";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getWorkspace();
  // Accounts created before the helper existed get a token on first visit.
  const helperToken = await helperTokenFor(workspace);
  const [account, templates] = await Promise.all([getAccount(workspace.id), getTemplates(workspace.id)]);
  return (
    <SettingsView
      account={account}
      templates={templates}
      email={workspace.email ?? ""}
      helperToken={helperToken}
      helperMemberUrn={workspace.helperMemberUrn ?? undefined}
    />
  );
}
