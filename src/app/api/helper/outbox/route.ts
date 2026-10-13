import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverableWhere, holdLate, nextDueAt } from "@/lib/schedule-server";
import { CHECKS_REPLIES_FROM, versionAtLeast } from "@/lib/helper-version";
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
 * Scheduled ones wait for their time; late ones are held for you instead.
 */
async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  await db.outbox.updateMany({
    where: { workspaceId: workspace.id, status: "sending", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "queued", claimedAt: null },
  });

  await holdLate(workspace.id);
  const next = await db.outbox.findFirst({
    where: deliverableWhere(workspace.id, workspace.helperLastSeenAt, new Date(), versionAtLeast(workspace.helperVersion, CHECKS_REPLIES_FROM)),
    orderBy: { createdAt: "asc" },
    include: { person: { select: { linkedinUrn: true, publicId: true, conversationId: true, name: true } } },
  });
  // When the next scheduled one is due, so the helper can wake for it on time.
  if (!next) return NextResponse.json({ items: [], nextDueAt: await nextDueAt(workspace.id) }, { headers: corsHeaders(request) });

  await db.outbox.update({ where: { id: next.id }, data: { status: "sending", claimedAt: new Date() } });
  return NextResponse.json(
    {
      items: [
        {
          id: next.id,
          body: next.body,
          conversationId: next.person.conversationId,
          recipientUrn: next.person.linkedinUrn,
          // For someone added from their profile: the helper reads it once, at send time.
          publicId: next.person.linkedinUrn ? null : next.person.publicId,
          personName: next.person.name,
          // Scheduled or a second message: read the chat first and pause it if they wrote after this was written.
          ...(next.sendAt ? { checkReplySince: next.createdAt.getTime() } : {}),
        },
      ],
    },
    { headers: corsHeaders(request) },
  );
}

export const GET = helperRoute(handleGET);
