import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { privacyOn } from "@/lib/privacy-server";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { NOTIFICATION_PATHS, readKey, recordTouches, validTouches } from "@/lib/warmup-sync";

export const dynamic = "force-dynamic";

/*
 * Warm-up from LinkedIn. GET tells the helper where to read your
 * notifications. POST { touches, read? } records comments you posted and the
 * replies and likes in your notifications, for people already in AILI, and
 * what the last notifications read found (shown beside the warm-up).
 */

export function OPTIONS(request: Request) {
  return preflight(request);
}

async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  return NextResponse.json({ notificationPaths: NOTIFICATION_PATHS }, { headers: corsHeaders(request) });
}

async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = (await request.json().catch(() => null)) as { touches?: unknown; read?: { cards?: unknown; error?: unknown } } | null;
  const fresh = await recordTouches(workspace.id, validTouches(body?.touches));
  if (body?.read) {
    const value = JSON.stringify({
      at: new Date().toISOString(),
      cards: typeof body.read.cards === "number" ? body.read.cards : 0,
      error: typeof body.read.error === "string" ? body.read.error.slice(0, 200) : undefined,
    });
    const key = readKey(workspace.id);
    await db.appState.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  if (fresh.length) {
    revalidatePath("/inbox");
    revalidatePath("/people");
  }
  // A desktop notice for a lead who replied to your comment or engaged with your post.
  const quiet = await privacyOn(workspace.id);
  const notify = workspace.notifyReplies && !quiet ? fresh.filter((t) => t.lead && t.kind !== "comment").slice(0, 3) : [];
  return NextResponse.json({ recorded: fresh.length, notify }, { headers: corsHeaders(request) });
}

export const GET = helperRoute(handleGET);
export const POST = helperRoute(handlePOST);
