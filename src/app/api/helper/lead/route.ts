import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

/*
 * The answer to the helper's "Add to Leads?" notice for a conversation you
 * started: { personId, lead: true } moves them to Leads, { lead: false } keeps
 * them in Other. Either way AILI stops asking about them.
 */

export function OPTIONS(request: Request) {
  return preflight(request);
}

async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = (await request.json().catch(() => null)) as { personId?: unknown; lead?: unknown } | null;
  if (!body || typeof body.personId !== "string" || typeof body.lead !== "boolean") {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: corsHeaders(request) });
  }
  const { count } = await db.person.updateMany({
    where: { id: body.personId, workspaceId: workspace.id },
    data: body.lead ? { lead: true, askLead: false } : { askLead: false },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders(request) });
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}

export const POST = helperRoute(handlePOST);
