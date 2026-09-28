import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { validSeenAt } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

/*
 * Read receipts. GET: conversations where your latest message went out in the
 * last two weeks and is not seen yet, a few at a time, each at most every 15
 * minutes; the helper asks LinkedIn whether the other person has read it.
 * POST: what it found. LINKEDIN_SEEN_QUERY_ID, when set, is the id of
 * LinkedIn's read-receipts query for the helper to use.
 */

const CHECK_EVERY_MS = 15 * 60 * 1000;
const WITHIN_MS = 14 * 24 * 60 * 60 * 1000;

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const now = Date.now();
  const candidates = await db.person.findMany({
    where: {
      workspaceId: workspace.id,
      archivedAt: null,
      conversationId: { not: null },
      OR: [{ seenCheckedAt: null }, { seenCheckedAt: { lt: new Date(now - CHECK_EVERY_MS) } }],
      messages: { some: { direction: "out", externalId: { not: null }, sentAt: { gte: new Date(now - WITHIN_MS) } } },
    },
    select: {
      id: true,
      conversationId: true,
      seenAt: true,
      seenCheckedAt: true,
      messages: { where: { direction: "out" }, orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } },
    },
    orderBy: { seenCheckedAt: { sort: "asc", nulls: "first" } },
    take: 20,
  });
  // Not seen yet: no receipt, or one from before your latest message.
  const due = candidates.filter((p) => p.messages[0] && (!p.seenAt || p.seenAt < p.messages[0].sentAt)).slice(0, 3);
  if (due.length) {
    await db.person.updateMany({ where: { id: { in: due.map((p) => p.id) } }, data: { seenCheckedAt: new Date(now) } });
  }
  const queryId = process.env.LINKEDIN_SEEN_QUERY_ID?.trim() || undefined;
  return NextResponse.json(
    { items: due.map((p) => ({ personId: p.id, conversationId: p.conversationId })), ...(queryId ? { queryId } : {}) },
    { headers: corsHeaders(request) },
  );
}

export async function POST(request: Request) {
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
