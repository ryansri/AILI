import "server-only";
import type { PlanEntry, Post, Workspace } from "@prisma/client";
import { db } from "./db";
import { linkedInPostUrl } from "./linkedin-posting";
import { timeZoneOf } from "./posts";
import { entryState, localDay, needsYou, type ContentKind, type EntryPost, type EntryState, type PlanClock } from "./plan";

/*
 * The content plan as the pages and Claude read it: every row with its status
 * worked out on the server, in the account's time zone.
 */

export interface EntryView extends EntryState {
  id: string;
  day?: string;
  time?: string;
  kind: ContentKind;
  topic: string;
  pillar: string;
  goal: string;
  hook: string;
  notes: string;
  source: string;
  skipped: boolean;
  postedAt?: string;
  post?: EntryPost;
}

export interface PlanData {
  timeZone: string;
  today: string;
  /** Settings, Sending: warn this many days before a row's day (0 is off). */
  warnDays: number;
  entries: EntryView[];
}

export function clockFor(workspace: Pick<Workspace, "timeZone" | "runwayAlertDays">, now = new Date()): PlanClock {
  const timeZone = timeZoneOf(workspace);
  return { today: localDay(now, timeZone), warnDays: workspace.runwayAlertDays, timeZone };
}

function postOf(p: Post): EntryPost {
  return {
    id: p.id,
    status: (["draft", "scheduled", "publishing", "published", "failed"].includes(p.status) ? p.status : "draft") as EntryPost["status"],
    title: p.title,
    body: p.body,
    scheduledAt: p.scheduledAt?.toISOString(),
    publishedAt: p.publishedAt?.toISOString(),
    url: linkedInPostUrl(p.linkedinUrn) ?? undefined,
  };
}

export function toEntryView(row: PlanEntry & { post: Post | null }, clock: PlanClock): EntryView {
  const facts = {
    day: row.day ?? undefined,
    kind: (row.kind === "article" ? "article" : "post") as ContentKind,
    skipped: row.skipped,
    postedAt: row.postedAt?.toISOString(),
    post: row.post ? postOf(row.post) : undefined,
  };
  return {
    id: row.id,
    ...facts,
    ...entryState(facts, clock),
    time: row.time ?? undefined,
    topic: row.topic,
    pillar: row.pillar,
    goal: row.goal,
    hook: row.hook,
    notes: row.notes,
    source: row.source,
  };
}

/** Rows by day (then time, then when they were added); rows without a day last. */
export function byDay(a: { day?: string; time?: string }, b: { day?: string; time?: string }): number {
  if (!a.day || !b.day) return a.day ? -1 : b.day ? 1 : 0;
  return a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? "");
}

export async function loadPlan(workspace: Workspace): Promise<PlanData> {
  const clock = clockFor(workspace);
  const rows = await db.planEntry.findMany({
    where: { workspaceId: workspace.id },
    include: { post: true },
    orderBy: [{ day: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  });
  return { timeZone: clock.timeZone, today: clock.today, warnDays: clock.warnDays, entries: rows.map((r) => toEntryView(r, clock)).sort(byDay) };
}

/**
 * For the bar across the app: how many rows need the user within the warning
 * window. Null when nothing does, or warnings are off.
 */
export async function planReminder(workspace: Workspace): Promise<{ toWrite: number; toSchedule: number; firstDay: string } | null> {
  if (workspace.runwayAlertDays <= 0) return null;
  const clock = clockFor(workspace);
  const until = localDay(new Date(Date.now() + (workspace.runwayAlertDays + 1) * 86400000), clock.timeZone);
  const rows = await db.planEntry.findMany({
    where: { workspaceId: workspace.id, skipped: false, postedAt: null, day: { gte: clock.today, lte: until } },
    include: { post: true },
  });
  const n = needsYou(rows.map((r) => toEntryView(r, clock)), clock.today);
  const first = [...n.toWrite, ...n.toSchedule].map((r) => r.day!).sort()[0];
  return first ? { toWrite: n.toWrite.length, toSchedule: n.toSchedule.length, firstDay: first } : null;
}
