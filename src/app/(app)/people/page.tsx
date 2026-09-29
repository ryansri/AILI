import { PeopleView } from "@/components/people/people-view";
import { getCompanyRules, getInviteFacts, loadWorkspaceData } from "@/lib/data";
import { timeZoneOf } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ alerts?: string }> }) {
  const [{ workspace, people, tags, stages, templates, account }, companyRules, inviteFacts, params] = await Promise.all([
    loadWorkspaceData(),
    getCompanyRules(),
    getInviteFacts(),
    searchParams,
  ]);
  return (
    <PeopleView
      people={people}
      tags={tags}
      stages={stages}
      templates={templates}
      account={account}
      companyRules={companyRules}
      inviteFacts={inviteFacts}
      timeZone={timeZoneOf(workspace)}
      openAlerts={params.alerts === "1"}
    />
  );
}
