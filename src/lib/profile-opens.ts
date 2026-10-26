import { dayBounds, formatWhen } from "./time-zone";

/*
 * Profiles you opened on LinkedIn from AILI, so you don't open the same one
 * twice and keep to a safe pace. AILI only notes your click; it never asks
 * LinkedIn anything. A blue dot means opened today (it clears at midnight
 * where you are), a grey one opened in the last OPENED_DAYS. Pure, so the
 * page and the tests share it.
 */

export const OPENED_DAYS = 7;
/** The default for "profiles an hour" in Settings. */
export const DEFAULT_PROFILES_PER_HOUR = 20;
export const MAX_PROFILES_PER_HOUR = 60;
/** The choices in Settings. */
export const PROFILES_PER_HOUR = [5, 10, 15, 20, 30, 40] as const;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type Opened = "today" | "week" | null;

/** Today where you are, earlier this week, or not lately. */
export function openedState(at: Date | string | undefined | null, timeZone: string, now: Date = new Date()): Opened {
  if (!at) return null;
  const t = new Date(at);
  if (t.getTime() > now.getTime()) return "today";
  if (t >= dayBounds(now, timeZone).start) return "today";
  return now.getTime() - t.getTime() <= OPENED_DAYS * DAY ? "week" : null;
}

/** "Opened today, 10:05" or "Opened Mon 26 Oct", for the dot's tooltip. */
export function openedLabel(at: Date | string, timeZone: string, now: Date = new Date()): string {
  const when = formatWhen(new Date(at), timeZone);
  if (openedState(at, timeZone, now) === "today") return `Opened today, ${when.slice(when.indexOf(",") + 2)}`;
  return `Opened ${when.slice(0, when.indexOf(","))}`;
}

export interface ProfilePace {
  perHour: number;
  today: number;
  lastHour: number;
  /** At the hourly number: when the oldest of the last hour's opens is an hour old. */
  nextAt?: string;
}

/** How many you opened today and in the last hour, from each person's last open. */
export function profilePace(openedAt: (Date | string)[], perHour: number, timeZone: string, now: Date = new Date()): ProfilePace {
  const start = dayBounds(now, timeZone).start.getTime();
  const times = openedAt.map((d) => new Date(d).getTime());
  const hour = times.filter((t) => now.getTime() - t < HOUR).sort((a, b) => a - b);
  const pace: ProfilePace = { perHour, today: times.filter((t) => t >= start).length, lastHour: hour.length };
  if (hour.length >= perHour) pace.nextAt = new Date(hour[hour.length - perHour] + HOUR).toISOString();
  return pace;
}

export function validProfilesPerHour(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(MAX_PROFILES_PER_HOUR, v)) : DEFAULT_PROFILES_PER_HOUR;
}
