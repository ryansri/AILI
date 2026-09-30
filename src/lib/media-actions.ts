"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { addMedia, mediaEditable } from "./media-server";
import { isOwnBlobUrl, removeFile } from "./media-store";

/*
 * Server actions for images and PDFs on posts. Uploads go straight from the
 * browser to storage (see /api/media); these record, remove and reorder.
 */

async function ownPost(postId: string) {
  const workspace = await getWorkspace();
  const post = await db.post.findFirst({ where: { id: postId, workspaceId: workspace.id } });
  if (!post) throw new Error("That post is not in AILI any more.");
  return post;
}

/** A file the browser just uploaded to Vercel Blob, for this post. */
async function attachMediaImpl(postId: string, file: { url: string; name: string; contentType: string; size: number }) {
  const post = await ownPost(postId);
  if (!isOwnBlobUrl(file.url, post.id)) throw new Error("That upload did not go through. Try again.");
  const id = await addMedia(post, file);
  revalidatePath("/posts");
  return id;
}

async function removeMediaImpl(mediaId: string) {
  const workspace = await getWorkspace();
  const media = await db.postMedia.findFirst({ where: { id: mediaId, workspaceId: workspace.id }, include: { post: true } });
  if (!media) return;
  if (!mediaEditable(media.post)) throw new Error("Images can be changed until the post goes out.");
  await removeFile(media.url);
  await db.postMedia.delete({ where: { id: media.id } });
  revalidatePath("/posts");
}

/** The order images go out in: the ids, first to last. */
async function orderMediaImpl(postId: string, ids: string[]) {
  const post = await ownPost(postId);
  if (!mediaEditable(post)) throw new Error("Images can be changed until the post goes out.");
  const rows = await db.postMedia.findMany({ where: { postId: post.id, deletedAt: null }, select: { id: true } });
  const known = new Set(rows.map((r) => r.id));
  const order = ids.filter((id) => known.has(id));
  await db.$transaction(order.map((id, position) => db.postMedia.update({ where: { id }, data: { position } })));
  revalidatePath("/posts");
}

export async function attachMedia(...args: Parameters<typeof attachMediaImpl>) {
  return run(() => attachMediaImpl(...args));
}

export async function removeMedia(...args: Parameters<typeof removeMediaImpl>) {
  return run(() => removeMediaImpl(...args));
}

export async function orderMedia(...args: Parameters<typeof orderMediaImpl>) {
  return run(() => orderMediaImpl(...args));
}
