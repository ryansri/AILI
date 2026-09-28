"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { localDay, mondayOf } from "./plan";
import { timeZoneOf } from "./posts";
import { validTimeZone } from "./time-zone";

/*
 * Server actions for the content plan: the rhythm, ideas, putting things in
 * slots, and the time zone and reminder settings. Each resolves the logged-in
 * workspace first and only touches its own rows.
 */

const KINDS = ["post", "article"] as const;
type Kind = (typeof KINDS)[number];

function kindOf(value: string): Kind {
  if (!KINDS.includes(value as Kind)) throw new Error("Pick post or article.");
  return value as Kind;
}

function done() {
  revalidatePath("/posts");
}

/** Saves how often one kind of content should go out. */
async function saveRhythmImpl(input: { kind: string; days: number[]; time: string; everyWeeks: number; enabled: boolean }) {
  const workspace = await getWorkspace();
  const kind = kindOf(input.kind);
  const days = [...new Set(input.days.map(Math.round))].filter((d) => d >= 1 && d <= 7).sort();
  if (input.enabled && days.length === 0) throw new Error("Pick at least one day.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Pick a time.");
  const everyWeeks = Math.max(1, Math.min(4, Math.round(input.everyWeeks) || 1));
  const existing = await db.rhythm.findUnique({ where: { workspaceId_kind: { workspaceId: workspace.id, kind } } });
  // Every-other-week rhythms count from the week they were set up, unless that stays the same.
  const anchor =
    existing && existing.everyWeeks === everyWeeks ? existing.anchor : mondayOf(localDay(new Date(), timeZoneOf(workspace)));
  const data = { days: days.join(","), time: input.time, everyWeeks, anchor, enabled: input.enabled };
  await db.rhythm.upsert({
    where: { workspaceId_kind: { workspaceId: workspace.id, kind } },
    create: { workspaceId: workspace.id, kind, ...data },
    update: data,
  });
  done();
}

async function addIdeaImpl(input: { kind: string; text: string }): Promise<string> {
  const workspace = await getWorkspace();
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text) throw new Error("Write the idea first.");
  const idea = await db.idea.create({ data: { workspaceId: workspace.id, kind: kindOf(input.kind), text } });
  done();
  return idea.id;
}

async function deleteIdeaImpl(ideaId: string) {
  const workspace = await getWorkspace();
  await db.idea.deleteMany({ where: { id: ideaId, workspaceId: workspace.id } });
  done();
}

/**
 * Puts an idea in a slot: it becomes a draft for that day, ready to write up.
 * The idea leaves the list. Returns the new draft's id.
 */
async function ideaToSlotImpl(ideaId: string, slotDay: string, kind?: string): Promise<string> {
  const workspace = await getWorkspace();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDay)) throw new Error("Pick a day.");
  const idea = await db.idea.findFirst({ where: { id: ideaId, workspaceId: workspace.id } });
  if (!idea) throw new Error("That idea is not there any more.");
  const k = kind ? kindOf(kind) : kindOf(idea.kind);
  const [post] = await db.$transaction([
    db.post.create({
      data: {
        workspaceId: workspace.id,
        kind: k,
        // A post starts from the idea as its first line; an article takes it as the title.
        title: k === "article" ? idea.text.slice(0, 200) : "",
        body: k === "article" ? "" : idea.text,
        source: idea.source,
        slotDay,
      },
    }),
    db.idea.delete({ where: { id: idea.id } }),
  ]);
  done();
  return post.id;
}

/** Moves a draft to another plan day, or out of the plan (null). */
async function setSlotDayImpl(postId: string, slotDay: string | null) {
  const workspace = await getWorkspace();
  if (slotDay !== null && !/^\d{4}-\d{2}-\d{2}$/.test(slotDay)) throw new Error("Pick a day.");
  await db.post.updateMany({
    where: { id: postId, workspaceId: workspace.id, status: { in: ["draft", "failed"] } },
    data: { slotDay },
  });
  done();
}

/** "auto" follows the browser (browserZone); anything else is a fixed zone such as "Australia/Sydney". */
async function setTimeZoneImpl(choice: string, browserZone?: string) {
  const workspace = await getWorkspace();
  if (choice === "auto") {
    const zone = validTimeZone(browserZone) ? browserZone : workspace.timeZone;
    await db.workspace.update({ where: { id: workspace.id }, data: { timeZoneAuto: true, timeZone: zone } });
  } else {
    if (!validTimeZone(choice)) throw new Error("That is not a time zone AILI knows.");
    await db.workspace.update({ where: { id: workspace.id }, data: { timeZoneAuto: false, timeZone: choice } });
  }
  revalidatePath("/", "layout");
}

/** Remind when the plan is covered for fewer days than this; 0 is off. */
async function setRunwayAlertImpl(days: number) {
  const workspace = await getWorkspace();
  const value = Math.max(0, Math.min(14, Math.round(days)));
  await db.workspace.update({ where: { id: workspace.id }, data: { runwayAlertDays: value } });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// What the client calls. Each returns { ok, value } or { ok, error } (see action-result.ts).
// ---------------------------------------------------------------------------

export async function saveRhythm(...args: Parameters<typeof saveRhythmImpl>) {
  return run(() => saveRhythmImpl(...args));
}

export async function addIdea(...args: Parameters<typeof addIdeaImpl>) {
  return run(() => addIdeaImpl(...args));
}

export async function deleteIdea(...args: Parameters<typeof deleteIdeaImpl>) {
  return run(() => deleteIdeaImpl(...args));
}

export async function ideaToSlot(...args: Parameters<typeof ideaToSlotImpl>) {
  return run(() => ideaToSlotImpl(...args));
}

export async function setSlotDay(...args: Parameters<typeof setSlotDayImpl>) {
  return run(() => setSlotDayImpl(...args));
}

export async function setTimeZone(...args: Parameters<typeof setTimeZoneImpl>) {
  return run(() => setTimeZoneImpl(...args));
}

export async function setRunwayAlert(...args: Parameters<typeof setRunwayAlertImpl>) {
  return run(() => setRunwayAlertImpl(...args));
}
