import { PeopleTable } from "@/components/people/people-table";
import { loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const { people, tags, stages } = await loadWorkspaceData();
  return <PeopleTable people={people} tags={tags} stages={stages} />;
}
