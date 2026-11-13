import "server-only";
import type { Post } from "@prisma/client";
import { db } from "./db";
import type { LinkedInMedia } from "./linkedin-posting";
import { cannotAdd, docTitleOf, dueForCleanup, KEEP_AFTER_PUBLISH_MS, mediaKindOf, PART_BYTES, type MediaKind, type MediaView } from "./media";
import { readMedia, removeFile } from "./media-store";

/*
 * Post images, PDFs and videos on the server: adding one to a post, sending
 * them to LinkedIn with it, and deleting the files once it is published (a
 * video as soon as it is live, images and PDFs the day after).
 */

/** The stored pieces of a file, first to last: a video's 4 MB parts, or the one whole file. */
export function chunksOf(m: { url: string; parts?: string | null }): string[] {
  if (!m.parts) return [m.url];
  try {
    const list = JSON.parse(m.parts) as unknown;
    if (Array.isArray(list) && list.length && list.every((u) => typeof u === "string")) return list as string[];
  } catch {}
  return [m.url];
}

/** Deletes every stored file of one post file (all of a video's parts). */
export async function removeMediaFiles(m: { url: string; parts?: string | null }): Promise<void> {
  for (const url of new Set([m.url, ...chunksOf(m)])) await removeFile(url);
}

/**
 * Reads bytes first..last (both included) of a file kept in chunks. Every
 * chunk but the last is PART_BYTES long (that is how the page cuts them).
 * The last chunk read is kept, since ranges often start where one ended.
 */
export function chunkReader(chunks: string[]) {
  let cached: { index: number; bytes: Uint8Array } | null = null;
  const chunk = async (index: number) => {
    if (cached?.index !== index) cached = { index, bytes: await readMedia(chunks[index]) };
    return cached.bytes;
  };
  return async (first: number, last: number): Promise<Uint8Array> => {
    const out: Uint8Array[] = [];
    for (let i = Math.floor(first / PART_BYTES); i <= Math.floor(last / PART_BYTES) && i < chunks.length; i++) {
      const bytes = await chunk(i);
      const start = i * PART_BYTES;
      out.push(bytes.subarray(Math.max(0, first - start), Math.min(bytes.length, last - start + 1)));
    }
    return out.length === 1 ? out[0] : new Uint8Array(Buffer.concat(out));
  };
}

/** Files can change while the post has not gone out. */
export function mediaEditable(post: Pick<Post, "status" | "kind">): boolean {
  return post.kind === "post" && ["draft", "scheduled", "failed"].includes(post.status);
}

/** Adds a stored file to a post, after the same checks the page makes. */
export async function addMedia(
  post: Pick<Post, "id" | "workspaceId" | "status" | "kind">,
  file: { url: string; name: string; contentType: string; size: number; parts?: string[] },
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
      parts: file.parts?.length ? JSON.stringify(file.parts) : "",
      position: current.reduce((max, m) => Math.max(max, m.position + 1), 0),
    },
  });
  return row.id;
}

/** The post's files as the page shows them, in order. */
export function toMediaViews(
  rows: { id: string; kind: string; name: string; size: number; deletedAt: Date | null; position: number }[],
  docTitle = "",
): MediaView[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      kind: m.kind === "document" || m.kind === "video" ? m.kind : "image",
      name: m.name,
      size: m.size,
      src: m.deletedAt ? undefined : `/api/media/${m.id}`,
      removedAt: m.deletedAt?.toISOString(),
      ...(m.kind === "document" || m.kind === "video" ? { title: docTitle } : {}),
    }));
}

/** What goes to LinkedIn with the post: its images in order, its PDF or its video. Nothing when it has none. */
export async function mediaForLinkedIn(post: Pick<Post, "id" | "body" | "docTitle">): Promise<LinkedInMedia | undefined> {
  const rows = await db.postMedia.findMany({ where: { postId: post.id, deletedAt: null }, orderBy: { position: "asc" } });
  if (rows.length === 0) return undefined;
  const pdf = rows.find((m) => m.kind === "document");
  if (pdf) {
    // The title typed for the PDF, else its file name. Never the plan's name for the post ("Monday carousel").
    const title = docTitleOf({ title: post.docTitle, name: pdf.name }) || post.body.split("\n")[0].slice(0, 100);
    return { kind: "document", bytes: await readMedia(pdf.url), title };
  }
  const video = rows.find((m) => m.kind === "video");
  if (video) {
    const title = docTitleOf({ title: post.docTitle, name: video.name }) || post.body.split("\n")[0].slice(0, 100);
    return { kind: "video", size: video.size, title, read: chunkReader(chunksOf(video)) };
  }
  const images = [];
  for (const m of rows) images.push({ bytes: await readMedia(m.url), alt: m.alt || undefined });
  return { kind: "images", images };
}

/** Deletes every file of a post now: the post is being deleted before it went out. */
export async function deleteAllMedia(postId: string): Promise<void> {
  const rows = await db.postMedia.findMany({ where: { postId, deletedAt: null } });
  for (const m of rows) await removeMediaFiles(m);
}

/** A video leaves storage as soon as its post is live: LinkedIn has its own copy, and videos are big. */
export async function removePublishedVideo(postId: string, now = new Date()): Promise<void> {
  const rows = await db.postMedia.findMany({ where: { postId, kind: "video", deletedAt: null } });
  for (const m of rows) {
    await removeMediaFiles(m);
    await db.postMedia.update({ where: { id: m.id }, data: { deletedAt: now } });
  }
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
    await removeMediaFiles(m);
    await db.postMedia.update({ where: { id: m.id }, data: { deletedAt: now } });
    removed++;
  }
  return removed;
}
