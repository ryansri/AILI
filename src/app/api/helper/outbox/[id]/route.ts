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
    const personData: { snoozedUntil: null; conversationId?: string; stage?: string; connectedAt?: Date } = { snoozedUntil: null };
    if (typeof body.conversationId === "string") personData.conversationId = body.conversationId;
    const person = await db.person.findUniqueOrThrow({ where: { id: item.personId } });
    if (["warming", "requested", "connected"].includes(person.stage)) personData.stage = "conversation";
    if (!person.connectedAt) personData.connectedAt = sentAt;
    await db.person.update({ where: { id: item.personId }, data: personData });
  } else {
    await db.outbox.update({
      where: { id },
      data: { status: "failed", error: String(body.error ?? "Delivery failed").slice(0, 500) },
    });
  }

  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}
