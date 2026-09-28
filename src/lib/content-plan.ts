import "server-only";
import type { Post as PostRow, Workspace } from "@prisma/client";
import { db } from "./db";
import { timeZoneOf } from "./posts";
import {
  addDays,
  buildPlan,
  localDay,
  mondayOf,
  onTimeShare,
  plannedDay,
  runwayOf,
  streakOf,
  weekStats,
  type ContentKind,
  type PlanItem,
  type RhythmRule,
  type Runway,
  type Slot,
  type WeekStats,
} from "./plan";

/*
 * Everything the Content pages and Claude need about the plan, worked out on
 * the server in the account's time zone: slots ahead, runway, the last 12
 * weeks, and which posts brought new conversations.
 */

export type KindFilter = "all" | ContentKind;

export interface RhythmView extends RhythmRule {
  /** False until the user saves a rhythm for this kind. */
  saved: boolean;
}

const DEFAULTS: Record<ContentKind, Omit<RhythmRule, "anchor">> = {
  post: { kind: "post", days: [2, 3, 4], time: "09:00", everyWeeks: 1, enabled: true },
  article: { kind: "article", days: [5], time: "10:00", everyWeeks: 2, enabled: false },
};

export async function getRhythms(workspaceId: string, today: string): Promise<RhythmView[]> {
  const rows = await db.rhythm.findMany({ where: { workspaceId } });
  return (["post", "article"] as const).map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    if (!row) return { ...DEFAULTS[kind], anchor: mondayOf(today), saved: false };
    return {
      kind,
      days: row.days.split(",").map(Number).filter((d) => d >= 1 && d <= 7),
      time: row.time,
      everyWeeks: row.everyWeeks,
      anchor: row.anchor,
      enabled: row.enabled,
      saved: true,
    };
  });
}

export function toPlanItem(p: PostRow): PlanItem {
  return {
    id: p.id,
    kind: p.kind === "article" ? "article" : "post",
    status: (["draft", "scheduled", "publishing", "published", "failed"].includes(p.status) ? p.status : "draft") as PlanItem["status"],
    title: p.title,
    body: p.body,
    slotDay: p.slotDay ?? undefined,
    scheduledAt: p.scheduledAt?.toISOString(),
    publishedAt: p.publishedAt?.toISOString(),
  };
}

export interface ResultRow {
  item: PlanItem;
  people: { id: string; name: string; lead: boolean }[];
}

export interface Results {
  out: number;
  conversations: number;
  leads: number;
  rows: ResultRow[];
}

/** Hours after a post in which a new conversation counts as brought by it. */
export const RESULT_WINDOW_HOURS = 72;

/**
 * Who started a new conversation within 3 days of a post or article going out,
 * from the inbox. "New" means the person's first message ever came from them.
 */
export async function contentResults(workspaceId: string, published: PlanItem[], since: Date): Promise<Results> {
  const out = published.filter((p) => p.publishedAt && new Date(p.publishedAt) >= since);
  if (out.length === 0) return { out: 0, conversations: 0, leads: 0, rows: [] };
  const first = await db.message.groupBy({
    by: ["personId"],
    where: { person: { workspaceId, archivedAt: null } },
    _min: { sentAt: true },
    having: { sentAt: { _min: { gte: since } } },
  });
  const starts = first.map((f) => ({ personId: f.personId, at: f._min.sentAt! }));
  if (starts.length === 0) return { out: out.length, conversations: 0, leads: 0, rows: out.map((item) => ({ item, people: [] })) };
  const [openers, people] = await Promise.all([
    db.message.findMany({
      where: { OR: starts.map((s) => ({ personId: s.personId, sentAt: s.at })) },
      select: { personId: true, direction: true },
    }),
    db.person.findMany({ where: { id: { in: starts.map((s) => s.personId) } }, select: { id: true, name: true, lead: true } }),
  ]);
  const inbound = new Set(openers.filter((m) => m.direction === "in").map((m) => m.personId));
  const byTime = [...out].sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
  const rows = new Map<string, ResultRow>(out.map((item) => [item.id, { item, people: [] }]));
  for (const s of starts) {
    if (!inbound.has(s.personId)) continue;
    // The latest post before the conversation started, if it was within the window.
    const post = byTime.find((p) => {
      const at = new Date(p.publishedAt!).getTime();
      return at <= s.at.getTime() && s.at.getTime() - at <= RESULT_WINDOW_HOURS * 3600_000;
    });
    const person = people.find((p) => p.id === s.personId);
    if (post && person) rows.get(post.id)!.people.push(person);
  }
  const list = [...rows.values()].sort((a, b) => b.people.length - a.people.length || b.item.publishedAt!.localeCompare(a.item.publishedAt!));
  const all = list.flatMap((r) => r.people);
  return { out: out.length, conversations: all.length, leads: all.filter((p) => p.lead).length, rows: list };
}

export interface IdeaView {
  id: string;
  kind: ContentKind;
  text: string;
  source: string;
}

export interface ContentPlan {
  timeZone: string;
  today: string;
  horizon: number;
  kind: KindFilter;
  rhythms: RhythmView[];
  /** Every slot from 12 weeks back to 4 weeks ahead (for the calendar, week planner and review). */
  allSlots: Slot[];
  /** Items outside the rhythm over the same span, with their plan day. */
  allExtra: { day: string; item: PlanItem }[];
  ideas: IdeaView[];
  /** Slots from today to the end of the horizon. */
  upcoming: Slot[];
  /** Published or planned items without a slot in the horizon. */
  upcomingExtra: PlanItem[];
  runway: Runway;
  /** The last 12 weeks, oldest first; the last one is this week. */
  weeks: WeekStats[];
  thisWeek: WeekStats;
  streak: number;
  onTime: number | null;
  leftToFill: number;
  /** The last 30 days. */
  results: Results;
  /** Every published item since 12 weeks back, with who it brought (for the weekly review). */
  resultRows: ResultRow[];
}

export async function loadContentPlan(workspace: Workspace, options: { horizon?: number; kind?: KindFilter } = {}): Promise<ContentPlan> {
  const timeZone = timeZoneOf(workspace);
  const now = new Date();
  const today = localDay(now, timeZone);
  const horizon = options.horizon ?? 14;
  const kind = options.kind ?? "all";
  const firstWeek = addDays(mondayOf(today), -7 * 11);
  const end = addDays(today, Math.max(horizon, 28) - 1);

  const [rhythms, rows, ideaRows] = await Promise.all([
    getRhythms(workspace.id, today),
    db.post.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [
          { publishedAt: { gte: new Date(new Date(`${firstWeek}T00:00:00Z`).getTime() - 86400000) } },
          { status: { in: ["draft", "scheduled", "publishing", "failed"] } },
        ],
      },
    }),
    db.idea.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const rules = rhythms.filter((r) => kind === "all" || r.kind === kind);
  const items = rows.map(toPlanItem).filter((i) => kind === "all" || i.kind === kind);
  // Weeks before the first thing published through AILI are not judged against
  // a rhythm the user had not set: the plan starts that week (or this week).
  const published = items.filter((i) => i.status === "published" && i.publishedAt).map((i) => localDay(new Date(i.publishedAt!), timeZone));
  const firstOut = published.length ? mondayOf(published.sort()[0]) : mondayOf(today);
  const start = firstOut > firstWeek ? firstOut : firstWeek;
  const plan = buildPlan(rules, items, start, end, timeZone, now);
  const weekList = Array.from({ length: 12 }, (_, i) => addDays(firstWeek, i * 7));
  const weeks = weekStats(plan, weekList, timeZone);
  const horizonEnd = addDays(today, horizon - 1);
  const upcoming = plan.slots.filter((s) => s.day >= today && s.day <= horizonEnd);
  const upcomingExtra = plan.extra.filter((i) => {
    const d = i.slotDay ?? (i.scheduledAt ? localDay(new Date(i.scheduledAt), timeZone) : undefined);
    return d !== undefined && d >= today && d <= horizonEnd;
  });
  const all = await contentResults(
    workspace.id,
    items.filter((i) => i.status === "published"),
    new Date(`${firstWeek}T00:00:00Z`),
  );
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const recent = all.rows.filter((r) => r.item.publishedAt! >= monthAgo);
  const people = recent.flatMap((r) => r.people);
  const results: Results = {
    out: recent.length,
    conversations: people.length,
    leads: people.filter((p) => p.lead).length,
    rows: recent,
  };
  const ideas = ideaRows
    .map((i) => ({ id: i.id, kind: (i.kind === "article" ? "article" : "post") as ContentKind, text: i.text, source: i.source }))
    .filter((i) => kind === "all" || i.kind === kind);
  return {
    timeZone,
    today,
    horizon,
    kind,
    rhythms,
    allSlots: plan.slots,
    allExtra: plan.extra.map((item) => ({ item, day: plannedDay(item, timeZone)! })),
    ideas,
    upcoming,
    upcomingExtra,
    runway: runwayOf(plan.slots.filter((s) => s.day >= today), today, addDays(today, 29), now),
    weeks,
    thisWeek: weeks[weeks.length - 1],
    streak: streakOf(weeks),
    onTime: onTimeShare(weeks),
    leftToFill: upcoming.filter((s) => s.state === "empty").length,
    results,
    resultRows: all.rows,
  };
}

/** The day a post fills in the plan once it is scheduled: its local day. */
export function slotDayFor(at: Date, workspace: { timeZone: string | null }): string {
  return localDay(at, timeZoneOf(workspace));
}

/**
 * Just the runway, for the reminder bar on every page: cheap, no results.
 * Null when there is nothing to remind about (no rhythm, or reminders off).
 */
export async function runwayReminder(workspace: Workspace): Promise<{ days: number; next?: Slot } | null> {
  if (workspace.runwayAlertDays <= 0) return null;
  const timeZone = timeZoneOf(workspace);
  const now = new Date();
  const today = localDay(now, timeZone);
  const [rhythms, rows] = await Promise.all([
    getRhythms(workspace.id, today),
    db.post.findMany({ where: { workspaceId: workspace.id, status: { in: ["draft", "scheduled", "publishing", "failed", "published"] }, updatedAt: { gte: new Date(now.getTime() - 60 * 86400000) } } }),
  ]);
  const rules = rhythms.filter((r) => r.saved && r.enabled);
  if (rules.length === 0) return null;
  const end = addDays(today, 29);
  const plan = buildPlan(rules, rows.map(toPlanItem), today, end, timeZone, now);
  const runway = runwayOf(plan.slots, today, end, now);
  return runway.days < workspace.runwayAlertDays ? { days: runway.days, next: runway.next } : null;
}
