/*
 * Dates in the user's own time zone, for scheduling posts. Claude and ChatGPT
 * may send a time with an offset (exact) or without one ("2026-09-30T09:00"),
 * which means that wall-clock time where the user is.
 */

export const DEFAULT_TIME_ZONE = "UTC";

export function validTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, timeZone: string) {
  const list = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(list.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Minutes ahead of UTC in that zone at that moment, e.g. 600 for Sydney in winter. */
export function offsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "2026-09-30T09:00" read as a clock time in the zone. Null when it is not that shape. */
export function wallTimeToDate(wall: string, timeZone: string): Date | null {
  const m = wall.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const first = offsetMinutes(new Date(guess), timeZone);
  let at = guess - first * 60000;
  // Near a daylight saving change the offset at the answer can differ from the guess's.
  const second = offsetMinutes(new Date(at), timeZone);
  if (second !== first) at = guess - second * 60000;
  return new Date(at);
}

/** A time from Claude or ChatGPT: exact with Z or an offset, otherwise a clock time in the zone. */
export function parseWhen(value: string, timeZone: string): Date | null {
  const v = value.trim();
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(v) && v.includes("T")) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return wallTimeToDate(v, timeZone);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 30 Sep, 9:00 am" in the zone. */
export function formatWhen(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  const weekday = DAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const minute = String(p.minute).padStart(2, "0");
  return `${weekday} ${p.day} ${MONTHS[p.month - 1]}, ${hour12}:${minute} ${p.hour < 12 ? "am" : "pm"}`;
}

/** "UTC+10:00" at that moment. */
export function offsetLabel(date: Date, timeZone: string): string {
  const off = offsetMinutes(date, timeZone);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** The value for an <input type="datetime-local">, in the zone. */
export function toWallInput(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${two(p.month)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}`;
}
