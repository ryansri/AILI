import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pauseFollowers, startFollowers, nextDueAt } from "@/lib/schedule-server";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** The helper reports the outcome of one delivery. */
async function handlePOST(request: Request, ctx: RouteContext<"/api/helper/outbox/[id]">) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const { id } = await ctx.params;
  const item = await db.outbox.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404, headers: corsHeaders(request) });

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    externalId?: string;
    conversationId?: string;
    /** Their member id, when the helper read it from their profile to send this. */
    recipientUrn?: string;
    error?: string;
    sentAt?: number;
    /** LinkedIn would not start a conversation with them: most likely not connected. */
    notConnected?: boolean;
  };

  if (body.status === "sent") {
    const sentAt = typeof body.sentAt === "number" ? new Date(body.sentAt) : new Date();
    const externalId = typeof body.externalId === "string" ? body.externalId : null;
    const already = externalId ? await db.message.findUnique({ where: { externalId } }) : null;
    // The sync can bring the message in first; it still came from this template.
    if (already && item.templateId && !already.templateId) {
      await db.message.update({ where: { id: already.id }, data: { templateId: item.templateId } });
    }
    if (!already) {
      await db.message.create({
        data: {
          personId: item.personId,
          direction: "out",
          body: item.body,
          sentAt,
          followUp: item.followUp,
          templateId: item.templateId,
          source: "helper",
          externalId,
        },
      });
    }
    await db.outbox.update({ where: { id }, data: { status: "sent", sentAt, externalId } });
    // The second message of a pair: its minutes count from now.
    await startFollowers(id, sentAt);
    // A message went through, so you can message them: count that as connected.
    const personData: { snoozedUntil: null; conversationId?: string; linkedinUrn?: string; stage?: string; connectedAt?: Date; connection: string } = {
      snoozedUntil: null,
      connection: "yes",
    };
    if (typeof body.conversationId === "string") personData.conversationId = body.conversationId;
    const person = await db.person.findUniqueOrThrow({ where: { id: item.personId } });
    const urn = typeof body.recipientUrn === "string" && /^urn:li:fsd_profile:[\w-]{4,80}$/.test(body.recipientUrn) ? body.recipientUrn : "";
    if (urn && !person.linkedinUrn && !(await db.person.findFirst({ where: { workspaceId: workspace.id, linkedinUrn: urn }, select: { id: true } }))) {
      personData.linkedinUrn = urn;
    }
    if (["warming", "requested", "connected"].includes(person.stage)) personData.stage = "conversation";
    if (!person.connectedAt) personData.connectedAt = sentAt;
    await db.person.update({ where: { id: item.personId }, data: personData });
  } else if (body.status === "paused") {
    // The helper read the chat just before sending and they had written: paused for you.
    await db.outbox.update({ where: { id }, data: { status: "held", heldReason: "replied", claimedAt: null } });
  } else {
    await pauseFollowers(id);
    const person = await db.person.findUniqueOrThrow({ where: { id: item.personId } });
    const notConnected = body.notConnected === true && !person.conversationId;
    if (notConnected) await db.person.update({ where: { id: person.id }, data: { connection: "no" } });
    await db.outbox.update({
      where: { id },
      data: {
        status: "failed",
        error: notConnected
          ? `You're not connected with ${person.name.split(" ")[0]} yet, so LinkedIn would not start a conversation.`
          : String(body.error ?? "Delivery failed").slice(0, 500),
      },
    });
  }

  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  return NextResponse.json({ ok: true, nextDueAt: await nextDueAt(workspace.id) }, { headers: corsHeaders(request) });
}

export const POST = helperRoute(handlePOST);
