import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { checkScheduleTime } from "./posts";
import { realDay, type ContentKind } from "./plan";
import { toWallInput, wallTimeToDate } from "./time-zone";

/*
 * Changes to the content plan, shared by the app's buttons (plan-actions.ts)
 * and by Claude and ChatGPT (mcp/tools.ts). Every function is given the
 * workspace and only touches its rows.
 */

export interface EntryInput {
  day?: string | null;
  time?: string | null;
  kind?: string;
  topic?: string;
  pillar?: string;
  goal?: string;
  hook?: string;
  notes?: string;
  /** The post's full text, when there is one: saved as a draft linked to the row. */
  text?: string;
  /** The sheet says it went out already: the row comes in as posted, on its day. */
  posted?: boolean;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function cleanDay(day: string | null | undefined): string | null {
  if (!day) return null;
  if (!realDay(day)) throw new Error(`"${day}" is not a day. Use YYYY-MM-DD.`);
  return day;
}

export function cleanTime(time: string | null | undefined): string | null {
  if (!time) return null;
  if (!TIME_RE.test(time)) throw new Error(`"${time}" is not a time. Use HH:MM, e.g. 09:00.`);
  return time;
}

export function cleanKind(kind: string | undefined): ContentKind {
  return kind === "article" ? "article" : "post";
}

function fields(input: EntryInput) {
  return {
    day: cleanDay(input.day),
    time: cleanTime(input.time),
    kind: cleanKind(input.kind),
    topic: oneLine(input.topic, 300),
    pillar: oneLine(input.pillar, 60),
    goal: oneLine(input.goal, 60),
    hook: (input.hook ?? "").trim().slice(0, 500),
    notes: (input.notes ?? "").trim().slice(0, 2000),
  };
}

const newId = () => `c${randomUUID().replace(/-/g, "").slice(0, 24)}`;

/**
 * Adds rows to the plan. With replace, rows still ahead that nothing was done
 * with (no post, not skipped, not posted) go first, so bringing in an updated
 * sheet does not double the plan.
 */
export async function addEntries(
  workspaceId: string,
  inputs: EntryInput[],
  { source, replace = false, today, timeZone }: { source: string; replace?: boolean; today: string; timeZone: string },
): Promise<{ added: number; replaced: number; drafts: number; ids: string[] }> {
  const rows = inputs
    .map((i) => ({ ...fields(i), text: (i.text ?? "").trim(), posted: i.posted === true }))
    .filter((r) => r.topic || r.text || r.day);
  if (rows.length > 1000) throw new Error("That is more than 1,000 rows. Bring them in a part at a time.");
  const posts: { id: string; workspaceId: string; kind: string; title: string; body: string; source: string }[] = [];
  const entries = rows.map(({ text, posted, ...r }) => {
    let postId: string | null = null;
    if (text) {
      postId = newId();
      posts.push({ id: postId, workspaceId, kind: r.kind, title: r.kind === "article" ? r.topic.slice(0, 200) : "", body: text, source });
    }
    return {
      id: newId(),
      workspaceId,
      ...r,
      topic: r.topic || text.split("\n")[0].slice(0, 300),
      postId,
      source,
      postedAt: posted ? postedAtFor(r, today, timeZone) : null,
    };
  });
  const stale = replace
    ? { workspaceId, postId: null, skipped: false, postedAt: null, OR: [{ day: null }, { day: { gte: today } }] }
    : null;
  const results = await db.$transaction([
    ...(stale ? [db.planEntry.deleteMany({ where: stale })] : []),
    db.post.createMany({ data: posts }),
    db.planEntry.createMany({ data: entries }),
  ]);
  return { added: entries.length, replaced: stale ? results[0].count : 0, drafts: posts.length, ids: entries.map((e) => e.id) };
}

export async function ownEntry(workspaceId: string, id: string) {
  const entry = await db.planEntry.findFirst({ where: { id, workspaceId }, include: { post: true } });
  if (!entry) throw new Error("That plan row is not there any more.");
  return entry;
}

/** Changes a row's topic, pillar, goal, hook, notes, time, or type (while nothing is written). */
export async function updateEntry(workspaceId: string, id: string, patch: EntryInput) {
  const entry = await ownEntry(workspaceId, id);
  const data: Record<string, string | null> = {};
  if (patch.topic !== undefined) data.topic = oneLine(patch.topic, 300);
  if (patch.pillar !== undefined) data.pillar = oneLine(patch.pillar, 60);
  if (patch.goal !== undefined) data.goal = oneLine(patch.goal, 60);
  if (patch.hook !== undefined) data.hook = patch.hook.trim().slice(0, 500);
  if (patch.notes !== undefined) data.notes = patch.notes.trim().slice(0, 2000);
  if (patch.time !== undefined) data.time = cleanTime(patch.time);
  if (patch.kind !== undefined && cleanKind(patch.kind) !== entry.kind) {
    if (entry.post) throw new Error("It is already written, so its type stays.");
    data.kind = cleanKind(patch.kind);
  }
  await db.planEntry.update({ where: { id: entry.id }, data });
}

/** The same local time as a scheduled post's, on another day. Throws if that is not ahead. */
function sameTimeOn(at: Date, day: string, timeZone: string): Date {
  const wall = toWallInput(at, timeZone).slice(11, 16);
  const next = wallTimeToDate(`${day}T${wall}`, timeZone);
  if (!next) throw new Error("That day does not work.");
  try {
    checkScheduleTime(next);
  } catch {
    throw new Error("Its post is scheduled, and that time on that day has passed. Pick a later day.");
  }
  return next;
}

/**
 * Moves a row to another day (or out of the plan, with null). If its post is
 * scheduled, the post moves too, at the same time of day. With swap, a row
 * already on that day takes this row's old day.
 */
export async function moveEntry(workspaceId: string, id: string, day: string | null, { swap = false, timeZone }: { swap?: boolean; timeZone: string }) {
  const entry = await ownEntry(workspaceId, id);
  const target = cleanDay(day);
  if (target === entry.day) return { swapped: false };
  const other =
    swap && target
      ? await db.planEntry.findFirst({ where: { workspaceId, day: target, skipped: false, id: { not: entry.id } }, include: { post: true }, orderBy: { time: "asc" } })
      : null;
  if (swap && !other) throw new Error("There is nothing on that day to swap with.");
  if (other && !entry.day) throw new Error("This row has no day yet, so there is nothing to swap. Move it instead.");
  const ops = [];
  for (const [row, to] of [[entry, target], ...(other ? [[other, entry.day]] : [])] as [typeof entry, string | null][]) {
    const post = row.post;
    if (post?.status === "scheduled" && post.scheduledAt) {
      if (!to) throw new Error("Its post is scheduled. Take it off the schedule first, or pick a day.");
      ops.push(db.post.update({ where: { id: post.id }, data: { scheduledAt: sameTimeOn(post.scheduledAt, to, timeZone) } }));
    } else if (post?.status === "published" || post?.status === "publishing") {
      throw new Error("It has already gone out, so it stays on its day.");
    }
    ops.push(db.planEntry.update({ where: { id: row.id }, data: { day: to } }));
  }
  await db.$transaction(ops);
  return { swapped: Boolean(other) };
}

/**
 * Links a post or article to a row: the row's status follows it from now on.
 * A post can belong to one row, so any other row lets go of it.
 */
export async function linkPost(workspaceId: string, entryId: string, postId: string) {
  const entry = await ownEntry(workspaceId, entryId);
  const post = await db.post.findFirst({ where: { id: postId, workspaceId } });
  if (!post) throw new Error("That post is not in AILI any more.");
  if (entry.postId && entry.postId !== postId && entry.post?.body.trim()) {
    throw new Error("That plan row already has a post. Open it from the plan instead.");
  }
  await db.$transaction([
    db.planEntry.updateMany({ where: { workspaceId, postId, id: { not: entry.id } }, data: { postId: null } }),
    db.planEntry.update({ where: { id: entry.id }, data: { postId } }),
  ]);
}

/** When a linked post is scheduled for another day, its row follows it there. */
export async function followSchedule(postId: string, day: string) {
  await db.planEntry.updateMany({ where: { postId, NOT: { day } }, data: { day } });
}

/** The time a row's post would go out: its day at its time (9:00 when the plan has none). */
export function entryWhen(entry: { day: string | null; time: string | null }, timeZone: string): Date | null {
  return entry.day ? wallTimeToDate(`${entry.day}T${entry.time ?? "09:00"}`, timeZone) : null;
}

/**
 * When a row marked as posted by hand went out: on its day if that has passed
 * (people mark them afterwards), otherwise now.
 */
export function postedAtFor(entry: { day: string | null; time: string | null }, today: string, timeZone: string): Date {
  if (entry.day && entry.day < today) return entryWhen(entry, timeZone) ?? new Date();
  return new Date();
}
