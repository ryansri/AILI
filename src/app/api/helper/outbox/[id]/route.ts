import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** The helper reports the outcome of one delivery. */
export async function POST(request: Request, ctx: RouteContext<"/api/helper/outbox/[id]">) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const { id } = await ctx.params;
  const item = await db.outbox.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!item) return NextResponse.json({ error: "Unknown item" }, { status: 404, headers: corsHeaders(request) });

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    externalId?: string;
    conversationId?: string;
    error?: string;
    sentAt?: number;
    /** LinkedIn would not start a conversation with them: most likely not connected. */
    notConnected?: boolean;
  };

  if (body.status === "sent") {
    const sentAt = typeof body.sentAt === "number" ? new Date(body.sentAt) : new Date();
    const externalId = typeof body.externalId === "string" ? body.externalId : null;
    const already = externalId ? await db.message.findUnique({ where: { externalId } }) : null;
    if (!already) {
      await db.message.create({
        data: {
          personId: item.personId,
          direction: "out",
          body: item.body,
          sentAt,
          followUp: item.followUp,
          source: "helper",
          externalId,
        },
      });
    }
    await db.outbox.update({ where: { id }, data: { status: "sent", sentAt, externalId } });
    // A message went through, so you can message them: count that as connected.
    const personData: { snoozedUntil: null; conversationId?: string; stage?: string; connectedAt?: Date; connection: string } = {
      snoozedUntil: null,
      connection: "yes",
    };
    if (typeof body.conversationId === "string") personData.conversationId = body.conversationId;
    const person = await db.person.findUniqueOrThrow({ where: { id: item.personId } });
    if (["warming", "requested", "connected"].includes(person.stage)) personData.stage = "conversation";
    if (!person.connectedAt) personData.connectedAt = sentAt;
    await db.person.update({ where: { id: item.personId }, data: personData });
  } else {
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
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}
