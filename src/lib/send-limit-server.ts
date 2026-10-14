import "server-only";
import { db } from "./db";
import { countUsage, REPLY_WINDOW_DAYS, type DayUsage } from "./send-limit";
import { dayBounds } from "./time-zone";

const WINDOW_MS = REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * A day's messages where you are, split into new ones and replies (see
 * send-limit.ts): sent that day, waiting to go, and scheduled for it.
 */
export async function messageUsage(workspaceId: string, timeZone: string, day: Date = new Date()): Promise<DayUsage> {
  const now = new Date();
  const { start, end } = dayBounds(day, timeZone);
  const today = now >= start && now < end;
  const [sent, waiting] = await Promise.all([
    db.message.findMany({
      where: {
        direction: "out",
        sentAt: { gte: start, lt: end },
        person: { workspaceId },
      },
      select: { personId: true, sentAt: true },
    }),
    db.outbox.findMany({
      where: {
        workspaceId,
        status: { in: ["queued", "sending", "after"] },
        OR: [{ sendAt: { gte: start, lt: end } }, ...(today ? [{ sendAt: null }, { sendAt: { lt: start } }] : [])],
      },
      select: { personId: true, sendAt: true },
    }),
  ]);
  const outgoing = [
    ...sent.map((m) => ({ personId: m.personId, at: m.sentAt })),
    // Waiting ones go now, or at their time when that is later.
    ...waiting.map((o) => ({
      personId: o.personId,
      at: o.sendAt && o.sendAt > now ? o.sendAt : now,
    })),
  ];
  const personIds = [...new Set(outgoing.map((m) => m.personId))];
  const incoming = personIds.length
    ? await db.message.findMany({
        where: {
          direction: "in",
          personId: { in: personIds },
          sentAt: { gte: new Date(start.getTime() - WINDOW_MS), lt: end },
        },
        select: { personId: true, sentAt: true },
      })
    : [];
  return countUsage(
    outgoing,
    incoming.map((m) => ({ personId: m.personId, at: m.sentAt })),
  );
}

/** They wrote to you in the REPLY_WINDOW_DAYS before `at`: a message to them then is a reply. */
export async function wroteBack(personId: string, at: Date = new Date()): Promise<boolean> {
  const now = new Date();
  const count = await db.message.count({
    where: {
      personId,
      direction: "in",
      sentAt: {
        gte: new Date(at.getTime() - WINDOW_MS),
        lte: at > now ? at : now,
      },
    },
  });
  return count > 0;
}
