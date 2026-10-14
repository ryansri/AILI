/*
 * The daily cap is for new messages: first messages and follow-ups to people
 * who have not written back. Replies to someone who wrote to you in the last
 * REPLY_WINDOW_DAYS do not count toward it, so a busy day of conversations is
 * never blocked. Everything together still stops at the ceiling, so nothing can
 * send hundreds in a day. Pure, so the message box and the server share it.
 */

export const REPLY_WINDOW_DAYS = 14;
/** All messages in a day, replies included, never go past this (or your cap, if higher). */
export const DAY_CEILING = 60;
const WINDOW_MS = REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function ceilingFor(dailyCap: number): number {
  return Math.max(DAY_CEILING, dailyCap);
}

/** A message at `at` is a reply when they wrote in the REPLY_WINDOW_DAYS before it. */
export function isReplyAt(incoming: (Date | string)[], at: Date | string): boolean {
  const t = new Date(at).getTime();
  return incoming.some((m) => {
    const s = new Date(m).getTime();
    return s <= t && t - s <= WINDOW_MS;
  });
}

export interface DayUsage {
  /** New messages: these count toward the daily cap. */
  fresh: number;
  /** Replies to people who wrote back: free, up to the ceiling. */
  replies: number;
  total: number;
}

/** Splits a day's messages into new ones and replies. */
export function countUsage(
  outgoing: { personId: string; at: Date | string }[],
  incoming: { personId: string; at: Date | string }[],
): DayUsage {
  const byPerson = new Map<string, (Date | string)[]>();
  for (const m of incoming) byPerson.set(m.personId, [...(byPerson.get(m.personId) ?? []), m.at]);
  let replies = 0;
  for (const m of outgoing) if (isReplyAt(byPerson.get(m.personId) ?? [], m.at)) replies += 1;
  return { fresh: outgoing.length - replies, replies, total: outgoing.length };
}

/** Why `adding` more messages can't go on that day, or null when they can. */
export function limitProblem(used: DayUsage, adding: number, reply: boolean, dailyCap: number, later = false): string | null {
  const ceiling = ceilingFor(dailyCap);
  if (used.total + adding > ceiling) {
    return later
      ? `That day already has ${ceiling} messages, replies included. That is AILI's safety limit. Pick another day.`
      : `${ceiling} messages today, replies included. That is AILI's safety limit. Schedule it for tomorrow.`;
  }
  if (!reply && used.fresh + adding > dailyCap) {
    return later
      ? `That day already has ${dailyCap} new messages, your daily cap. Pick another day. Replies to people who wrote back don't count.`
      : `Daily cap of ${dailyCap} new messages reached. Schedule it for tomorrow. Replies to people who wrote back still go.`;
  }
  return null;
}
