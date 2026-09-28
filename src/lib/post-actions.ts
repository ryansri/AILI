"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { checkPostText, checkScheduleTime, publishPost } from "./posts";
import { validTimeZone } from "./time-zone";

/*
 * Server actions for the Posts page and the AI and LinkedIn parts of Settings.
 * Each resolves the logged-in workspace first and only touches its own rows.
 */

async function ownPost(postId: string) {
  const workspace = await getWorkspace();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: workspace.id } });
  if (!post) throw new Error("That post is not in AILI any more.");
  return { workspace, post };
}

function done() {
  revalidatePath("/posts");
}

/** New post or article, or an edit of one not yet published. Returns its id. */
export async function savePost(input: { id?: string; kind: "post" | "article"; title?: string; body: string }): Promise<string> {
  const body = input.body.trim();
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (input.kind === "post") checkPostText(body);
  else if (!title || !body) throw new Error("An article needs a title and some text.");
  if (input.id) {
    const { post } = await ownPost(input.id);
    if (post.status === "published" || post.status === "publishing") throw new Error("It is already published. Edit it on LinkedIn.");
    await db.post.update({ where: { id: post.id }, data: { body, title } });
    done();
    return post.id;
  }
  const workspace = await getWorkspace();
  const post = await db.post.create({ data: { workspaceId: workspace.id, kind: input.kind, title, body, source: "AILI" } });
  done();
  return post.id;
}

/** at: an ISO time from the browser's date picker. */
export async function schedulePost(postId: string, at: string) {
  const { post } = await ownPost(postId);
  if (post.kind === "article") throw new Error("Articles are scheduled in LinkedIn's own editor.");
  if (post.status === "published" || post.status === "publishing") throw new Error("It is already published.");
  const when = new Date(at);
  checkScheduleTime(when);
  checkPostText(post.body);
  await db.post.update({ where: { id: post.id }, data: { status: "scheduled", scheduledAt: when, error: null } });
  done();
}

export async function unschedulePost(postId: string) {
  const { post } = await ownPost(postId);
  await db.post.updateMany({
    where: { id: post.id, status: { in: ["scheduled", "failed"] } },
    data: { status: "draft", scheduledAt: null, error: null },
  });
  done();
}

/** Publish now. Returns the LinkedIn address when there is one. */
export async function publishPostNow(postId: string): Promise<{ url?: string }> {
  const { workspace, post } = await ownPost(postId);
  const published = await publishPost(workspace.id, post.id);
  done();
  return { url: published.linkedinUrn ? `https://www.linkedin.com/feed/update/${published.linkedinUrn}/` : undefined };
}

export async function deletePost(postId: string) {
  const { post } = await ownPost(postId);
  if (post.status === "publishing") throw new Error("It is being published right now.");
  await db.post.delete({ where: { id: post.id } });
  done();
}

/** An article the user published themselves in LinkedIn. */
export async function markArticlePublished(postId: string, published = true) {
  const { post } = await ownPost(postId);
  if (post.kind !== "article") throw new Error("Only articles are marked by hand.");
  await db.post.update({
    where: { id: post.id },
    data: published ? { status: "published", publishedAt: new Date() } : { status: "draft", publishedAt: null },
  });
  done();
}

/** The browser's time zone, so "Tuesday 9am" from Claude or ChatGPT means 9am where the user is. */
export async function saveTimeZone(timeZone: string) {
  if (!validTimeZone(timeZone)) return;
  const workspace = await getWorkspace();
  if (workspace.timeZone === timeZone) return;
  await db.workspace.update({ where: { id: workspace.id }, data: { timeZone } });
}

export async function disconnectLinkedInPosting() {
  const workspace = await getWorkspace();
  await db.workspace.update({
    where: { id: workspace.id },
    data: { linkedinPostToken: null, linkedinPostRefresh: null, linkedinPostExpires: null, linkedinPostUrn: null, linkedinPostName: null },
  });
  revalidatePath("/settings");
  done();
}

/** Ends every connection of one app (e.g. all of Claude's) to this account. */
export async function disconnectAiApp(clientName: string) {
  const workspace = await getWorkspace();
  await db.aiGrant.updateMany({
    where: { workspaceId: workspace.id, clientName, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings");
}
