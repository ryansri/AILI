import { PeopleView } from "@/components/people/people-view";
import { getCompanyRules, getInviteFacts, loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [{ people, tags, stages, templates, account }, companyRules, inviteFacts] = await Promise.all([
    loadWorkspaceData(),
    getCompanyRules(),
    getInviteFacts(),
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
    />
  );
}
