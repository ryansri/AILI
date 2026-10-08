import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { privacyOn } from "@/lib/privacy-server";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { applySync, myPictureFromSync, repliesToNotify, validatePayload } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** The helper posts what it saw on LinkedIn. */
async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  const payload = validatePayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400, headers: corsHeaders(request) });
  }

  const result = await applySync(workspace.id, payload);
  const myPicture = myPictureFromSync(payload);
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      helperLastSeenAt: new Date(),
      helperMemberUrn: payload.memberUrn,
      helperName: payload.displayName ?? workspace.helperName,
      helperState: "ok",
      ...(myPicture ? { helperPictureUrl: myPicture } : {}),
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  // The helper shows these as desktop notifications, if you have them turned on:
  // new replies, and "Add to Leads?" for new conversations you started.
  // Recording mode: no pop-ups, so no real names on screen.
  const quiet = await privacyOn(workspace.id);
  const notify = workspace.notifyReplies && !quiet ? repliesToNotify(result.newReplies) : [];
  const ask = workspace.notifyReplies && !quiet ? result.startedByYou : [];
  return NextResponse.json({ ...result, newReplies: undefined, startedByYou: undefined, notify, ask }, { headers: corsHeaders(request) });
}

export const POST = helperRoute(handlePOST);
