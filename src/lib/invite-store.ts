import "server-only";
import { db } from "./db";
import { isLinkedInImage } from "./helper-sync";
import { memberIdOf, OPEN_STATUSES, planNetwork, type NetworkReport } from "./invites";

/*
 * Connection requests on the server: what happens when the helper reports a
 * request sent, refused or withdrawn, and when it reports what it saw of your
 * network on LinkedIn.
 */

const EARLY = ["warming", "requested"];

export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** A request went out: they are not connected yet, and the person moves to Request sent. */
export async function markInviteSent(
  invite: { id: string; personId: string; workspaceId: string },
  info: { sentAt: Date; invitationId?: string; sharedSecret?: string; recipientUrn?: string },
) {
  const person = await db.person.findUniqueOrThrow({ where: { id: invite.personId } });
  await db.invite.update({
    where: { id: invite.id },
    data: {
      status: "sent",
      error: "",
      sentAt: info.sentAt,
      claimedAt: null,
      ...(info.invitationId ? { invitationId: info.invitationId } : {}),
      ...(info.sharedSecret ? { sharedSecret: info.sharedSecret } : {}),
    },
  });
  // The helper may have read their member id to send it; keep it unless someone else has it.
  let urn: string | undefined;
  if (!person.linkedinUrn && info.recipientUrn) {
    const taken = await db.person.findFirst({ where: { workspaceId: invite.workspaceId, linkedinUrn: info.recipientUrn } });
    if (!taken) urn = info.recipientUrn;
  }
  await db.person.update({
    where: { id: person.id },
    data: {
      connection: "no",
      requestedAt: person.requestedAt ?? info.sentAt,
      lastActionAt: new Date(),
      ...(urn ? { linkedinUrn: urn } : {}),
      ...(person.stage === "warming" ? { stage: "requested", stageChangedAt: info.sentAt } : {}),
    },
  });
}

/** Withdrawn: the request is gone, and someone still at Request sent goes back to Warming up. */
export async function markInviteWithdrawn(invite: { id: string; personId: string }, reason = "") {
  await db.invite.update({ where: { id: invite.id }, data: { status: "withdrawn", withdrawnAt: new Date(), claimedAt: null, error: reason } });
  const person = await db.person.findUniqueOrThrow({ where: { id: invite.personId } });
  if (person.stage === "requested") {
    await db.person.update({ where: { id: person.id }, data: { stage: "warming", stageChangedAt: new Date() } });
  }
}

export interface AcceptedNotice {
  personId: string;
  name: string;
  headline: string;
}

/**
 * What the helper saw of your network: your sent requests and newest
 * connections. Returns the leads who just accepted, for the desktop notice.
 */
export async function applyNetwork(workspaceId: string, report: NetworkReport, now = new Date()): Promise<AcceptedNotice[]> {
  const [people, invites] = await Promise.all([
    db.person.findMany({
      where: { workspaceId, archivedAt: null, OR: [{ linkedinUrn: { not: null } }, { publicId: { not: null } }] },
      select: {
        id: true,
        lead: true,
        linkedinUrn: true,
        publicId: true,
        connection: true,
        name: true,
        headline: true,
        jobTitle: true,
        company: true,
        pictureUrl: true,
      },
    }),
    db.invite.findMany({ where: { workspaceId, status: { in: OPEN_STATUSES } }, orderBy: { createdAt: "asc" } }),
  ]);
  const changes = planNetwork(people, invites, report, now);
  const byId = new Map(people.map((p) => [p.id, p]));
  const accepted: AcceptedNotice[] = [];

  for (const c of changes) {
    const person = await db.person.findUnique({ where: { id: c.personId } });
    if (!person) continue;
    if (c.kind === "accepted" || c.kind === "connected") {
      if (c.kind === "accepted") {
        await db.invite.update({ where: { id: c.inviteId }, data: { status: "accepted", acceptedAt: c.at, claimedAt: null } });
        if (c.notify) {
          const p = byId.get(c.personId)!;
          accepted.push({ personId: p.id, name: p.name, headline: [p.jobTitle, p.company].filter(Boolean).join(" · ") || p.headline });
        }
      }
      await db.person.update({
        where: { id: person.id },
        data: {
          connection: "yes",
          connectedAt: person.connectedAt ?? c.at,
          ...(EARLY.includes(person.stage) ? { stage: "connected", stageChangedAt: c.at } : {}),
        },
      });
    } else if (c.kind === "found") {
      if (c.inviteId) {
        await db.invite.update({
          where: { id: c.inviteId },
          data: { invitationId: c.invitationId ?? null, sharedSecret: c.sharedSecret ?? null },
        });
      } else {
        await db.invite.create({
          data: {
            workspaceId,
            personId: person.id,
            status: "sent",
            source: "linkedin",
            note: c.note,
            sentAt: c.sentAt,
            invitationId: c.invitationId ?? null,
            sharedSecret: c.sharedSecret ?? null,
          },
        });
        await db.person.update({
          where: { id: person.id },
          data: {
            connection: "no",
            requestedAt: person.requestedAt ?? c.sentAt,
            ...(person.stage === "warming" ? { stage: "requested", stageChangedAt: c.sentAt } : {}),
          },
        });
      }
    } else if (c.kind === "gone") {
      await markInviteWithdrawn({ id: c.inviteId, personId: c.personId }, "No longer waiting on LinkedIn.");
    }
  }

  // The lists carry profile photos: keep the latest link for anyone in AILI (the links expire).
  const byMember = new Map(people.map((p) => [memberIdOf(p.linkedinUrn), p]).filter(([id]) => id) as [string, (typeof people)[number]][]);
  const byPublic = new Map(people.filter((p) => p.publicId).map((p) => [p.publicId!.toLowerCase(), p]));
  for (const seen of [...(report.connections ?? []), ...(report.sent ?? [])]) {
    if (!seen.pictureUrl) continue;
    const p = byMember.get(seen.memberId) ?? (seen.publicId ? byPublic.get(seen.publicId.toLowerCase()) : undefined);
    if (p && p.pictureUrl !== seen.pictureUrl) {
      await db.person.update({ where: { id: p.id }, data: { pictureUrl: seen.pictureUrl } });
      p.pictureUrl = seen.pictureUrl;
    }
  }

  await db.workspace.update({ where: { id: workspaceId }, data: { networkCheckedAt: now } });
  return accepted;
}

/** Sanitises the helper's network report. */
export function readNetworkReport(body: unknown): NetworkReport {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" && /^[\w-]{6,80}$/.test(v) ? v : "");
  const pub = (v: unknown) => (typeof v === "string" && /^[\w\-%.]{1,120}$/.test(v) ? v : undefined);
  const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 500) : undefined);
  const sent = list(b.sent)
    ?.map((s: Record<string, unknown>) => ({
      memberId: id(s?.memberId),
      publicId: pub(s?.publicId),
      invitationId: typeof s?.invitationId === "string" ? s.invitationId.slice(0, 120) : undefined,
      sharedSecret: typeof s?.sharedSecret === "string" ? s.sharedSecret.slice(0, 200) : undefined,
      sentAt: time(s?.sentAt),
      message: cleanText(s?.message, 400) || undefined,
      pictureUrl: isLinkedInImage(s?.pictureUrl) ? s.pictureUrl : undefined,
    }))
    .filter((s) => s.memberId || s.publicId);
  const connections = list(b.connections)
    ?.map((c: Record<string, unknown>) => ({
      memberId: id(c?.memberId),
      publicId: pub(c?.publicId),
      connectedAt: time(c?.connectedAt),
      pictureUrl: isLinkedInImage(c?.pictureUrl) ? c.pictureUrl : undefined,
    }))
    .filter((c) => c.memberId || c.publicId);
  return { sent, sentComplete: b.sentComplete === true, connections };
}
