import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { cannotAdd, PART_BYTES } from "@/lib/media";
import { addMedia, mediaEditable } from "@/lib/media-server";
import { isOwnPart, mediaStore, readMedia, removeFile, saveBlob, saveLocal } from "@/lib/media-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Files over 4 MB, in pieces: Vercel takes at most 4.5 MB a request, and
 * sending big files from the browser straight to Blob stalled. The page sends
 * each piece here (?postId=…&upload=…&part=…, the piece as the body), then
 * asks to finish (?postId=…&finish=1, the pieces' urls as JSON): AILI joins
 * them into the file, keeps it like any other, and deletes the pieces.
 */

async function ownEditablePost(url: URL) {
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return { error: NextResponse.json({ error: "Log in first." }, { status: 401 }) };
  const post = await db.post.findFirst({ where: { id: url.searchParams.get("postId") ?? "", workspaceId } });
  if (!post) return { error: NextResponse.json({ error: "That post is not in AILI any more." }, { status: 404 }) };
  if (!mediaEditable(post)) return { error: NextResponse.json({ error: "Images can be changed until the post goes out." }, { status: 400 }) };
  return { post };
}

const failed = (err: unknown, fallback: string, status = 502) =>
  NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status });

export async function POST(request: Request) {
  const store = mediaStore();
  if (store === "off") return NextResponse.json({ error: "File storage is not turned on yet." }, { status: 400 });
  const url = new URL(request.url);
  const { post, error } = await ownEditablePost(url);
  if (!post) return error;

  if (url.searchParams.get("finish")) return finish(request, post);

  const upload = (url.searchParams.get("upload") ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const part = Number(url.searchParams.get("part"));
  if (!upload || !Number.isInteger(part) || part < 0 || part > 99) return NextResponse.json({ error: "That piece is not part of an upload." }, { status: 400 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PART_BYTES) return NextResponse.json({ error: "That piece is the wrong size." }, { status: 400 });
  const name = `part-${post.id}-${upload}-${part}`;
  try {
    const stored = store === "blob" ? await saveBlob(post.id, name, bytes, "application/octet-stream") : await saveLocal(name, bytes);
    return NextResponse.json({ url: stored });
  } catch (err) {
    return failed(err, "That piece did not save.");
  }
}

async function finish(request: Request, post: { id: string; workspaceId: string; status: string; kind: string }) {
  const body = (await request.json().catch(() => ({}))) as { parts?: unknown; name?: unknown; contentType?: unknown; size?: unknown };
  const parts = Array.isArray(body.parts) ? body.parts.filter((p): p is string => typeof p === "string") : [];
  const name = String(body.name ?? "").slice(0, 200);
  const contentType = String(body.contentType ?? "");
  if (parts.length === 0 || parts.length > 100 || !parts.every((p) => isOwnPart(p, post.id))) {
    return NextResponse.json({ error: "That upload did not go through. Try again." }, { status: 400 });
  }
  const clear = () => Promise.all(parts.map(removeFile));
  let bytes: Uint8Array;
  try {
    const pieces = await Promise.all(parts.map(readMedia));
    bytes = new Uint8Array(Buffer.concat(pieces));
  } catch (err) {
    await clear();
    return failed(err, "The pieces could not be read back. Try again.");
  }
  const why = bytes.length !== Number(body.size) ? "Some of the file went missing on the way. Try again." : cannotAdd([], { contentType, size: bytes.length });
  if (why) {
    await clear();
    return NextResponse.json({ error: why }, { status: 400 });
  }
  let stored: string;
  try {
    stored =
      mediaStore() === "blob"
        ? await saveBlob(post.id, name, bytes, contentType)
        : await saveLocal(`${post.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, bytes);
  } catch (err) {
    await clear();
    return failed(err, "The file did not save.");
  }
  await clear();
  try {
    const id = await addMedia(post, { url: stored, name, contentType, size: bytes.length });
    return NextResponse.json({ id });
  } catch (err) {
    await removeFile(stored);
    return failed(err, "That did not save.", 400);
  }
}
