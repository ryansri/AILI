import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocal, isPrivateBlob, readMedia } from "@/lib/media-store";

export const dynamic = "force-dynamic";

/** Shows a post's image or PDF on the page, to its own workspace only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const media = await db.postMedia.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!media) return new NextResponse(null, { status: 404 });
  // A public file loads from Blob itself; a private or local one comes through here.
  if (!isLocal(media.url) && !isPrivateBlob(media.url)) return NextResponse.redirect(media.url);
  const bytes = await readMedia(media.url);
  return new NextResponse(bytes as BodyInit, {
    headers: { "Content-Type": media.contentType || "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
