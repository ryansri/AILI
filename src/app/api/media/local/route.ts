import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { cannotAdd } from "@/lib/media";
import { addMedia } from "@/lib/media-server";
import { mediaStore, removeFile, saveLocal } from "@/lib/media-store";

export const dynamic = "force-dynamic";

/**
 * Development only (no Vercel Blob): the browser sends the file here and it
 * is kept in a local folder. ?postId=…&name=…, the file as the body.
 */
export async function POST(request: Request) {
  if (mediaStore() !== "local") return NextResponse.json({ error: "Uploads go to file storage here." }, { status: 404 });
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const url = new URL(request.url);
  const post = await db.post.findFirst({ where: { id: url.searchParams.get("postId") ?? "", workspaceId } });
  if (!post) return NextResponse.json({ error: "That post is not in AILI any more." }, { status: 404 });
  const contentType = request.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  const why = cannotAdd([], { contentType, size: bytes.length });
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const stored = await saveLocal(`${post.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, bytes);
  try {
    const id = await addMedia(post, { url: stored, name: url.searchParams.get("name") ?? "", contentType, size: bytes.length });
    return NextResponse.json({ id });
  } catch (err) {
    await removeFile(stored);
    return NextResponse.json({ error: err instanceof Error ? err.message : "That did not save." }, { status: 400 });
  }
}
