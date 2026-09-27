import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EXTENSION_HINT_COOKIE, readExtensionHint } from "@/lib/extension";
import { db } from "@/lib/db";
import { getAccount, getWorkspace, helperTokenFor } from "@/lib/data";
import { AuthShell } from "@/components/auth/auth-shell";
import { Welcome } from "./welcome";

export const dynamic = "force-dynamic";

/** Onboarding: install the extension, LinkedIn, sync. Full screen, before the app. */
export default async function WelcomePage() {
  const workspace = await getWorkspace();
  if (workspace.onboardedAt) redirect("/inbox");
  const hint = readExtensionHint((await cookies()).get(EXTENSION_HINT_COOKIE)?.value);
  const [account, people, token] = await Promise.all([
    getAccount(workspace.id),
    db.person.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    helperTokenFor(workspace),
  ]);
  return (
    <AuthShell>
      <Welcome helper={account.helper} people={people} token={token} accountName={workspace.name} hint={hint} />
    </AuthShell>
  );
}
