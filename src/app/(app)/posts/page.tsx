import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/data";
import { linkedinConfigured } from "@/lib/linkedin-posting";
import { linkedInPostingOf, timerStatus, toPostView } from "@/lib/posts";
import { PostsView } from "@/components/posts/posts-view";

export const dynamic = "force-dynamic";

export default async function PostsPage({ searchParams }: PageProps<"/posts">) {
  const workspace = await getWorkspace();
  const { post } = await searchParams;
  const [rows, timer] = await Promise.all([
    db.post.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" } }),
    timerStatus(),
  ]);
  return (
    <PostsView
      posts={rows.map(toPostView)}
      linkedin={{ ...linkedInPostingOf(workspace), configured: linkedinConfigured() }}
      authorName={workspace.linkedinPostName ?? workspace.name}
      authorInitials={workspace.initials}
      timerRunning={timer.running}
      initialId={typeof post === "string" ? post : undefined}
    />
  );
}
