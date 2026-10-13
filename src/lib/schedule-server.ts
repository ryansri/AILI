import "server-only";
import { db } from "./db";
import { LATE_MS } from "./schedule";

/*
 * Scheduled messages on the server: AILI pauses one (status "held") when the
 * person wrote after you scheduled it (it may not fit any more), when it would
 * go more than LATE_MS after its time because Chrome was closed, or when the
 * first message of a pair did not go. Paused ones wait for you: Send anyway,
 * Edit or Delete. A pair's second message waits (status "after") for the first.
 */

/** They wrote after you scheduled a message to them: hold it. */
export async function holdOnReply(personId: string): Promise<number> {
  const latestIn = await db.message.findFirst({ where: { personId, direction: "in" }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
  if (!latestIn) return 0;
  const { count } = await db.outbox.updateMany({
    where: {
      personId,
      createdAt: { lt: latestIn.sentAt },
      OR: [{ status: "queued", sendAt: { not: null } }, { status: "after" }],
    },
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
 * their time has come. A helper from 0.17 reads that chat for a reply just
 * before it sends one; an older one only gets it after it has read the inbox
 * since then (it checks in at the end of each run, after reading it), so a
 * reply that came in just before is seen and the message paused.
 */
export function deliverableWhere(workspaceId: string, helperLastSeenAt: Date | null, now: Date = new Date(), checksReplies = false) {
  const readSince = checksReplies ? now : helperLastSeenAt && helperLastSeenAt < now ? helperLastSeenAt : now;
  return {
    workspaceId,
    status: "queued",
    OR: [{ sendAt: null }, { sendAt: { lte: readSince } }],
  };
}

/** A first message went: its second message's clock starts now. */
export async function startFollowers(firstId: string, sentAt: Date): Promise<void> {
  const followers = await db.outbox.findMany({ where: { afterId: firstId, status: "after" } });
  for (const f of followers) {
    const sendAt = new Date(sentAt.getTime() + Math.max(1, f.delayMinutes ?? 2) * 60_000);
    await db.outbox.update({ where: { id: f.id }, data: { status: "queued", sendAt } });
  }
}

/** A first message failed: pause its second, so it never arrives alone. */
export async function pauseFollowers(firstId: string): Promise<void> {
  await db.outbox.updateMany({ where: { afterId: firstId, status: "after" }, data: { status: "held", heldReason: "first-failed" } });
}

/** The first is going again (Try again): its second waits for it again. */
export async function resumeFollowers(firstId: string): Promise<void> {
  await db.outbox.updateMany({ where: { afterId: firstId, status: "held", heldReason: "first-failed" }, data: { status: "after", heldReason: null } });
}

/** When the helper should wake next for a scheduled message, if one is coming. */
export async function nextDueAt(workspaceId: string, now: Date = new Date()): Promise<number | undefined> {
  const next = await db.outbox.findFirst({
    where: { workspaceId, status: "queued", sendAt: { gt: now } },
    orderBy: { sendAt: "asc" },
    select: { sendAt: true },
  });
  return next?.sendAt?.getTime();
}
