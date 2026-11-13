import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { PART_BYTES } from "@/lib/media";
import { chunksOf } from "@/lib/media-server";
import { isLocal, isPrivateBlob, readMedia } from "@/lib/media-store";

export const dynamic = "force-dynamic";

/**
 * Shows a post's image, PDF or video on the page, to its own workspace only.
 * A video kept in pieces is served a piece at a time: the browser asks for a
 * range of bytes and gets the piece it starts in.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const media = await db.postMedia.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!media) return new NextResponse(null, { status: 404 });
  const chunks = chunksOf(media);
  // A public whole file loads from Blob itself; a private, local or pieced one comes through here.
  if (chunks.length === 1 && !isLocal(media.url) && !isPrivateBlob(media.url)) return NextResponse.redirect(media.url);
  const type = media.contentType || "application/octet-stream";
  if (media.kind !== "video") {
    const bytes = await readMedia(media.url);
    return new NextResponse(bytes as BodyInit, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
  }
  const total = media.size;
  const asked = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  const start = asked?.[1] ? Number(asked[1]) : 0;
  if (start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  const index = Math.min(Math.floor(start / PART_BYTES), chunks.length - 1);
  const piece = await readMedia(chunks[index]);
  const offset = start - index * PART_BYTES;
  const wantedEnd = asked?.[2] ? Math.min(Number(asked[2]), total - 1) : total - 1;
  const end = Math.min(wantedEnd, index * PART_BYTES + piece.length - 1);
  const body = piece.subarray(offset, end - index * PART_BYTES + 1);
  return new NextResponse(body as BodyInit, {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(body.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
