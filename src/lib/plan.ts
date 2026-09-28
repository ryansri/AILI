import { toWallInput } from "./time-zone";

/*
 * The content plan: rows the user brings in from their spreadsheet (a topic on
 * a day), each linked to the post or article written for it. A row's status
 * comes from that post, so nobody updates a status column by hand:
 *
 *   planned    a topic, nothing written yet
 *   written    the text is ready but not scheduled (an article: ready to publish in LinkedIn)
 *   scheduled  set to go out
 *   posted     it went out (published by AILI, or marked as posted by hand)
 *   missed     its day passed and nothing went out
 *   skipped    the user decided not to do it; never counts as missed
 *
 * "due" means it needs the user now: its day is within the warning window
 * (Settings, Sending; 3 days by default) and it is not written, or it is a
 * post that is written but not scheduled.
 *
 * Days are local calendar days ("2026-09-30") in the account's time zone.
 */

export type ContentKind = "post" | "article";
export type EntryStatus = "planned" | "written" | "scheduled" | "posted" | "missed" | "skipped";

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function localDay(date: Date, timeZone: string): string {
  return toWallInput(date, timeZone).slice(0, 10);
}

function utcOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  return new Date(utcOf(day) + n * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86400000);
}

/** 1 = Monday … 7 = Sunday. */
export function weekday(day: string): number {
  const d = new Date(utcOf(day)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function mondayOf(day: string): string {
  return addDays(day, 1 - weekday(day));
}

/** Whether "2026-02-30" is a real day. */
export function realDay(day: string): boolean {
  return DAY_RE.test(day) && new Date(utcOf(day)).toISOString().slice(0, 10) === day;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 29 Sep" from "2026-09-29". */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_NAMES[new Date(utcOf(day)).getUTCDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}

/** "9:00 am" from "09:00". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface EntryPost {
  id: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  title: string;
  body: string;
  scheduledAt?: string;
  publishedAt?: string;
  url?: string;
}

export interface EntryFacts {
  day?: string;
  kind: ContentKind;
  skipped: boolean;
  /** Marked as posted by hand. */
  postedAt?: string;
  post?: EntryPost;
}

export interface EntryState {
  status: EntryStatus;
  /** Needs the user now (see the top of this file). */
  due: boolean;
  /** Posted after its day. */
  late: boolean;
}

export interface PlanClock {
  today: string;
  /** The warning window in days; 0 turns warnings off (missed days still show). */
  warnDays: number;
  timeZone: string;
}

export function entryState(e: EntryFacts, clock: PlanClock): EntryState {
  const { today, warnDays, timeZone } = clock;
  if (e.skipped) return { status: "skipped", due: false, late: false };
  const p = e.post;
  const out = p?.status === "published" ? p.publishedAt : e.postedAt;
  if (out || p?.status === "published") {
    const outDay = out ? localDay(new Date(out), timeZone) : undefined;
    return { status: "posted", due: false, late: Boolean(e.day && outDay && outDay > e.day) };
  }
  if (p && (p.status === "scheduled" || p.status === "publishing")) return { status: "scheduled", due: false, late: false };
  const written = Boolean(p && p.body.trim());
  if (e.day && e.day < today) return { status: "missed", due: false, late: false };
  const soon = Boolean(e.day && warnDays > 0 && daysBetween(today, e.day) <= warnDays);
  if (written) return { status: "written", due: soon && e.kind === "post", late: false };
  return { status: "planned", due: soon, late: false };
}

/** What the status column says. */
export function statusLabel(kind: ContentKind, s: EntryState): string {
  switch (s.status) {
    case "posted":
      return s.late ? "Posted late" : "Posted";
    case "scheduled":
      return "Scheduled";
    case "written":
      return kind === "article" ? "Written, publish in LinkedIn" : s.due ? "Not scheduled" : "Written";
    case "planned":
      return s.due ? "Needs writing" : "Planned";
    case "missed":
      return "Missed";
    default:
      return "Skipped";
  }
}

/** The choices for Settings, Sending, Plan warning: days before a row's day (0 is off). */
export const PLAN_WARNING_DAYS = [0, 1, 2, 3, 5, 7, 14];

// ---------------------------------------------------------------------------
// The plan as a whole
// ---------------------------------------------------------------------------

type Stated = { day?: string; pillar: string } & EntryState;

export interface PlanCounts {
  posted: number;
  missed: number;
  scheduled: number;
  written: number;
  planned: number;
  skipped: number;
  /** Rows with a day, skipped ones left out. */
  total: number;
}

export function countStatuses(rows: Stated[]): PlanCounts {
  const c: PlanCounts = { posted: 0, missed: 0, scheduled: 0, written: 0, planned: 0, skipped: 0, total: 0 };
  for (const r of rows) {
    if (!r.day) continue;
    c[r.status]++;
    if (r.status !== "skipped") c.total++;
  }
  return c;
}

/** First and last day of the plan, and which day of it today is (1-based; 0 before it starts). */
export function planSpan(rows: { day?: string; skipped?: boolean }[], today: string) {
  const days = rows.map((r) => r.day).filter((d): d is string => Boolean(d)).sort();
  if (days.length === 0) return null;
  const first = days[0];
  const last = days[days.length - 1];
  const length = daysBetween(first, last) + 1;
  const dayOf = today < first ? 0 : Math.min(daysBetween(first, today) + 1, length);
  return { first, last, length, dayOf };
}

/**
 * How many went out on their day, of those that were due by now. A row for
 * today counts once it is out; one still to come today is not held against it.
 */
export function onTimeSoFar(rows: Stated[], today: string): { onTime: number; due: number } {
  let onTime = 0;
  let due = 0;
  for (const r of rows) {
    if (!r.day || r.status === "skipped") continue;
    if (r.day < today || (r.day === today && r.status === "posted")) {
      due++;
      if (r.status === "posted" && !r.late) onTime++;
    }
  }
  return { onTime, due };
}

/** How the rows spread over the pillars, biggest first. Rows without a pillar are left out. */
export function pillarBalance(rows: Stated[]): { pillar: string; count: number; share: number }[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (!r.day || r.status === "skipped" || !r.pillar.trim()) continue;
    const key = r.pillar.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  return [...counts.entries()]
    .map(([pillar, count]) => ({ pillar, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.pillar.localeCompare(b.pillar));
}

/** A pillar's colour: the same pillar always gets the same one. */
export const PILLAR_COLOURS = ["blue", "violet", "emerald", "orange", "pink", "cyan", "lime", "amber"] as const;
export type PillarColour = (typeof PILLAR_COLOURS)[number];

export function pillarColours(pillars: string[]): Record<string, PillarColour> {
  const out: Record<string, PillarColour> = {};
  [...new Set(pillars.map((p) => p.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .forEach((p, i) => (out[p] = PILLAR_COLOURS[i % PILLAR_COLOURS.length]));
  return out;
}

export interface NeedsYou<T> {
  /** Missed in the last two weeks, most recent first. */
  missed: T[];
  /** Due soon and not written. */
  toWrite: T[];
  /** Posts due soon, written but not scheduled. */
  toSchedule: T[];
}

export function needsYou<T extends Stated & { kind: ContentKind }>(rows: T[], today: string): NeedsYou<T> {
  const byDay = (a: T, b: T) => (a.day ?? "").localeCompare(b.day ?? "");
  const since = addDays(today, -14);
  return {
    missed: rows.filter((r) => r.status === "missed" && r.day && r.day >= since).sort((a, b) => byDay(b, a)),
    toWrite: rows.filter((r) => r.status === "planned" && r.due).sort(byDay),
    toSchedule: rows.filter((r) => r.status === "written" && r.due).sort(byDay),
  };
}

/** The days a weekly rhythm falls on: these weekdays (1 = Mon), from a day, for some weeks. */
export function rhythmDays(from: string, weeks: number, weekdays: number[], everyWeeks = 1): string[] {
  const out: string[] = [];
  const start = mondayOf(from);
  for (let w = 0; w < weeks; w += Math.max(1, everyWeeks)) {
    for (const d of [...weekdays].sort()) {
      const day = addDays(start, w * 7 + d - 1);
      if (day >= from) out.push(day);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// One post, one row
// ---------------------------------------------------------------------------

export interface MatchRow {
  id: string;
  day?: string;
  time?: string;
  kind: ContentKind;
  /** Nothing of its own besides a topic: made for a post, not planned (no pillar, channel, hook, notes…). */
  bare: boolean;
  /** Not written, skipped or posted: free for a post to fill. */
  open: boolean;
  postId?: string;
  /** When its post goes or went out, local "YYYY-MM-DDTHH:MM". */
  postAt?: string;
}

/**
 * Rows that are the same post twice: a bare row made for a post (e.g. before
 * the sheet came in) and an open planned row on the same day and time, of the
 * same kind. The post belongs to the planned row; the bare one goes.
 */
export function strayPairs(rows: MatchRow[]): { remove: string; fill: string; postId: string }[] {
  const out: { remove: string; fill: string; postId: string }[] = [];
  const taken = new Set<string>();
  for (const a of rows) {
    if (!a.bare || !a.postId || !a.postAt) continue;
    const [day, time] = a.postAt.split("T");
    const b = rows.find((r) => r.id !== a.id && r.open && !r.postId && !taken.has(r.id) && r.kind === a.kind && r.day === day && r.time === time);
    if (!b) continue;
    taken.add(b.id);
    out.push({ remove: a.id, fill: b.id, postId: a.postId });
  }
  return out;
}
