import { getWorkspace, getAccount, getTemplates } from "@/lib/data";
import { db } from "@/lib/db";
import { newHelperToken } from "@/lib/auth";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getWorkspace();
  // Accounts created before the helper existed get a token on first visit.
  const helperToken =
    workspace.helperToken ??
    (await db.workspace.update({ where: { id: workspace.id }, data: { helperToken: newHelperToken() } })).helperToken!;
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
