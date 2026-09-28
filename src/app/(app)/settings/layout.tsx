import { getAccount, getWorkspace } from "@/lib/data";
import { linkedInPostingOf } from "@/lib/posts";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const workspace = await getWorkspace();
  const account = await getAccount(workspace.id);
  const h = account.helper;
  const posting = linkedInPostingOf(workspace);
  // Something set up has stopped working: the extension, or LinkedIn posting about to lapse.
  const warn =
    (Boolean(h.lastSeenAt) && (!h.connected || h.outdated)) ||
    (posting.connected && (posting.expired || (posting.daysLeft ?? 99) <= 7));
  return (
    <div className="flex min-w-0 flex-1">
      <SettingsNav warn={warn} />
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
