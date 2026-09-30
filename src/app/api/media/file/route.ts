import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { cannotAdd } from "@/lib/media";
import { addMedia, mediaEditable } from "@/lib/media-server";
import { mediaStore, removeFile, saveBlob, saveLocal } from "@/lib/media-store";

export const dynamic = "force-dynamic";

/**
 * A post's image or PDF, sent through AILI: ?postId=…&name=…, the file as
 * the body. Kept in Vercel Blob, or a local folder in development. Files
 * over 4 MB don't fit through here on Vercel; the page sends those straight
 * to Blob (see ../upload).
 */
export async function POST(request: Request) {
  const store = mediaStore();
  if (store === "off") return NextResponse.json({ error: "File storage is not turned on yet." }, { status: 400 });
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const url = new URL(request.url);
  const post = await db.post.findFirst({ where: { id: url.searchParams.get("postId") ?? "", workspaceId } });
  if (!post) return NextResponse.json({ error: "That post is not in AILI any more." }, { status: 404 });
  if (!mediaEditable(post)) return NextResponse.json({ error: "Images can be changed until the post goes out." }, { status: 400 });
  const contentType = request.headers.get("content-type") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  const why = cannotAdd([], { contentType, size: bytes.length });
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  let stored: string;
  try {
    stored =
      store === "blob"
        ? await saveBlob(post.id, name, bytes, contentType)
        : await saveLocal(`${post.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, bytes);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The file did not save." }, { status: 502 });
  }
  try {
    const id = await addMedia(post, { url: stored, name, contentType, size: bytes.length });
    return NextResponse.json({ id });
  } catch (err) {
    await removeFile(stored);
    return NextResponse.json({ error: err instanceof Error ? err.message : "That did not save." }, { status: 400 });
  }
}
