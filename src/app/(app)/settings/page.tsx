import { getWorkspace, getAccount, getTemplates, helperTokenFor } from "@/lib/data";
import { connectedApps } from "@/lib/ai-oauth";
import { appOrigin } from "@/lib/app-url";
import { linkedinConfigured } from "@/lib/linkedin-posting";
import { linkedInPostingOf, timerStatus } from "@/lib/posts";
import { SettingsView } from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const workspace = await getWorkspace();
  const { linkedin: linkedinResult } = await searchParams;
  // Accounts created before the helper existed get a token on first visit.
  const helperToken = await helperTokenFor(workspace);
  const [account, templates, aiApps, timer, origin] = await Promise.all([
    getAccount(workspace.id),
    getTemplates(workspace.id),
    connectedApps(workspace.id),
    timerStatus(),
    appOrigin(),
  ]);
  return (
    <SettingsView
      account={account}
      templates={templates}
      email={workspace.email ?? ""}
      helperToken={helperToken}
      helperMemberUrn={workspace.helperMemberUrn ?? undefined}
      connectorUrl={`${origin}/mcp`}
      aiApps={aiApps}
      linkedin={{ ...linkedInPostingOf(workspace), configured: linkedinConfigured() }}
      linkedinCallbackUrl={`${origin}/api/linkedin/callback`}
      linkedinResult={typeof linkedinResult === "string" ? linkedinResult : undefined}
      timerRunning={timer.running}
    />
  );
}
