import { getAccount, getWorkspace } from "@/lib/data";
import { SendingView } from "@/components/settings/sending-view";

export const dynamic = "force-dynamic";

export default async function SendingPage() {
  const workspace = await getWorkspace();
  const account = await getAccount(workspace.id, workspace);
  return (
    <SendingView
      dailyCap={account.dailyCap}
      sentToday={account.sentToday}
      notifyReplies={account.notifyReplies}
      firstCommentDelay={workspace.firstCommentDelay}
    />
  );
}
