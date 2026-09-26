import { Rail } from "@/components/shell/rail";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadWorkspaceData } from "@/lib/data";
import { nextStep } from "@/lib/next-step";
import { needsYou } from "@/lib/rows";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { workspace, people, account } = await loadWorkspaceData();
  const now = new Date();
  const needsYouCount = people.filter((p) => needsYou(nextStep(p, now).kind)).length;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <Rail
          initials={workspace.initials}
          needsYou={needsYouCount}
          helper={account.helper}
          sentLine={`${account.sentToday} of ${account.dailyCap} sent today.`}
        />
        <main className="flex min-w-0 flex-1">{children}</main>
        <AutoRefresh />
      </div>
    </TooltipProvider>
  );
}
