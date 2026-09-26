import { Rail } from "@/components/shell/rail";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadWorkspaceData } from "@/lib/data";
import { nextStep } from "@/lib/next-step";
import { tabOf } from "@/lib/rows";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { workspace, people, account } = await loadWorkspaceData();
  const now = new Date();
  const needsYou = people.filter((p) => tabOf(nextStep(p, now).kind) === "needs").length;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <Rail
          initials={workspace.initials}
          needsYou={needsYou}
          helper={account.helper}
          sentLine={`${account.sentToday} of ${account.dailyCap} sent today.`}
        />
        <main className="flex min-w-0 flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}
