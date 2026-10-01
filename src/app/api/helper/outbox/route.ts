import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

/** A claimed item that never reported back is handed out again after this long. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The helper asks for messages to deliver. Hands out at most one at a time so
 * sends stay spaced out, and marks it "sending" so no other poll takes it.
 */
async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  await db.outbox.updateMany({
    where: { workspaceId: workspace.id, status: "sending", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "queued", claimedAt: null },
  });

  const next = await db.outbox.findFirst({
    where: { workspaceId: workspace.id, status: "queued" },
    orderBy: { createdAt: "asc" },
    include: { person: { select: { linkedinUrn: true, conversationId: true, name: true } } },
  });
  if (!next) return NextResponse.json({ items: [] }, { headers: corsHeaders(request) });

  await db.outbox.update({ where: { id: next.id }, data: { status: "sending", claimedAt: new Date() } });
  return NextResponse.json(
    {
      items: [
        {
          id: next.id,
          body: next.body,
          conversationId: next.person.conversationId,
          recipientUrn: next.person.linkedinUrn,
          personName: next.person.name,
        },
      ],
    },
    { headers: corsHeaders(request) },
  );
}

export const GET = helperRoute(handleGET);
