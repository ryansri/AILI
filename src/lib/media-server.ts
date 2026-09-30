import "server-only";
import type { Post } from "@prisma/client";
import { db } from "./db";
import type { LinkedInMedia } from "./linkedin-posting";
import { cannotAdd, dueForCleanup, KEEP_AFTER_PUBLISH_MS, mediaKindOf, type MediaKind, type MediaView } from "./media";
import { readMedia, removeFile } from "./media-store";

/*
 * Post images and PDFs on the server: adding one to a post, sending them to
 * LinkedIn with it, and deleting the files the day after it is published.
 */

/** Files can change while the post has not gone out. */
export function mediaEditable(post: Pick<Post, "status" | "kind">): boolean {
  return post.kind === "post" && ["draft", "scheduled", "failed"].includes(post.status);
}

/** Adds a stored file to a post, after the same checks the page makes. */
export async function addMedia(
  post: Pick<Post, "id" | "workspaceId" | "status" | "kind">,
  file: { url: string; name: string; contentType: string; size: number },
): Promise<string> {
  if (!mediaEditable(post)) throw new Error("Images can be changed until the post goes out.");
  const current = await db.postMedia.findMany({ where: { postId: post.id, deletedAt: null }, select: { kind: true, position: true } });
  const why = cannotAdd(
    current.map((m) => ({ kind: m.kind as MediaKind })),
    file,
  );
  if (why) throw new Error(why);
  const row = await db.postMedia.create({
    data: {
      workspaceId: post.workspaceId,
      postId: post.id,
      kind: mediaKindOf(file.contentType)!,
      url: file.url,
      name: file.name.slice(0, 200),
      contentType: file.contentType,
      size: file.size,
      position: current.reduce((max, m) => Math.max(max, m.position + 1), 0),
    },
  });
  return row.id;
}

/** The post's files as the page shows them, in order. */
export function toMediaViews(rows: { id: string; kind: string; name: string; size: number; deletedAt: Date | null; position: number }[]): MediaView[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      kind: m.kind === "document" ? "document" : "image",
      name: m.name,
      size: m.size,
      src: m.deletedAt ? undefined : `/api/media/${m.id}`,
      removedAt: m.deletedAt?.toISOString(),
    }));
}

/** What goes to LinkedIn with the post: its images in order, or its PDF. Nothing when it has none. */
export async function mediaForLinkedIn(post: Pick<Post, "id" | "title" | "body">): Promise<LinkedInMedia | undefined> {
  const rows = await db.postMedia.findMany({ where: { postId: post.id, deletedAt: null }, orderBy: { position: "asc" } });
  if (rows.length === 0) return undefined;
  const pdf = rows.find((m) => m.kind === "document");
  if (pdf) {
    const title = post.title.trim() || pdf.name.replace(/\.pdf$/i, "") || post.body.split("\n")[0].slice(0, 100);
    return { kind: "document", bytes: await readMedia(pdf.url), title };
  }
  const images = [];
  for (const m of rows) images.push({ bytes: await readMedia(m.url), alt: m.alt || undefined });
  return { kind: "images", images };
}

/** Deletes every file of a post now: the post is being deleted before it went out. */
export async function deleteAllMedia(postId: string): Promise<void> {
  const rows = await db.postMedia.findMany({ where: { postId, deletedAt: null } });
  for (const m of rows) await removeFile(m.url);
}

/**
 * The day after a post is published, its files leave storage; the rows stay,
 * marked deleted, so the page can say they are still on LinkedIn. Files of
 * failed or unpublished posts are kept. Run by the posting timer.
 */
export async function cleanupPublishedMedia(now = new Date()): Promise<number> {
  const rows = await db.postMedia.findMany({
    where: {
      deletedAt: null,
      post: { status: "published", publishedAt: { lte: new Date(now.getTime() - KEEP_AFTER_PUBLISH_MS) } },
    },
    include: { post: { select: { publishedAt: true } } },
    take: 100,
  });
  let removed = 0;
  for (const m of rows) {
    if (!dueForCleanup(m.post.publishedAt, now)) continue;
    await removeFile(m.url);
    await db.postMedia.update({ where: { id: m.id }, data: { deletedAt: now } });
    removed++;
  }
  return removed;
}
