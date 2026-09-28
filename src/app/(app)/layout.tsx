import { Rail } from "@/components/shell/rail";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { TimeZoneSync } from "@/components/shell/time-zone-sync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { publishDuePosts } from "@/lib/posts";
import { loadWorkspaceData } from "@/lib/data";
import { nextStep } from "@/lib/next-step";
import { needsYou } from "@/lib/rows";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { workspace, people, others, account } = await loadWorkspaceData();
  // A backstop for the timer: whenever the app is open, anything overdue goes out.
  after(() => publishDuePosts().catch((err) => console.error("Publishing scheduled posts failed", err)));
  // A new account, or one reset to nothing, sets up first.
  if (!workspace.onboardedAt && people.length + others.length === 0) redirect("/welcome");
  const now = new Date();
  const needsYouCount = people.filter((p) => needsYou(nextStep(p, now).kind)).length;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <Rail
          initials={workspace.initials}
          pictureUrl={account.pictureUrl}
          needsYou={needsYouCount}
          helper={account.helper}
          sentLine={`${account.sentToday} of ${account.dailyCap} sent today.`}
        />
        <main className="flex min-w-0 flex-1">{children}</main>
        <AutoRefresh />
        <TimeZoneSync saved={workspace.timeZone} />
      </div>
    </TooltipProvider>
  );
}
