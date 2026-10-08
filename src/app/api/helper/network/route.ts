import { NextResponse } from "next/server";
import { privacyOn } from "@/lib/privacy-server";
import { revalidatePath } from "next/cache";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { applyNetwork, readNetworkReport } from "@/lib/invite-store";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The helper reports your sent requests and newest connections on LinkedIn.
 * AILI marks who accepted, who you were already connected with, and requests
 * you sent on LinkedIn itself. The answer lists leads who just accepted, for a
 * desktop notice when those are on.
 */
async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const report = readNetworkReport(await request.json().catch(() => null));
  const accepted = await applyNetwork(workspace.id, report);
  if (accepted.length || report.sent?.length || report.connections?.length) {
    revalidatePath("/inbox");
    revalidatePath("/people");
    revalidatePath("/today");
  }
  // Recording mode: no pop-ups, so no real names on screen.
  const quiet = await privacyOn(workspace.id);
  return NextResponse.json({ accepted: workspace.notifyAccepts && !quiet ? accepted : [] }, { headers: corsHeaders(request) });
}

export const POST = helperRoute(handlePOST);
