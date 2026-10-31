import { addDays, dayLabel, mondayOf, weekday } from "./plan";

/*
 * Posting days: the days you post each week, for your profile and your
 * company page, and how each week went against them. Your usual week sets the
 * days; any one week can have its own (a lead magnet week with a 4th day).
 * Weeks before you set your days show the days you actually posted. Pure, so
 * the page, Progress, Claude and the tests share it.
 */

export type Channel = "personal" | "company";
export const CHANNELS: Channel[] = ["personal", "company"];
export const CHANNEL_NAMES: Record<Channel, string> = { personal: "Personal", company: "Company page" };
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ChannelDays {
  /** 1 = Monday … 7 = Sunday. */
  days: number[];
  /** "10:30", the time posts go out that day. */
  time: string;
}
export type UsualWeek = Record<Channel, ChannelDays>;

/** Until you pick your own: 3 days on each, profile Mon to Wed, company page Tue, Thu, Fri. */
export const DEFAULT_USUAL_WEEK: UsualWeek = {
  personal: { days: [1, 2, 3], time: "10:30" },
  company: { days: [2, 4, 5], time: "12:15" },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
}

function cleanChannel(v: unknown, fallback: ChannelDays): ChannelDays {
  const o = (v && typeof v === "object" ? v : {}) as Partial<ChannelDays>;
  return { days: o.days === undefined ? fallback.days : cleanDays(o.days), time: TIME_RE.test(String(o.time)) ? String(o.time) : fallback.time };
}

/** The usual week from what is saved (JSON), or the default. */
export function parseUsualWeek(saved: string | null | undefined): UsualWeek {
  if (!saved) return DEFAULT_USUAL_WEEK;
  try {
    const o = JSON.parse(saved) as Partial<Record<Channel, unknown>>;
    return { personal: cleanChannel(o.personal, DEFAULT_USUAL_WEEK.personal), company: cleanChannel(o.company, DEFAULT_USUAL_WEEK.company) };
  } catch {
    return DEFAULT_USUAL_WEEK;
  }
}

/** "1,2,3" from [1, 2, 3], as a week's days are saved; and back. */
export const daysToText = (days: number[]) => cleanDays(days).join(",");
export const daysFromText = (s: string) => cleanDays(s.split(",").filter(Boolean));

/** "Mon · Tue · Wed", or "No days". */
export function daysLabel(days: number[]): string {
  return days.length ? days.map((d) => WEEKDAY_SHORT[d - 1]).join(" · ") : "No days";
}

/** Which page a plan row's channel is: blank is your profile, anything with "company" or "page" the company page. */
export function channelOf(channel: string): Channel | null {
  const c = channel.trim().toLowerCase();
  if (!c || c.includes("personal") || c.includes("profile")) return "personal";
  if (c.includes("company") || c.includes("page")) return "company";
  return null;
}

// ---------------------------------------------------------------------------
// What went out, or is on its way, on each day
// ---------------------------------------------------------------------------

export type ItemState = "live" | "scheduled" | "written" | "planned";

export interface DayItem {
  day: string;
  channel: Channel;
  state: ItemState;
  title: string;
  /** The plan row, when there is one. */
  rowId?: string;
  /** The post in AILI, when there is one. */
  postId?: string;
  /** Marked posted or scheduled by hand (the post went up on LinkedIn, not through AILI). */
  byHand?: boolean;
}

const RANK: Record<ItemState, number> = { live: 4, scheduled: 3, written: 2, planned: 1 };

export type SlotState = "live" | "scheduled" | "written" | "planned" | "missed" | "empty";

export interface Slot {
  day: string;
  channel: Channel;
  state: SlotState;
  /** One of your posting days (false: something went out on another day). */
  planned: boolean;
  item?: DayItem;
  /** More than one thing that day. */
  more: number;
}

export interface SavedWeek {
  monday: string;
  personalDays: string;
  companyDays: string;
  note: string;
  personalImpressions: number | null;
  companyImpressions: number | null;
}

export interface WeekView {
  monday: string;
  /** This week, next week, or past. */
  when: "past" | "this" | "next" | "later";
  /** Where the days come from: set for this week, your usual week, or (before you set your days) what went out. */
  source: "set" | "usual" | "went out";
  note: string;
  channels: Record<Channel, { days: number[]; slots: Slot[]; done: number; total: number; impressions: number | null }>;
}

/** The days a week runs on, for each page. */
export function weekDays(
  monday: string,
  saved: SavedWeek | undefined,
  usual: UsualWeek,
  since: string,
  items: DayItem[],
): { source: WeekView["source"]; days: Record<Channel, number[]> } {
  if (saved) return { source: "set", days: { personal: daysFromText(saved.personalDays), company: daysFromText(saved.companyDays) } };
  if (monday >= since) return { source: "usual", days: { personal: usual.personal.days, company: usual.company.days } };
  const sunday = addDays(monday, 6);
  const wentOut = (c: Channel) => cleanDays(items.filter((i) => i.channel === c && i.day >= monday && i.day <= sunday).map((i) => weekday(i.day)));
  return { source: "went out", days: { personal: wentOut("personal"), company: wentOut("company") } };
}

function best(items: DayItem[]): DayItem | undefined {
  return [...items].sort((a, b) => RANK[b.state] - RANK[a.state])[0];
}

/** One page's week: a slot per posting day, plus any day something went out anyway. */
export function slotsFor(monday: string, channel: Channel, days: number[], items: DayItem[], today: string): Slot[] {
  const slots: Slot[] = [];
  for (let d = 1; d <= 7; d++) {
    const day = addDays(monday, d - 1);
    const here = items.filter((i) => i.channel === channel && i.day === day);
    const planned = days.includes(d);
    if (!planned && here.length === 0) continue;
    const item = best(here);
    let state: SlotState;
    if (item && (item.state === "live" || item.state === "scheduled")) state = item.state;
    else if (day < today) state = "missed";
    else state = item ? item.state : "empty";
    slots.push({ day, channel, state, planned, item, more: Math.max(0, here.length - 1) });
  }
  return slots;
}

/** Done: live, or scheduled to go. Past days only count what went out. */
export function slotDone(s: Slot): boolean {
  return s.state === "live" || s.state === "scheduled";
}

export function buildWeek(
  monday: string,
  saved: SavedWeek | undefined,
  usual: UsualWeek,
  since: string,
  items: DayItem[],
  today: string,
): WeekView {
  const { source, days } = weekDays(monday, saved, usual, since, items);
  const now = mondayOf(today);
  const when = monday < now ? "past" : monday === now ? "this" : monday === addDays(now, 7) ? "next" : "later";
  const channel = (c: Channel) => {
    const slots = slotsFor(monday, c, days[c], items, today);
    const plannedSlots = slots.filter((s) => s.planned);
    return {
      days: days[c],
      slots,
      done: plannedSlots.filter(slotDone).length,
      total: plannedSlots.length,
      impressions: (c === "personal" ? saved?.personalImpressions : saved?.companyImpressions) ?? null,
    };
  };
  return { monday, when, source, note: saved?.note ?? "", channels: { personal: channel("personal"), company: channel("company") } };
}

/** "3 of 3 scheduled", "2 of 3 live", "0 of 3 · write 3". */
export function channelLine(w: WeekView, c: Channel): { text: string; tone: "good" | "warn" | "bad" | "plain" } {
  const { done, total, slots } = w.channels[c];
  if (total === 0) return { text: "No posting days", tone: "plain" };
  if (w.when === "past") {
    const missed = slots.filter((s) => s.planned && s.state === "missed").length;
    return { text: `${done} of ${total} went out`, tone: missed ? "bad" : "good" };
  }
  if (done === total) return { text: `${done} of ${total} ${w.when === "this" ? "out or scheduled" : "scheduled"} ✓`, tone: "good" };
  const missed = slots.filter((s) => s.planned && s.state === "missed").length;
  const left = total - done - missed;
  const parts = [`${done} of ${total}`];
  if (missed) parts.push(`${missed} missed`);
  if (left) parts.push(`${left} to go`);
  return { text: parts.join(" · "), tone: missed ? "bad" : w.when === "later" ? "plain" : "warn" };
}

/**
 * The reminder: from Friday, next week's posting days that have nothing
 * scheduled yet. Null when it's not Friday to Sunday or next week is ready.
 */
export function nextWeekReminder(next: WeekView, today: string): { channel: Channel; done: number; total: number }[] | null {
  if (weekday(today) < 5) return null;
  const short = CHANNELS.map((c) => ({ channel: c, done: next.channels[c].done, total: next.channels[c].total })).filter((x) => x.done < x.total);
  return short.length ? short : null;
}

export function reminderText(short: { channel: Channel; done: number; total: number }[]): string {
  return `Next week: ${short.map((s) => `${CHANNEL_NAMES[s.channel]} ${s.done} of ${s.total} scheduled`).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Comparing rhythms
// ---------------------------------------------------------------------------

export interface Rhythm {
  channel: Channel;
  /** Posting days a week. */
  days: number;
  weeks: number;
  /** Posts that went out in those weeks. */
  posts: number;
  /** Weeks with impressions typed in, and the average of those. */
  typed: number;
  avgImpressions: number | null;
  /** Average impressions a post, over the typed weeks. */
  perPost: number | null;
  first: string;
  last: string;
}

/** Past weeks grouped by how many days you posted, per page, newest rhythm first. */
export function rhythms(weeks: WeekView[]): Rhythm[] {
  const out = new Map<string, Rhythm & { postsTyped: number; sum: number }>();
  for (const w of weeks.filter((x) => x.when === "past")) {
    for (const c of CHANNELS) {
      const ch = w.channels[c];
      if (ch.total === 0) continue;
      const key = `${c}:${ch.total}`;
      const posts = ch.slots.filter((s) => s.state === "live").length;
      const r = out.get(key) ?? { channel: c, days: ch.total, weeks: 0, posts: 0, typed: 0, avgImpressions: null, perPost: null, first: w.monday, last: w.monday, postsTyped: 0, sum: 0 };
      r.weeks += 1;
      r.posts += posts;
      if (w.monday < r.first) r.first = w.monday;
      if (w.monday > r.last) r.last = w.monday;
      if (ch.impressions !== null) {
        r.typed += 1;
        r.sum += ch.impressions;
        r.postsTyped += posts;
      }
      out.set(key, r);
    }
  }
  return [...out.values()]
    .map(({ postsTyped, sum, ...r }) => ({
      ...r,
      avgImpressions: r.typed ? Math.round(sum / r.typed) : null,
      perPost: r.typed && postsTyped ? Math.round(sum / postsTyped) : null,
    }))
    .sort((a, b) => (a.channel === b.channel ? b.last.localeCompare(a.last) : a.channel === "personal" ? -1 : 1));
}

/** "26 Oct – 1 Nov". */
export function weekLabel(monday: string): string {
  const a = dayLabel(monday).slice(4);
  const b = dayLabel(addDays(monday, 6)).slice(4);
  return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]} – ${b}` : `${a} – ${b}`;
}

/** The week's posting total, both pages: Progress's posts goal for that week. */
export function weekTotal(w: WeekView): number {
  return w.channels.personal.total + w.channels.company.total;
}

export function usualTotal(u: UsualWeek): number {
  return u.personal.days.length + u.company.days.length;
}
