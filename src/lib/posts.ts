import "server-only";
import type { Post as PostRow } from "@prisma/client";
import { db } from "./db";
import { open, seal } from "./secret-box";
import { commentOnLinkedInPost, LinkedInPostError, linkedInPostUrl, publishLinkedInPost, refreshLinkedIn } from "./linkedin-posting";
import { COMMENT_MAX_CHARS, POST_MAX_CHARS } from "./linkedin-text";
import { DEFAULT_TIME_ZONE, validTimeZone } from "./time-zone";

/*
 * Posts and articles, shared by the Posts page, the Claude and ChatGPT
 * connector and the scheduled-posts timer. Posts publish through LinkedIn's
 * official API. Articles are never published by AILI: LinkedIn only lets
 * people publish those themselves, so AILI opens them in LinkedIn's editor.
 */

export type PostKind = "post" | "article";
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export interface PostView {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
  status: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  url?: string;
  error?: string;
  source: string;
  /** Posted under the post once it is live, after the workspace's delay. */
  firstComment: string;
  commentStatus?: "pending" | "posting" | "posted" | "failed";
  commentAt?: string;
  commentError?: string;
  createdAt: string;
  updatedAt: string;
}

export function toPostView(p: PostRow): PostView {
  return {
    id: p.id,
    kind: p.kind === "article" ? "article" : "post",
    title: p.title,
    body: p.body,
    status: (["draft", "scheduled", "publishing", "published", "failed"].includes(p.status) ? p.status : "draft") as PostStatus,
    scheduledAt: p.scheduledAt?.toISOString(),
    publishedAt: p.publishedAt?.toISOString(),
    url: linkedInPostUrl(p.linkedinUrn) ?? undefined,
    error: p.error ?? undefined,
    source: p.source,
    firstComment: p.firstComment,
    commentStatus: (["pending", "posting", "posted", "failed"].includes(p.commentStatus ?? "")
      ? p.commentStatus
      : undefined) as PostView["commentStatus"],
    commentAt: p.commentAt?.toISOString(),
    commentError: p.commentError ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function timeZoneOf(workspace: { timeZone: string | null }): string {
  return validTimeZone(workspace.timeZone) ? workspace.timeZone : DEFAULT_TIME_ZONE;
}

/** Throws a message fit to show when a post's text will not go to LinkedIn. */
export function checkPostText(text: string) {
  if (!text.trim()) throw new Error("The post is empty.");
  if (text.length > POST_MAX_CHARS) {
    throw new Error(`LinkedIn posts can be up to ${POST_MAX_CHARS.toLocaleString()} characters; this one is ${text.length.toLocaleString()}.`);
  }
}

export function checkCommentText(text: string) {
  if (text.length > COMMENT_MAX_CHARS) {
    throw new Error(`A LinkedIn comment can be up to ${COMMENT_MAX_CHARS.toLocaleString()} characters; the first comment is ${text.length.toLocaleString()}.`);
  }
}

/** A schedule time must be ahead, and not absurdly far. */
export function checkScheduleTime(at: Date, now = new Date()) {
  if (Number.isNaN(at.getTime())) throw new Error("That time is not a date.");
  if (at.getTime() < now.getTime() + 60_000) throw new Error("Pick a time at least a minute from now, or publish it now.");
  if (at.getTime() > now.getTime() + 366 * 24 * 3600_000) throw new Error("Pick a time within the next year.");
}

export interface LinkedInPosting {
  connected: boolean;
  name?: string;
  expiresAt?: string;
  /** Days until LinkedIn asks to reconnect. */
  daysLeft?: number;
  /** Connected, but the 60 days are up (and LinkedIn gave no refresh token). */
  expired: boolean;
}

export function linkedInPostingOf(workspace: {
  linkedinPostToken: string | null;
  linkedinPostRefresh: string | null;
  linkedinPostExpires: Date | null;
  linkedinPostName: string | null;
}): LinkedInPosting {
  const connected = Boolean(workspace.linkedinPostToken);
  const expired =
    connected && !workspace.linkedinPostRefresh && (workspace.linkedinPostExpires?.getTime() ?? 0) < Date.now();
  const expires = workspace.linkedinPostExpires?.getTime();
  return {
    connected,
    name: workspace.linkedinPostName ?? undefined,
    expiresAt: workspace.linkedinPostExpires?.toISOString(),
    daysLeft: expires && !workspace.linkedinPostRefresh ? Math.max(0, Math.round((expires - Date.now()) / 86400000)) : undefined,
    expired,
  };
}

/** A working access token for posting, refreshed when LinkedIn allows it. */
async function postingToken(workspaceId: string): Promise<{ token: string; author: string }> {
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const token = open(w.linkedinPostToken);
  if (!token || !w.linkedinPostUrn) {
    throw new LinkedInPostError("Connect LinkedIn posting first: Settings, Connections.", true);
  }
  const soon = Date.now() + 5 * 60_000;
  if ((w.linkedinPostExpires?.getTime() ?? 0) > soon) return { token, author: w.linkedinPostUrn };
  const refresh = open(w.linkedinPostRefresh);
  if (!refresh) throw new LinkedInPostError("LinkedIn posting has expired. Reconnect it in Settings; LinkedIn asks every 60 days.", true);
  const fresh = await refreshLinkedIn(refresh);
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      linkedinPostToken: seal(fresh.accessToken),
      linkedinPostExpires: fresh.expiresAt,
      ...(fresh.refreshToken ? { linkedinPostRefresh: seal(fresh.refreshToken) } : {}),
    },
  });
  return { token: fresh.accessToken, author: w.linkedinPostUrn };
}

/**
 * Publishes one post now. Only a draft, scheduled or failed post can go, and
 * only once: it is claimed as "publishing" first, so the timer and a click
 * at the same moment cannot post it twice.
 */
export async function publishPost(workspaceId: string, postId: string): Promise<PostRow> {
  const post = await db.post.findFirst({ where: { id: postId, workspaceId } });
  if (!post) throw new Error("That post is not in AILI any more.");
  if (post.kind === "article") throw new Error("Articles are published in LinkedIn: use Open in LinkedIn.");
  if (post.status === "published") return post;
  checkPostText(post.body);
  const claimed = await db.post.updateMany({
    where: { id: postId, workspaceId, status: { in: ["draft", "scheduled", "failed"] } },
    data: { status: "publishing", error: null },
  });
  if (claimed.count === 0) throw new Error("This post is already being published.");
  try {
    const { token, author } = await postingToken(workspaceId);
    const urn = await publishLinkedInPost(token, author, post.body);
    const now = new Date();
    const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { firstCommentDelay: true } });
    const hasComment = Boolean(post.firstComment.trim() && urn);
    const published = await db.post.update({
      where: { id: postId },
      data: {
        status: "published",
        publishedAt: now,
        linkedinUrn: urn || null,
        error: null,
        ...(hasComment
          ? { commentStatus: "pending", commentAt: new Date(now.getTime() + w.firstCommentDelay * 60_000), commentError: null }
          : {}),
      },
    });
    // "Right away": no need to wait for the timer.
    if (hasComment && w.firstCommentDelay === 0) await postFirstComment(workspaceId, postId).catch(() => {});
    return published;
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn did not publish it.";
    await db.post.update({ where: { id: postId }, data: { status: "failed", error: message } });
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Posts a published post's first comment. Claimed as "posting" first, so the
 * timer and a retry at the same moment cannot comment twice.
 */
export async function postFirstComment(workspaceId: string, postId: string): Promise<void> {
  const claimed = await db.post.updateMany({
    where: { id: postId, workspaceId, status: "published", commentStatus: { in: ["pending", "failed"] }, linkedinUrn: { not: null } },
    data: { commentStatus: "posting", commentError: null },
  });
  if (claimed.count === 0) return;
  const post = await db.post.findUniqueOrThrow({ where: { id: postId } });
  try {
    const { token, author } = await postingToken(workspaceId);
    const urn = await commentOnLinkedInPost(token, author, post.linkedinUrn!, post.firstComment.trim());
    await db.post.update({ where: { id: postId }, data: { commentStatus: "posted", commentUrn: urn || null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn did not post the comment.";
    await db.post.update({ where: { id: postId }, data: { commentStatus: "failed", commentError: message } });
    throw err instanceof Error ? err : new Error(message);
  }
}

export const TIMER_KEY = "posts-timer";

/**
 * Publishes every scheduled post whose time has come. Run by the timer every
 * few minutes, and whenever the Chrome helper checks in. A post stuck in
 * "publishing" (the server stopped mid-way) is marked failed rather than
 * retried, because LinkedIn may already have it.
 */
export async function publishDuePosts({ fromTimer = false, now = new Date() } = {}): Promise<{ published: number; failed: number }> {
  if (fromTimer) {
    await db.appState.upsert({
      where: { key: TIMER_KEY },
      create: { key: TIMER_KEY, value: now.toISOString() },
      update: { value: now.toISOString() },
    });
  }
  await db.post.updateMany({
    where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    data: { status: "failed", error: "Publishing was interrupted. Check your LinkedIn profile before trying again." },
  });
  await db.post.updateMany({
    where: { commentStatus: "posting", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    data: { commentStatus: "failed", commentError: "Posting the comment was interrupted. Check LinkedIn before trying again." },
  });
  const due = await db.post.findMany({
    where: { status: "scheduled", kind: "post", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  let published = 0;
  let failed = 0;
  for (const post of due) {
    try {
      await publishPost(post.workspaceId, post.id);
      published++;
    } catch {
      failed++;
    }
  }
  // First comments whose time has come.
  const comments = await db.post.findMany({
    where: { status: "published", commentStatus: "pending", commentAt: { lte: now } },
    orderBy: { commentAt: "asc" },
    take: 20,
  });
  for (const post of comments) {
    await postFirstComment(post.workspaceId, post.id).catch(() => {});
  }
  return { published, failed };
}

/** When the scheduled-posts timer last ran, if ever, and whether that was recent (it should run every 5 minutes). */
export async function timerStatus(): Promise<{ lastRun?: string; running: boolean }> {
  const row = await db.appState.findUnique({ where: { key: TIMER_KEY } });
  const last = row ? new Date(row.value).getTime() : 0;
  return { lastRun: row?.value, running: Date.now() - last < 30 * 60_000 };
}
