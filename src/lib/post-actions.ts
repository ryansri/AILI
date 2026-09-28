"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { checkCommentText, checkPostText, checkScheduleTime, postFirstComment, publishPost } from "./posts";
import { FIRST_COMMENT_DELAYS } from "./linkedin-text";
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
async function savePostImpl(input: {
  id?: string;
  kind: "post" | "article";
  title?: string;
  body: string;
  firstComment?: string;
}): Promise<string> {
  const body = input.body.trim();
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const firstComment = input.kind === "post" ? (input.firstComment ?? "").trim() : "";
  if (input.kind === "post") {
    checkPostText(body);
    checkCommentText(firstComment);
  } else if (!title || !body) throw new Error("An article needs a title and some text.");
  if (input.id) {
    const { post } = await ownPost(input.id);
    if (post.status === "published" || post.status === "publishing") throw new Error("It is already published. Edit it on LinkedIn.");
    await db.post.update({ where: { id: post.id }, data: { body, title, firstComment } });
    done();
    return post.id;
  }
  const workspace = await getWorkspace();
  const post = await db.post.create({
    data: { workspaceId: workspace.id, kind: input.kind, title, body, firstComment, source: "AILI" },
  });
  done();
  return post.id;
}

/** at: an ISO time from the browser's date picker. */
async function schedulePostImpl(postId: string, at: string) {
  const { post } = await ownPost(postId);
  if (post.kind === "article") throw new Error("Articles are scheduled in LinkedIn's own editor.");
  if (post.status === "published" || post.status === "publishing") throw new Error("It is already published.");
  const when = new Date(at);
  checkScheduleTime(when);
  checkPostText(post.body);
  await db.post.update({ where: { id: post.id }, data: { status: "scheduled", scheduledAt: when, error: null } });
  done();
}

async function unschedulePostImpl(postId: string) {
  const { post } = await ownPost(postId);
  await db.post.updateMany({
    where: { id: post.id, status: { in: ["scheduled", "failed"] } },
    data: { status: "draft", scheduledAt: null, error: null },
  });
  done();
}

/** Publish now. Returns the LinkedIn address when there is one. */
async function publishPostNowImpl(postId: string): Promise<{ url?: string }> {
  const { workspace, post } = await ownPost(postId);
  const published = await publishPost(workspace.id, post.id);
  done();
  return { url: published.linkedinUrn ? `https://www.linkedin.com/feed/update/${published.linkedinUrn}/` : undefined };
}

/** Try a first comment again after LinkedIn refused it. */
async function retryFirstCommentImpl(postId: string) {
  const { workspace, post } = await ownPost(postId);
  if (post.commentStatus !== "failed") return;
  await postFirstComment(workspace.id, post.id);
  done();
}

/** Settings: how many minutes after a post goes live its first comment follows. */
async function updateFirstCommentDelayImpl(minutes: number) {
  if (!FIRST_COMMENT_DELAYS.includes(minutes)) throw new Error("Pick one of the listed times.");
  const workspace = await getWorkspace();
  await db.workspace.update({ where: { id: workspace.id }, data: { firstCommentDelay: minutes } });
  revalidatePath("/settings", "layout");
}

async function deletePostImpl(postId: string) {
  const { post } = await ownPost(postId);
  if (post.status === "publishing") throw new Error("It is being published right now.");
  await db.post.delete({ where: { id: post.id } });
  done();
}

/** An article the user published themselves in LinkedIn. */
async function markArticlePublishedImpl(postId: string, published = true) {
  const { post } = await ownPost(postId);
  if (post.kind !== "article") throw new Error("Only articles are marked by hand.");
  await db.post.update({
    where: { id: post.id },
    data: published ? { status: "published", publishedAt: new Date() } : { status: "draft", publishedAt: null },
  });
  done();
}

/** The browser's time zone, so "Tuesday 9am" from Claude or ChatGPT means 9am where the user is. */
async function saveTimeZoneImpl(timeZone: string) {
  if (!validTimeZone(timeZone)) return;
  const workspace = await getWorkspace();
  if (workspace.timeZone === timeZone) return;
  await db.workspace.update({ where: { id: workspace.id }, data: { timeZone } });
}

async function disconnectLinkedInPostingImpl() {
  const workspace = await getWorkspace();
  await db.workspace.update({
    where: { id: workspace.id },
    data: { linkedinPostToken: null, linkedinPostRefresh: null, linkedinPostExpires: null, linkedinPostUrn: null, linkedinPostName: null },
  });
  revalidatePath("/settings", "layout");
  done();
}

/** Ends every connection of one app (e.g. all of Claude's) to this account. */
async function disconnectAiAppImpl(clientName: string) {
  const workspace = await getWorkspace();
  await db.aiGrant.updateMany({
    where: { workspaceId: workspace.id, clientName, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/settings", "layout");
}

// ---------------------------------------------------------------------------
// What the client calls. Each returns { ok, value } or { ok, error } (see action-result.ts).
// ---------------------------------------------------------------------------

export async function savePost(...args: Parameters<typeof savePostImpl>) {
  return run(() => savePostImpl(...args));
}

export async function schedulePost(...args: Parameters<typeof schedulePostImpl>) {
  return run(() => schedulePostImpl(...args));
}

export async function unschedulePost(...args: Parameters<typeof unschedulePostImpl>) {
  return run(() => unschedulePostImpl(...args));
}

export async function publishPostNow(...args: Parameters<typeof publishPostNowImpl>) {
  return run(() => publishPostNowImpl(...args));
}

export async function retryFirstComment(...args: Parameters<typeof retryFirstCommentImpl>) {
  return run(() => retryFirstCommentImpl(...args));
}

export async function updateFirstCommentDelay(...args: Parameters<typeof updateFirstCommentDelayImpl>) {
  return run(() => updateFirstCommentDelayImpl(...args));
}

export async function deletePost(...args: Parameters<typeof deletePostImpl>) {
  return run(() => deletePostImpl(...args));
}

export async function markArticlePublished(...args: Parameters<typeof markArticlePublishedImpl>) {
  return run(() => markArticlePublishedImpl(...args));
}

export async function saveTimeZone(...args: Parameters<typeof saveTimeZoneImpl>) {
  return run(() => saveTimeZoneImpl(...args));
}

export async function disconnectLinkedInPosting(...args: Parameters<typeof disconnectLinkedInPostingImpl>) {
  return run(() => disconnectLinkedInPostingImpl(...args));
}

export async function disconnectAiApp(...args: Parameters<typeof disconnectAiAppImpl>) {
  return run(() => disconnectAiAppImpl(...args));
}
