"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { clockFor } from "./content-plan";
import {
  addEntries,
  cleanKind,
  cleanTime,
  moveEntry as move,
  ownEntry,
  postedAtFor,
  updateEntry as update,
  type EntryInput,
} from "./plan-store";
import { PLAN_WARNING_DAYS, rhythmDays } from "./plan";
import { validTimeZone } from "./time-zone";

/*
 * Server actions for the content plan: bringing rows in, changing, moving,
 * skipping and marking them, and the time zone and warning settings. Each
 * resolves the logged-in workspace first and only touches its own rows.
 */

function done() {
  revalidatePath("/posts");
  // The warning bar across the app counts plan rows.
  revalidatePath("/", "layout");
}

/** Rows from a spreadsheet, pasted rows or the template. */
async function importPlanImpl(input: { entries: EntryInput[]; replace?: boolean }) {
  const workspace = await getWorkspace();
  const { today, timeZone } = clockFor(workspace);
  const result = await addEntries(workspace.id, input.entries, { source: "Import", replace: input.replace, today, timeZone });
  done();
  return result;
}

/** One row, from New → Plan row. Returns its id. */
async function addEntryImpl(input: EntryInput): Promise<string> {
  const workspace = await getWorkspace();
  if (!(input.topic ?? "").trim()) throw new Error("Write the topic first.");
  const { today, timeZone } = clockFor(workspace);
  const { ids } = await addEntries(workspace.id, [input], { source: "AILI", today, timeZone });
  done();
  return ids[0];
}

async function updateEntryImpl(id: string, patch: EntryInput) {
  const workspace = await getWorkspace();
  await update(workspace.id, id, patch);
  done();
}

/** To another day, or with swap, trading places with the row on that day. */
async function moveEntryImpl(id: string, day: string | null, swap = false) {
  const workspace = await getWorkspace();
  const result = await move(workspace.id, id, day, { swap, timeZone: clockFor(workspace).timeZone });
  done();
  return result;
}

async function skipEntryImpl(id: string, skipped: boolean) {
  const workspace = await getWorkspace();
  const entry = await ownEntry(workspace.id, id);
  await db.planEntry.update({ where: { id: entry.id }, data: { skipped } });
  done();
}

/** For posts put up straight on LinkedIn, which AILI cannot see. */
async function markEntryPostedImpl(id: string, posted: boolean) {
  const workspace = await getWorkspace();
  const entry = await ownEntry(workspace.id, id);
  const { today, timeZone } = clockFor(workspace);
  await db.planEntry.update({
    where: { id: entry.id },
    data: { postedAt: posted ? postedAtFor(entry, today, timeZone) : null, ...(posted ? { skipped: false } : {}) },
  });
  done();
}

/** The row goes; its post or article, if any, stays in Posts. */
async function deleteEntryImpl(id: string) {
  const workspace = await getWorkspace();
  await db.planEntry.deleteMany({ where: { id, workspaceId: workspace.id } });
  done();
}

/** Ticked rows in the table: skip them (or not). Posted rows are left as they are. */
async function skipEntriesImpl(ids: string[], skipped: boolean) {
  const workspace = await getWorkspace();
  const { count } = await db.planEntry.updateMany({
    where: { id: { in: ids.slice(0, 500) }, workspaceId: workspace.id, postedAt: null },
    data: { skipped },
  });
  done();
  return count;
}

/** Ticked rows in the table go; their posts and articles stay in Posts. */
async function deleteEntriesImpl(ids: string[]) {
  const workspace = await getWorkspace();
  const { count } = await db.planEntry.deleteMany({ where: { id: { in: ids.slice(0, 500) }, workspaceId: workspace.id } });
  done();
  return count;
}

/** The whole plan goes; posts and articles stay. */
async function deletePlanImpl() {
  const workspace = await getWorkspace();
  const { count } = await db.planEntry.deleteMany({ where: { workspaceId: workspace.id } });
  done();
  return count;
}

/**
 * Rows on a weekly rhythm, e.g. posts on Tue, Wed and Thu for 12 weeks, each
 * waiting for a topic. Days that already have a row of that type are left alone.
 */
async function fillFromRhythmImpl(input: { kind: string; weekdays: number[]; time?: string; weeks: number; everyWeeks?: number }) {
  const workspace = await getWorkspace();
  const kind = cleanKind(input.kind);
  const weekdays = [...new Set(input.weekdays.map(Math.round))].filter((d) => d >= 1 && d <= 7);
  if (weekdays.length === 0) throw new Error("Pick at least one day.");
  const weeks = Math.max(1, Math.min(52, Math.round(input.weeks)));
  const time = cleanTime(input.time);
  const { today, timeZone } = clockFor(workspace);
  const days = rhythmDays(today, weeks, weekdays, Math.max(1, Math.min(4, Math.round(input.everyWeeks ?? 1))));
  const taken = await db.planEntry.findMany({
    where: { workspaceId: workspace.id, kind, day: { in: days } },
    select: { day: true },
  });
  const free = days.filter((d) => !taken.some((t) => t.day === d));
  const result = await addEntries(
    workspace.id,
    free.map((day) => ({ day, time, kind, topic: "" })),
    { source: "AILI", today, timeZone },
  );
  done();
  return { added: result.added, alreadyThere: days.length - free.length };
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

/** Settings: warn this many days before a planned row's day; 0 is off. */
async function setPlanWarningImpl(days: number) {
  const workspace = await getWorkspace();
  if (!PLAN_WARNING_DAYS.includes(days)) throw new Error("Pick one of the listed options.");
  await db.workspace.update({ where: { id: workspace.id }, data: { runwayAlertDays: days } });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// What the client calls. Each returns { ok, value } or { ok, error } (see action-result.ts).
// ---------------------------------------------------------------------------

export async function importPlan(...args: Parameters<typeof importPlanImpl>) {
  return run(() => importPlanImpl(...args));
}

export async function addEntry(...args: Parameters<typeof addEntryImpl>) {
  return run(() => addEntryImpl(...args));
}

export async function updateEntry(...args: Parameters<typeof updateEntryImpl>) {
  return run(() => updateEntryImpl(...args));
}

export async function moveEntry(...args: Parameters<typeof moveEntryImpl>) {
  return run(() => moveEntryImpl(...args));
}

export async function skipEntry(...args: Parameters<typeof skipEntryImpl>) {
  return run(() => skipEntryImpl(...args));
}

export async function markEntryPosted(...args: Parameters<typeof markEntryPostedImpl>) {
  return run(() => markEntryPostedImpl(...args));
}

export async function deleteEntry(...args: Parameters<typeof deleteEntryImpl>) {
  return run(() => deleteEntryImpl(...args));
}

export async function skipEntries(...args: Parameters<typeof skipEntriesImpl>) {
  return run(() => skipEntriesImpl(...args));
}

export async function deleteEntries(...args: Parameters<typeof deleteEntriesImpl>) {
  return run(() => deleteEntriesImpl(...args));
}

export async function deletePlan(...args: Parameters<typeof deletePlanImpl>) {
  return run(() => deletePlanImpl(...args));
}

export async function fillFromRhythm(...args: Parameters<typeof fillFromRhythmImpl>) {
  return run(() => fillFromRhythmImpl(...args));
}

export async function setTimeZone(...args: Parameters<typeof setTimeZoneImpl>) {
  return run(() => setTimeZoneImpl(...args));
}

export async function setPlanWarning(...args: Parameters<typeof setPlanWarningImpl>) {
  return run(() => setPlanWarningImpl(...args));
}
