import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/data";
import { loadPlan } from "@/lib/content-plan";
import { linkedinConfigured } from "@/lib/linkedin-posting";
import { linkedInPostingOf, timeZoneOf, timerStatus, toPostView } from "@/lib/posts";
import { ContentShell } from "@/components/content/content-shell";
import { PlanView } from "@/components/content/plan-view";
import { PostsView } from "@/components/posts/posts-view";

export const dynamic = "force-dynamic";

/** Content: the plan (?tab=plan, the default) and the posts themselves (?tab=posts), at /posts. */
export default async function ContentPage({ searchParams }: PageProps<"/posts">) {
  const workspace = await getWorkspace();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  // Links to one post (from Claude, the plan) open Posts.
  const tab = one("tab") === "posts" || (!one("tab") && (one("post") || one("new"))) ? "posts" : "plan";

  if (tab === "plan") {
    const plan = await loadPlan(workspace);
    return (
      <ContentShell tab="plan">
        <PlanView
          key={`${one("row")}-${one("add")}`}
          plan={plan}
          initialRow={one("row")}
          initialView={one("view") === "calendar" ? "calendar" : one("view") === "table" ? "table" : "agenda"}
          openAdd={one("add") === "1"}
        />
      </ContentShell>
    );
  }

  const newKind = one("new");
  const entryId = one("entry");
  const [rows, timer, entry] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: workspace.id },
      include: { planEntry: { select: { day: true, time: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    timerStatus(),
    entryId ? db.planEntry.findFirst({ where: { id: entryId, workspaceId: workspace.id } }) : null,
  ]);
  return (
    <ContentShell tab="posts">
      <PostsView
        key={`${newKind}-${entryId}-${one("post")}`}
        posts={rows.map(toPostView)}
        linkedin={{ ...linkedInPostingOf(workspace), configured: linkedinConfigured() }}
        authorName={workspace.linkedinPostName ?? workspace.name}
        authorInitials={workspace.initials}
        timerRunning={timer.running}
        commentDelay={workspace.firstCommentDelay}
        timeZone={timeZoneOf(workspace)}
        initialId={one("post")}
        newDraft={
          newKind === "post" || newKind === "article"
            ? {
                kind: newKind,
                // Written for a plan row: it starts from the row's topic (an article's title) or hook (a post's first line).
                entryId: entry?.id,
                title: newKind === "article" ? (entry?.topic ?? "") : "",
                body: newKind === "post" ? (entry?.hook ?? "") : "",
              }
            : undefined
        }
      />
    </ContentShell>
  );
}
