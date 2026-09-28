import { toWallInput, wallTimeToDate } from "./time-zone";

/*
 * The content plan. A rhythm ("posts Tue, Wed, Thu at 9:00; an article every
 * 2 weeks on Friday at 10:00") becomes slots on days. Each slot is matched to
 * the post or article planned for it, which gives it one state:
 *
 *   published  it went out (on its day, or late)
 *   scheduled  a post is set to go out
 *   draft      written, not scheduled (for an article: saved, to publish in LinkedIn)
 *   empty      nothing yet, and the day is still ahead
 *   missed     the day passed with nothing out
 *
 * Runway, streak, on-time and "left to fill" all come from these states.
 * Days are local calendar days ("2026-09-30") in the user's time zone.
 */

export type ContentKind = "post" | "article";
export type SlotState = "published" | "scheduled" | "draft" | "empty" | "missed";

export interface RhythmRule {
  kind: ContentKind;
  /** 1 = Monday … 7 = Sunday. */
  days: number[];
  /** "09:00", 24-hour, in the user's time zone. */
  time: string;
  /** 1 = every week, 2 = every other week, … */
  everyWeeks: number;
  /** A Monday ("YYYY-MM-DD") in a week the rule is on; matters when everyWeeks > 1. */
  anchor: string;
  enabled: boolean;
}

export interface PlanItem {
  id: string;
  kind: ContentKind;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  title: string;
  body: string;
  /** The day it is planned for, when it was put in a slot or scheduled. */
  slotDay?: string;
  scheduledAt?: string;
  publishedAt?: string;
}

export interface Slot {
  kind: ContentKind;
  day: string;
  /** The slot's time, ISO. */
  at: string;
  state: SlotState;
  item?: PlanItem;
  /** Published, but after its day. */
  late?: boolean;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

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

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 29 Sep" from "2026-09-29". */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_NAMES[new Date(utcOf(day)).getUTCDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function ruleOnDay(rule: RhythmRule, day: string): boolean {
  if (!rule.enabled || !rule.days.includes(weekday(day))) return false;
  const every = Math.max(1, Math.round(rule.everyWeeks));
  if (every === 1) return true;
  const weeks = Math.round(daysBetween(mondayOf(rule.anchor), mondayOf(day)) / 7);
  return ((weeks % every) + every) % every === 0;
}

/** The empty slots the rhythm asks for, from one day to another (both included), in time order. */
export function slotsBetween(rules: RhythmRule[], from: string, to: string, timeZone: string): Omit<Slot, "state">[] {
  const out: Omit<Slot, "state">[] = [];
  for (let day = from; daysBetween(day, to) >= 0; day = addDays(day, 1)) {
    for (const rule of rules) {
      if (!ruleOnDay(rule, day)) continue;
      const at = wallTimeToDate(`${day}T${rule.time}`, timeZone);
      if (at) out.push({ kind: rule.kind, day, at: at.toISOString() });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** The day an item belongs to in the plan. */
export function plannedDay(item: PlanItem, timeZone: string): string | undefined {
  if (item.slotDay) return item.slotDay;
  if (item.scheduledAt) return localDay(new Date(item.scheduledAt), timeZone);
  if (item.publishedAt) return localDay(new Date(item.publishedAt), timeZone);
  return undefined;
}

export interface PlanView {
  slots: Slot[];
  /** Published or planned items that no slot asked for: extra output, still counted. */
  extra: PlanItem[];
}

/**
 * Fills the rhythm's slots between two days with the items planned for them.
 * An item takes the first open slot of its kind on its day; items left over
 * are extras.
 */
export function buildPlan(
  rules: RhythmRule[],
  items: PlanItem[],
  from: string,
  to: string,
  timeZone: string,
  now: Date = new Date(),
): PlanView {
  const today = localDay(now, timeZone);
  const empty = slotsBetween(rules, from, to, timeZone);
  const pool = items
    .map((item) => ({ item, day: plannedDay(item, timeZone) }))
    .filter((x): x is { item: PlanItem; day: string } => Boolean(x.day) && daysBetween(from, x.day!) >= 0 && daysBetween(x.day!, to) >= 0);
  const used = new Set<string>();
  const slots: Slot[] = empty.map((slot) => {
    const match = pool.find((x) => !used.has(x.item.id) && x.item.kind === slot.kind && x.day === slot.day);
    if (!match) {
      return { ...slot, state: daysBetween(today, slot.day) >= 0 ? "empty" : "missed" };
    }
    used.add(match.item.id);
    const item = match.item;
    if (item.status === "published") {
      const outDay = item.publishedAt ? localDay(new Date(item.publishedAt), timeZone) : slot.day;
      return { ...slot, item, state: "published", late: daysBetween(slot.day, outDay) > 0 };
    }
    if (item.status === "scheduled" || item.status === "publishing") return { ...slot, item, state: "scheduled" };
    // A draft (or a failed post) on a day that has passed still missed its slot.
    if (daysBetween(today, slot.day) < 0) return { ...slot, item, state: "missed" };
    return { ...slot, item, state: "draft" };
  });
  const extra = pool.filter((x) => !used.has(x.item.id)).map((x) => x.item);
  return { slots, extra };
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** A slot is covered when nothing more is needed from the user before its time. */
export function covered(slot: Slot): boolean {
  if (slot.state === "published" || slot.state === "scheduled") return true;
  // Articles are published by hand in LinkedIn: written and saved in the slot is as ready as they get.
  return slot.kind === "article" && slot.state === "draft" && Boolean(slot.item?.body.trim());
}

export interface Runway {
  /** The last day with every slot covered, or null when today's (or the next) slot is already open. */
  until: string | null;
  /** Whole days from today to `until`, counting today. 0 when not covered. */
  days: number;
  /** The first slot that needs work. */
  next?: Slot;
  /** Every slot in the horizon is covered. */
  complete: boolean;
}

/** How far ahead the plan is covered, from now. `slots` are the upcoming slots in time order. */
export function runwayOf(slots: Slot[], today: string, horizonEnd: string, now: Date = new Date()): Runway {
  const ahead = slots.filter((s) => new Date(s.at).getTime() >= now.getTime() || s.day === today);
  const next = ahead.find((s) => !covered(s));
  if (!next) return { until: horizonEnd, days: daysBetween(today, horizonEnd) + 1, complete: true };
  const until = addDays(next.day, -1);
  const days = daysBetween(today, until) + 1;
  return days <= 0 ? { until: null, days: 0, next, complete: false } : { until, days, next, complete: false };
}

export interface WeekStats {
  /** Monday of the week. */
  week: string;
  planned: number;
  onTime: number;
  late: number;
  missed: number;
  /** Future slots already covered. */
  scheduled: number;
  /** Items that went out without a slot. */
  extra: number;
}

export function weekStats(plan: PlanView, weeks: string[], timeZone: string): WeekStats[] {
  return weeks.map((week) => {
    const end = addDays(week, 6);
    const inWeek = plan.slots.filter((s) => daysBetween(week, s.day) >= 0 && daysBetween(s.day, end) >= 0);
    const extra = plan.extra.filter((i) => {
      if (i.status !== "published") return false;
      const d = plannedDay(i, timeZone)!;
      return daysBetween(week, d) >= 0 && daysBetween(d, end) >= 0;
    }).length;
    return {
      week,
      planned: inWeek.length,
      onTime: inWeek.filter((s) => s.state === "published" && !s.late).length,
      late: inWeek.filter((s) => s.state === "published" && s.late).length,
      missed: inWeek.filter((s) => s.state === "missed").length,
      scheduled: inWeek.filter((s) => s.state === "scheduled" || (s.kind === "article" && s.state === "draft")).length,
      extra,
    };
  });
}

/** Weeks in a row, ending with the last full week, where everything planned went out. */
export function streakOf(stats: WeekStats[]): number {
  let streak = 0;
  // The last entry is the current week, still in progress.
  for (let i = stats.length - 2; i >= 0; i--) {
    const w = stats[i];
    if (w.planned === 0) break;
    if (w.onTime + w.late + w.extra < w.planned) break;
    streak++;
  }
  return streak;
}

/** Share of past slots that went out on their day. Null when nothing was due yet. */
export function onTimeShare(stats: WeekStats[]): number | null {
  const due = stats.reduce((n, w) => n + w.onTime + w.late + w.missed, 0);
  if (due === 0) return null;
  return stats.reduce((n, w) => n + w.onTime, 0) / due;
}
