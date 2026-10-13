import Link from "next/link";
import { getWorkspace } from "@/lib/data";
import { loadProgress } from "@/lib/progress-server";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { GoalsDialog } from "@/components/progress/goals-dialog";
import { ProgressView } from "@/components/progress/progress-view";

export const dynamic = "force-dynamic";

/** Progress: this week (the default) or this month (?view=month), against your weekly goals. */
export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  const workspace = await getWorkspace();
  const sp = await searchParams;
  const period = sp.view === "month" ? "month" : "week";
  const p = await loadProgress(workspace.id, period);
  const tab = (on: boolean) =>
    cn("flex h-7 items-center rounded-md px-3 text-sm", on ? "bg-background font-semibold shadow-xs" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Progress"
        after={
          <span className="ml-2 flex items-center gap-3">
            <span role="group" aria-label="Show" className="flex rounded-lg bg-muted p-0.5">
              <Link href="/progress" className={tab(period === "week")} aria-current={period === "week" ? "page" : undefined}>
                This week
              </Link>
              <Link href="/progress?view=month" className={tab(period === "month")} aria-current={period === "month" ? "page" : undefined}>
                This month
              </Link>
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">{p.span.label}</span>
          </span>
        }
        actions={<GoalsDialog goals={p.weeklyGoals} inviteCap={workspace.inviteCap} />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-5 sm:px-7">
        <div className="mx-auto max-w-6xl">
          <ProgressView p={p} />
        </div>
      </div>
    </div>
  );
}
