import { PeopleView } from "@/components/people/people-view";
import { loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { people, tags, stages, templates, account } = await loadWorkspaceData();
  return <PeopleView people={people} tags={tags} stages={stages} templates={templates} account={account} />;
}
