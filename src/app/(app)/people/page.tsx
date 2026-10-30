import { PeopleView } from "@/components/people/people-view";
import { getCompanyRules, loadWorkspaceData } from "@/lib/data";
import { timeZoneOf } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ alerts?: string }> }) {
  const [{ workspace, people, tags, stages, templates, account }, companyRules, params] = await Promise.all([
    loadWorkspaceData(),
    getCompanyRules(),
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
      timeZone={timeZoneOf(workspace)}
      openAlerts={params.alerts === "1"}
    />
  );
}
