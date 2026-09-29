import { deciderRank } from "./companies";
import { localDay } from "./plan";
import { toWallInput } from "./time-zone";
import type { Person } from "./types";

/*
 * Post alerts: the bell on a lead's LinkedIn profile, so LinkedIn tells you
 * when they post and you can comment early. AILI never touches LinkedIn for
 * this. Each morning it reminds you to tap the bell for a few leads; the
 * helper notices when you do (or you say so); and "I commented" counts your
 * warm-up touches until it is a good time to connect.
 */

export const ALERTS_PER_DAY = [3, 5, 10];
export const TOUCHES_TO_CONNECT = [2, 3, 4];
/** The morning reminder goes out from this hour, in the account's time zone. */
export const NUDGE_HOUR = 9;

type AlertPerson = Pick<
  Person,
  "id" | "name" | "jobTitle" | "headline" | "stage" | "lead" | "createdAt" | "alerts" | "alertsAt" | "alertsLaterAt" | "linkedinUrl"
>;

export interface AlertsQueue<P> {
  /** Bell turned on (or found impossible) today. */
  doneToday: P[];
  /** Still to do today, best first. */
  next: P[];
  /** Everyone still without the bell, today's included. */
  left: number;
}

/**
 * Who to ask about next: leads without the bell, decision makers first, then
 * leads still warming up, then the newest. Later puts someone off until the
 * next day. A day's list is `perDay` long, less those already done today.
 */
export function alertsQueue<P extends AlertPerson>(people: P[], perDay: number, timeZone: string, now = new Date()): AlertsQueue<P> {
  const today = localDay(now, timeZone);
  const leads = people.filter((p) => p.lead !== false);
  const doneToday = leads.filter((p) => p.alerts && p.alertsAt && localDay(new Date(p.alertsAt), timeZone) === today);
  // Only people AILI can open on LinkedIn.
  const pending = leads.filter((p) => !p.alerts && p.linkedinUrl);
  const ready = pending.filter((p) => !p.alertsLaterAt || localDay(new Date(p.alertsLaterAt), timeZone) < today);
  const rank = (p: P) => {
    const r = deciderRank(p.jobTitle || p.headline);
    return r < 0 ? 9 : r;
  };
  const warming = (p: P) => (["warming", "requested"].includes(p.stage) ? 0 : 1);
  const time = (p: P) => (p.createdAt ? new Date(p.createdAt).getTime() : 0);
  ready.sort((a, b) => rank(a) - rank(b) || warming(a) - warming(b) || time(b) - time(a));
  return { doneToday, next: ready.slice(0, Math.max(0, perDay - doneToday.length)), left: pending.length };
}

/** Whether the morning reminder is due: on, past 9 am where you are, and not sent yet today. */
export function nudgeDue(
  workspace: { alertsNudge: boolean; alertsNudgedOn: string | null },
  timeZone: string,
  now = new Date(),
): boolean {
  if (!workspace.alertsNudge) return false;
  const wall = toWallInput(now, timeZone);
  return Number(wall.slice(11, 13)) >= NUDGE_HOUR && workspace.alertsNudgedOn !== wall.slice(0, 10);
}

/** Warm-up so far: comments counted, and whether that is enough to connect. */
export function warmupOf(touches: string[] | undefined, needed: number): { count: number; ready: boolean } {
  const count = touches?.length ?? 0;
  return { count, ready: count >= needed };
}
