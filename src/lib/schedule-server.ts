import "server-only";
import { db } from "./db";
import { LATE_MS } from "./schedule";

/*
 * Scheduled messages on the server: AILI holds one back when the person wrote
 * after you scheduled it (it may not fit any more), or when it would go more
 * than LATE_MS after its time because Chrome was closed. Held ones wait for
 * you: Send anyway, Edit or Delete.
 */

/** They wrote after you scheduled a message to them: hold it. */
export async function holdOnReply(personId: string): Promise<number> {
  const latestIn = await db.message.findFirst({ where: { personId, direction: "in" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
  if (!latestIn) return 0;
  const { count } = await db.outbox.updateMany({
    where: { personId, status: "queued", sendAt: { not: null }, createdAt: { lt: latestIn.sentAt } },
    data: { status: "held", heldReason: "replied" },
  });
  return count;
}

/** Scheduled ones long past their time: hold them rather than send them late. */
export async function holdLate(workspaceId: string, now: Date = new Date()): Promise<number> {
  const { count } = await db.outbox.updateMany({
    where: { workspaceId, status: "queued", sendAt: { lt: new Date(now.getTime() - LATE_MS) } },
    data: { status: "held", heldReason: "late" },
  });
  return count;
}

/**
 * Which queued messages the helper may have now. Scheduled ones only once
 * their time has come, and only after the helper has read the inbox since
 * then (it checks in at the end of each run, after reading it), so a reply
 * that came in just before is seen and the message held.
 */
export function deliverableWhere(workspaceId: string, helperLastSeenAt: Date | null, now: Date = new Date()) {
  const readSince = helperLastSeenAt && helperLastSeenAt < now ? helperLastSeenAt : now;
  return {
    workspaceId,
    status: "queued",
    OR: [{ sendAt: null }, { sendAt: { lte: readSince } }],
  };
}
