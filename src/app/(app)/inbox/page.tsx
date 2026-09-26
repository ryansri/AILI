import { InboxView } from "@/components/inbox/inbox-view";
import { loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { person } = await searchParams;
  const { people, tags, stages, templates, account } = await loadWorkspaceData();
  const initialPersonId = typeof person === "string" ? person : null;
  return (
    <InboxView people={people} tags={tags} stages={stages} templates={templates} account={account} initialPersonId={initialPersonId} />
  );
}
