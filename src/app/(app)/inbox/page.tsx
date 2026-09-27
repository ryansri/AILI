import { InboxView } from "@/components/inbox/inbox-view";
import { helperTokenFor, loadWorkspaceData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const { person } = await searchParams;
  const { workspace, people, others, tags, stages, templates, account } = await loadWorkspaceData();
  const initialPersonId = typeof person === "string" ? person : null;
  // Only needed for the setup card, before anything has synced.
  const helperToken = people.length + others.length === 0 ? await helperTokenFor(workspace) : "";
  return (
    <InboxView
      people={people}
      others={others}
      tags={tags}
      stages={stages}
      templates={templates}
      account={account}
      helperToken={helperToken}
      initialPersonId={initialPersonId}
    />
  );
}
