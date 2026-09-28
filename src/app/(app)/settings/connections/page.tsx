import { getAccount, getWorkspace, helperTokenFor } from "@/lib/data";
import { connectedApps } from "@/lib/ai-oauth";
import { appOrigin } from "@/lib/app-url";
import { linkedinConfigured } from "@/lib/linkedin-posting";
import { linkedInPostingOf } from "@/lib/posts";
import { ConnectionsView } from "@/components/settings/connections-view";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: PageProps<"/settings/connections">) {
  const workspace = await getWorkspace();
  const { linkedin } = await searchParams;
  const [account, apps, origin, helperToken] = await Promise.all([
    getAccount(workspace.id, workspace),
    connectedApps(workspace.id),
    appOrigin(),
    // Accounts created before the helper existed get a token on first visit.
    helperTokenFor(workspace),
  ]);
  return (
    <ConnectionsView
      helper={account.helper}
      helperToken={helperToken}
      origin={origin}
      apps={apps}
      linkedin={{ ...linkedInPostingOf(workspace), configured: linkedinConfigured() }}
      linkedinResult={typeof linkedin === "string" ? linkedin : undefined}
    />
  );
}
