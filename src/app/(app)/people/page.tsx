import { PeopleView } from "@/components/people/people-view";
import { getCompanyRules, loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const [{ people, tags, stages, templates, account }, companyRules] = await Promise.all([loadWorkspaceData(), getCompanyRules()]);
  return <PeopleView people={people} tags={tags} stages={stages} templates={templates} account={account} companyRules={companyRules} />;
}
