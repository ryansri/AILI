import "server-only";
import type { Workspace } from "@prisma/client";
import { db } from "./db";
import { clockFor, toEntryView } from "./content-plan";
import { addDays, localDay, mondayOf, weekday, type EntryStatus } from "./plan";
import { wallTimeToDate } from "./time-zone";
import {
  buildWeek,
  channelOf,
  nextWeekReminder,
  parseUsualWeek,
  reminderText,
  rhythms,
  usualTotal,
  weekTotal,
  type DayItem,
  type ItemState,
  type Rhythm,
  type SavedWeek,
  type UsualWeek,
  type WeekView,
} from "./posting-weeks";

/*
 * Posting days, read from the database: your usual week, the weeks you
 * changed, and what went out or is on its way each day (plan rows, and posts
 * in AILI that have no plan row, which are your profile's).
 */

export interface PostingWeeks {
  today: string;
  timeZone: string;
  usual: UsualWeek;
  /** This week and the next three, oldest first. */
  ahead: WeekView[];
  /** Earlier weeks, newest first. */
  past: WeekView[];
  rhythms: Rhythm[];
  /** From Friday: next week's days with nothing scheduled yet. */
  reminder: string | null;
}

const STATE: Partial<Record<EntryStatus, ItemState>> = { posted: "live", scheduled: "scheduled", written: "written", planned: "planned", missed: "planned" };
const firstLine = (s: string) => s.split("\n").find((l) => l.trim())?.trim() ?? "";

/** The Monday your usual week runs from: saved, or next Monday until it is. */
export function sinceOf(workspace: Pick<Workspace, "postingSince">, today: string): string {
  return workspace.postingSince || addDays(mondayOf(today), 7);
}

/** Everything with a day, from `from`: plan rows and posts without one. */
async function dayItems(workspace: Workspace, from: string): Promise<DayItem[]> {
  const clock = clockFor(workspace);
  const start = new Date((wallTimeToDate(`${from}T00:00`, clock.timeZone) ?? new Date()).getTime() - 86_400_000);
  const [rows, posts] = await Promise.all([
    db.planEntry.findMany({ where: { workspaceId: workspace.id, day: { gte: from } }, include: { post: true } }),
    db.post.findMany({
      where: {
        workspaceId: workspace.id,
        planEntry: null,
        status: { in: ["scheduled", "publishing", "published"] },
        // A day early, so a post just after midnight where you are still counts; the day check below is exact.
        OR: [{ scheduledAt: { gte: start } }, { publishedAt: { gte: start } }],
      },
      select: { id: true, status: true, title: true, body: true, scheduledAt: true, publishedAt: true },
    }),
  ]);
  const items: DayItem[] = [];
  for (const r of rows) {
    const e = toEntryView(r, clock);
    const channel = channelOf(e.channel);
    const state = STATE[e.status];
    if (!channel || !state || !e.day) continue;
    items.push({
      day: e.day,
      channel,
      state,
      title: e.post ? e.post.title || firstLine(e.post.body) || e.topic : e.topic,
      rowId: e.id,
      postId: e.post?.id,
      byHand: !e.post && Boolean(e.postedAt),
    });
  }
  for (const p of posts) {
    const at = p.status === "published" ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt;
    if (!at) continue;
    const day = localDay(at, clock.timeZone);
    if (day < from) continue;
    items.push({ day, channel: "personal", state: p.status === "published" ? "live" : "scheduled", title: p.title || firstLine(p.body), postId: p.id });
  }
  return items;
}

const toSaved = (w: { monday: string; personalDays: string; companyDays: string; note: string; personalImpressions: number | null; companyImpressions: number | null }): SavedWeek => ({
  monday: w.monday,
  personalDays: w.personalDays,
  companyDays: w.companyDays,
  note: w.note,
  personalImpressions: w.personalImpressions,
  companyImpressions: w.companyImpressions,
});

/**
 * The weeks around today. Past weeks go back to the first week anything went
 * out (at most `weeksBack`). The first time, it fixes the day your usual week
 * starts from (next Monday), so the weeks before keep what you did.
 */
export async function loadPostingWeeks(workspace: Workspace, opts: { weeksBack?: number; weeksAhead?: number; save?: boolean } = {}): Promise<PostingWeeks> {
  const { today, timeZone } = clockFor(workspace);
  const weeksBack = opts.weeksBack ?? 12;
  const weeksAhead = opts.weeksAhead ?? 4;
  const thisMonday = mondayOf(today);
  const since = sinceOf(workspace, today);
  if (!workspace.postingSince && opts.save) {
    await db.workspace.update({ where: { id: workspace.id }, data: { postingSince: since } });
  }
  const from = addDays(thisMonday, -7 * weeksBack);
  const [items, saved] = await Promise.all([dayItems(workspace, from), db.postingWeek.findMany({ where: { workspaceId: workspace.id, monday: { gte: from } } })]);
  const savedBy = new Map(saved.map((s) => [s.monday, toSaved(s)]));
  const usual = parseUsualWeek(workspace.postingWeek);
  const week = (monday: string) => buildWeek(monday, savedBy.get(monday), usual, since, items, today);

  const ahead = Array.from({ length: weeksAhead }, (_, i) => week(addDays(thisMonday, 7 * i)));
  const firstOut = [...items.map((i) => i.day), ...saved.map((s) => s.monday)].sort()[0];
  const past: WeekView[] = [];
  for (let m = addDays(thisMonday, -7); firstOut && m >= mondayOf(firstOut) && m >= from; m = addDays(m, -7)) past.push(week(m));

  const short = nextWeekReminder(ahead[1] ?? week(addDays(thisMonday, 7)), today);
  return { today, timeZone, usual, ahead, past, rhythms: rhythms(past), reminder: short ? reminderText(short) : null };
}

/** Progress's posts goal: this week's posting days, or the usual week for a month. */
export async function postsGoal(workspace: Workspace, period: "week" | "month"): Promise<number> {
  if (period === "month") return usualTotal(parseUsualWeek(workspace.postingWeek));
  const weeks = await loadPostingWeeks(workspace, { weeksBack: 0, weeksAhead: 1 });
  return weekTotal(weeks.ahead[0]);
}

/** For the bar across the app, from Friday: what next week still needs. */
export async function postingReminder(workspace: Workspace): Promise<string | null> {
  // It shows from Friday; the rest of the week there is nothing to read.
  if (weekday(clockFor(workspace).today) < 5) return null;
  const weeks = await loadPostingWeeks(workspace, { weeksBack: 0, weeksAhead: 2 });
  return weeks.reminder;
}
