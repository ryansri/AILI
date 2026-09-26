import { getWorkspace, getAccount } from "@/lib/data";
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
  const account = await getAccount(workspace.id);
  return (
    <SettingsView
      account={account}
      email={workspace.email ?? ""}
      helperToken={helperToken}
      helperMemberUrn={workspace.helperMemberUrn ?? undefined}
    />
  );
}
