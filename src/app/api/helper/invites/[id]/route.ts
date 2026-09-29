import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { cleanText, markInviteSent, markInviteWithdrawn } from "@/lib/invite-store";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The helper reports one connection request: sent (with LinkedIn's id for it),
 * refused, withdrawn, or a withdraw that did not go through.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/helper/invites/[id]">) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const { id } = await ctx.params;
  const invite = await db.invite.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!invite) return NextResponse.json({ error: "Unknown request" }, { status: 404, headers: corsHeaders(request) });

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    invitationId?: string;
    sharedSecret?: string;
    recipientUrn?: string;
    sentAt?: number;
    error?: string;
  };
  const urn = typeof body.recipientUrn === "string" && /^urn:li:fsd_profile:[\w-]{6,80}$/.test(body.recipientUrn) ? body.recipientUrn : undefined;

  if (body.status === "sent" && (invite.status === "sending" || invite.status === "queued")) {
    const sentAt = typeof body.sentAt === "number" && body.sentAt <= Date.now() ? new Date(body.sentAt) : new Date();
    await markInviteSent(invite, {
      sentAt,
      invitationId: cleanText(body.invitationId, 120) || undefined,
      sharedSecret: cleanText(body.sharedSecret, 200) || undefined,
      recipientUrn: urn,
    });
  } else if (body.status === "failed" && (invite.status === "sending" || invite.status === "queued")) {
    await db.invite.update({
      where: { id },
      data: { status: "failed", claimedAt: null, error: cleanText(body.error, 300) || "LinkedIn did not take the request." },
    });
  } else if (body.status === "withdrawn" && invite.status === "withdrawing") {
    await markInviteWithdrawn(invite);
  } else if (body.status === "withdraw-failed" && invite.status === "withdrawing") {
    await db.invite.update({
      where: { id },
      data: { status: "sent", claimedAt: null, error: `Withdraw did not go through: ${cleanText(body.error, 200) || "LinkedIn said no."}` },
    });
  }

  revalidatePath("/inbox");
  revalidatePath("/people");
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}
