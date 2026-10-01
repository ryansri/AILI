import { after, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isLinkedInImage } from "@/lib/helper-sync";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { publishDuePosts } from "@/lib/posts";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** Pairing check: tells the helper which account it is talking to. */
async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  return NextResponse.json(
    { workspace: workspace.name, dailyCap: workspace.dailyCap },
    { headers: corsHeaders(request) },
  );
}

/** Heartbeat. state: "ok" | "logged_out" | "error". */
async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    state?: string;
    memberUrn?: string;
    displayName?: string;
    pictureUrl?: string;
    version?: string;
    progress?: { imported?: number; importing?: boolean; phase?: string; pausedUntil?: number; error?: string };
  };
  const p = body.progress;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const version = typeof body.version === "string" && /^\d+\.\d+\.\d+$/.test(body.version) ? body.version : null;
  const picture = isLinkedInImage(body.pictureUrl) ? body.pictureUrl : undefined;
  const state = ["ok", "logged_out", "error"].includes(body.state ?? "") ? body.state! : "error";
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      helperLastSeenAt: new Date(),
      helperState: state,
      helperMemberUrn: typeof body.memberUrn === "string" ? body.memberUrn : workspace.helperMemberUrn,
      helperName: typeof body.displayName === "string" ? body.displayName : workspace.helperName,
      ...(picture ? { helperPictureUrl: picture } : {}),
      // An old helper sends no version; recording null marks it out of date.
      helperVersion: version,
      // An older helper sends no progress; leave what we had.
      ...(p
        ? {
            helperImported: Number.isFinite(p.imported) ? Math.max(0, Math.round(p.imported!)) : 0,
            helperImporting: p.importing === true,
            helperPhase: text(p.phase, 80),
            helperPausedUntil: Number.isFinite(p.pausedUntil) ? new Date(p.pausedUntil!) : null,
            helperError: text(p.error, 300),
          }
        : {}),
    },
  });
  // The helper says its history import is done, yet AILI holds none of the
  // conversations: AILI's data was reset. Ask the helper to import again.
  let resync = false;
  if (p && p.importing === false && (p.imported ?? 0) > 0) {
    const synced = await db.person.count({ where: { workspaceId: workspace.id, conversationId: { not: null } } });
    resync = synced === 0;
    if (resync) {
      await db.workspace.update({ where: { id: workspace.id }, data: { helperImporting: true, helperImported: 0, helperPhase: null } });
    }
  }
  revalidatePath("/inbox");
  revalidatePath("/settings", "layout");
  // While Chrome is open the helper checks in every minute: a free chance to
  // publish scheduled posts on time, on top of the timer.
  after(() => publishDuePosts().catch((err) => console.error("Publishing scheduled posts failed", err)));
  return NextResponse.json({ ok: true, resync }, { headers: corsHeaders(request) });
}

export const GET = helperRoute(handleGET);
export const POST = helperRoute(handlePOST);
