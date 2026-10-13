import { formatWhen, toWallInput, wallTimeToDate } from "./time-zone";

/*
 * Scheduled messages: you write one and pick when it goes. AILI holds it until
 * then and the helper sends it like any other. Only between FIRST_HOUR and
 * LAST_HOUR where you are, the hours the helper works. Pure, so the rules can
 * be tested and shared by the message box and the server.
 */

export const FIRST_HOUR = 7;
export const LAST_HOUR = 21;
/** Past its time by more than this (Chrome was closed), it is held for you instead of going late. */
export const LATE_MS = 2 * 60 * 60 * 1000;
/** The furthest ahead a message can be scheduled. */
export const MAX_AHEAD_DAYS = 60;
const MIN_AHEAD_MS = 2 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export type HeldReason = "replied" | "late";

/** Why this time won't do, or null when it is fine. */
export function scheduleProblem(sendAt: Date, timeZone: string, now: Date = new Date()): string | null {
  if (Number.isNaN(sendAt.getTime())) return "Pick a day and time.";
  if (sendAt.getTime() < now.getTime() + MIN_AHEAD_MS) return "Pick a time a few minutes from now, or send it now.";
  if (sendAt.getTime() > now.getTime() + MAX_AHEAD_DAYS * DAY) return `Pick a time in the next ${MAX_AHEAD_DAYS} days.`;
  const hour = Number(toWallInput(sendAt, timeZone).slice(11, 13));
  if (hour < FIRST_HOUR || hour >= LAST_HOUR) return "Pick a time between 7 am and 9 pm. The helper leaves LinkedIn alone at night.";
  return null;
}

/** The day `days` from today where you are, at that clock time. */
function dayAt(now: Date, timeZone: string, days: number, time: string): Date {
  const today = toWallInput(now, timeZone).slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return wallTimeToDate(`${day}T${time}`, timeZone)!;
}

export interface SchedulePreset {
  label: string;
  at: Date;
}

/** Tomorrow morning and next Monday morning, both 9 am where you are. */
export function schedulePresets(timeZone: string, now: Date = new Date()): SchedulePreset[] {
  const tomorrow = dayAt(now, timeZone, 1, "09:00");
  const weekday = new Date(`${toWallInput(now, timeZone).slice(0, 10)}T00:00:00Z`).getUTCDay();
  // Days to the coming Monday; on a Sunday that is tomorrow, so take the one after.
  let toMonday = (8 - weekday) % 7 || 7;
  if (toMonday === 1) toMonday = 8;
  return [
    { label: "Tomorrow morning", at: tomorrow },
    { label: "Monday morning", at: dayAt(now, timeZone, toMonday, "09:00") },
  ];
}

/** Scheduled and due, but more than LATE_MS past its time. */
export function isLate(sendAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - sendAt.getTime() > LATE_MS;
}

/** "Wed 14 Oct, 9:00 am" where you are. */
export function sendLabel(sendAt: Date | string, timeZone: string): string {
  return formatWhen(new Date(sendAt), timeZone);
}

/** "Wed 9:00 am" for the inbox list: the day name is enough within the week. */
export function shortSendLabel(sendAt: Date | string, timeZone: string, now: Date = new Date()): string {
  const at = new Date(sendAt);
  const full = formatWhen(at, timeZone);
  const [day, rest] = [full.slice(0, 3), full.slice(full.indexOf(",") + 2)];
  if (at.getTime() - now.getTime() > 6 * DAY) return full.slice(0, full.indexOf(","));
  return `${day} ${rest}`;
}
