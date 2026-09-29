import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

/** A claimed request that never reported back is handed out again after this long. */
const STALE_CLAIM_MS = 5 * 60 * 1000;
/** How often the helper reads your sent requests and newest connections. */
const NETWORK_EVERY_MS = 15 * 60 * 1000;

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The helper asks what to do about connection requests: at most one to send
 * and one to withdraw (the user clicked each), and whether it is time to read
 * your sent requests and newest connections from LinkedIn.
 */
export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const stale = new Date(Date.now() - STALE_CLAIM_MS);

  await db.invite.updateMany({
    where: { workspaceId: workspace.id, status: "sending", claimedAt: { lt: stale } },
    data: { status: "queued", claimedAt: null },
  });

  const include = { person: { select: { name: true, linkedinUrn: true, publicId: true } } };
  const next = await db.invite.findFirst({ where: { workspaceId: workspace.id, status: "queued" }, orderBy: { createdAt: "asc" }, include });
  if (next) await db.invite.update({ where: { id: next.id }, data: { status: "sending", claimedAt: new Date() } });

  const withdraw = await db.invite.findFirst({
    where: { workspaceId: workspace.id, status: "withdrawing", OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }] },
    orderBy: { updatedAt: "asc" },
    include,
  });
  if (withdraw) await db.invite.update({ where: { id: withdraw.id }, data: { claimedAt: new Date() } });

  const due = !workspace.networkCheckedAt || Date.now() - workspace.networkCheckedAt.getTime() > NETWORK_EVERY_MS;
  const worth =
    due &&
    ((await db.invite.count({ where: { workspaceId: workspace.id, status: { in: ["sent", "withdrawing"] } } })) > 0 ||
      (await db.person.count({ where: { workspaceId: workspace.id, lead: true, archivedAt: null, connection: { not: "yes" } } })) > 0);

  const item = (i: NonNullable<typeof next>) => ({
    id: i.id,
    name: i.person.name,
    recipientUrn: i.person.linkedinUrn,
    publicId: i.person.publicId,
    note: i.note,
    invitationId: i.invitationId,
    sharedSecret: i.sharedSecret,
  });
  return NextResponse.json(
    { send: next ? item(next) : null, withdraw: withdraw ? item(withdraw) : null, checkNetwork: Boolean(worth) },
    { headers: corsHeaders(request) },
  );
}
