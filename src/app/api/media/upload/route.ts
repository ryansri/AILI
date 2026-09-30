import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { IMAGE_MAX_BYTES, IMAGE_TYPES, PDF_MAX_BYTES, PDF_TYPE } from "@/lib/media";
import { mediaEditable } from "@/lib/media-server";

export const dynamic = "force-dynamic";

/**
 * Lets the browser upload a post's image or PDF straight to Vercel Blob
 * (big files would not fit through a server function). Only for the
 * logged-in workspace's own post, into that post's folder, and only the
 * file types and sizes LinkedIn takes.
 */
export async function POST(request: Request) {
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { postId } = JSON.parse(clientPayload ?? "{}") as { postId?: string };
        const post = postId ? await db.post.findFirst({ where: { id: postId, workspaceId } }) : null;
        if (!post || !mediaEditable(post)) throw new Error("Images can be added until the post goes out.");
        if (!pathname.startsWith(`posts/${post.id}/`)) throw new Error("That upload is not for this post.");
        const pdf = /\.pdf$/i.test(pathname);
        return {
          allowedContentTypes: pdf ? [PDF_TYPE] : IMAGE_TYPES,
          maximumSizeInBytes: pdf ? PDF_MAX_BYTES : IMAGE_MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "The upload did not start." }, { status: 400 });
  }
}
