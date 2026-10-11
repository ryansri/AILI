import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { validSeenAt } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

/*
 * Read receipts. GET hands out nothing now (see below). POST: what a helper
 * from before 0.16 found.
 */

export function OPTIONS(request: Request) {
  return preflight(request);
}

async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  // Off: one LinkedIn request per conversation adds up. "Seen" now comes only
  // from the inbox sync, which reads it anyway.
  return NextResponse.json({ items: [] }, { headers: corsHeaders(request) });
}

async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = (await request.json().catch(() => null)) as { results?: { personId?: unknown; seenAt?: unknown }[] } | null;
  const results = Array.isArray(body?.results) ? body!.results.slice(0, 10) : [];
  let updated = 0;
  for (const r of results) {
    const seenAt = validSeenAt(r?.seenAt);
    if (typeof r?.personId !== "string" || !seenAt) continue;
    const res = await db.person.updateMany({
      where: { id: r.personId, workspaceId: workspace.id, OR: [{ seenAt: null }, { seenAt: { lt: new Date(seenAt) } }] },
      data: { seenAt: new Date(seenAt) },
    });
    updated += res.count;
  }
  if (updated) revalidatePath("/inbox");
  return NextResponse.json({ ok: true, updated }, { headers: corsHeaders(request) });
}

export const GET = helperRoute(handleGET);
export const POST = helperRoute(handlePOST);
