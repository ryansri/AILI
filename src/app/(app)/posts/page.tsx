import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/data";
import { getRhythms, loadContentPlan, type KindFilter } from "@/lib/content-plan";
import { linkedinConfigured } from "@/lib/linkedin-posting";
import { addDays, localDay, mondayOf } from "@/lib/plan";
import { linkedInPostingOf, timeZoneOf, timerStatus, toPostView } from "@/lib/posts";
import { ContentShell, type ContentViewKey } from "@/components/content/content-shell";
import { PlanView } from "@/components/content/plan-view";
import { CalendarView } from "@/components/content/calendar-view";
import { WeekPlanner } from "@/components/content/week-planner";
import { WeeklyReview } from "@/components/content/weekly-review";
import { PostsView } from "@/components/posts/posts-view";

export const dynamic = "force-dynamic";

const VIEWS: ContentViewKey[] = ["plan", "calendar", "all", "week", "review"];

/** Content: the plan, the calendar and every post, at /posts. */
export default async function ContentPage({ searchParams }: PageProps<"/posts">) {
  const workspace = await getWorkspace();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  // Links to one post (from Claude, results, the plan) open All posts.
  const view = (VIEWS.find((v) => v === one("view")) ?? (one("post") || one("new") ? "all" : "plan")) as ContentViewKey;
  const kind = (["post", "article"].includes(one("kind") ?? "") ? one("kind") : "all") as KindFilter;
  const timeZone = timeZoneOf(workspace);

  if (view === "all") {
    const newKind = one("new");
    const [rows, timer, rhythms] = await Promise.all([
      db.post.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" } }),
      timerStatus(),
      getRhythms(workspace.id, localDay(new Date(), timeZone)),
    ]);
    return (
      <ContentShell view="all" kind={kind} rhythms={rhythms} timeZone={timeZone}>
        <PostsView
          key={`${newKind}-${one("slot")}-${one("post")}`}
          posts={rows.map(toPostView)}
          linkedin={{ ...linkedInPostingOf(workspace), configured: linkedinConfigured() }}
          authorName={workspace.linkedinPostName ?? workspace.name}
          authorInitials={workspace.initials}
          timerRunning={timer.running}
          commentDelay={workspace.firstCommentDelay}
          timeZone={timeZone}
          initialId={one("post")}
          newDraft={
            newKind === "post" || newKind === "article"
              ? { kind: newKind, slotDay: /^\d{4}-\d{2}-\d{2}$/.test(one("slot") ?? "") ? one("slot") : undefined }
              : undefined
          }
        />
      </ContentShell>
    );
  }

  const days = Number(one("days"));
  const plan = await loadContentPlan(workspace, { horizon: [7, 14, 30].includes(days) ? days : 14, kind });
  let body: React.ReactNode;
  if (view === "calendar") {
    const offset = Math.max(-10, Math.min(0, Math.round(Number(one("offset")) || 0)));
    body = <CalendarView plan={plan} offset={offset} />;
  } else if (view === "week") {
    body = <WeekPlanner plan={plan} />;
  } else if (view === "review") {
    const asked = one("week");
    const weeks = plan.weeks.map((w) => w.week);
    // Last week by default: this week is still going.
    const fallback = addDays(mondayOf(plan.today), -7);
    const week = asked && weeks.includes(asked) ? asked : weeks.includes(fallback) ? fallback : weeks[weeks.length - 1];
    body = <WeeklyReview plan={plan} week={week} />;
  } else {
    body = <PlanView plan={plan} />;
  }
  return (
    <ContentShell view={view} kind={kind} rhythms={plan.rhythms} timeZone={timeZone}>
      {body}
    </ContentShell>
  );
}
