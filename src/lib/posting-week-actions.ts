"use server";

import { revalidatePath } from "next/cache";
import { run } from "./action-result";
import { db } from "./db";
import { getWorkspace } from "./data";
import { clockFor } from "./content-plan";
import { addDays, mondayOf, realDay, weekday } from "./plan";
import { CHANNEL_NAMES, cleanDays, daysToText, parseUsualWeek, type Channel, type UsualWeek } from "./posting-weeks";
import { loadPostingWeeks, sinceOf } from "./posting-weeks-server";
import { wallTimeToDate } from "./time-zone";

/*
 * Server actions for posting days: your usual week, one week's own days and
 * note, the impressions you type in, and posts put up on LinkedIn by hand.
 */

function done() {
  revalidatePath("/posts");
  revalidatePath("/progress");
  // The bar across the app says what next week still needs.
  revalidatePath("/", "layout");
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function monday(day: string): string {
  if (!realDay(day) || weekday(day) !== 1) throw new Error("Pick a week.");
  return day;
}

function channel(c: string): Channel {
  if (c !== "personal" && c !== "company") throw new Error("Pick Personal or Company page.");
  return c;
}

/**
 * Before the usual week changes, weeks already gone keep the days they had:
 * each past week since the usual week started, with no days of its own, is
 * saved as it is now.
 */
async function keepPastWeeks(workspaceId: string, since: string, thisMonday: string, usual: UsualWeek) {
  const have = new Set((await db.postingWeek.findMany({ where: { workspaceId, monday: { gte: since, lt: thisMonday } }, select: { monday: true } })).map((w) => w.monday));
  const data = [];
  for (let m = since; m < thisMonday; m = addDays(m, 7)) {
    if (!have.has(m)) data.push({ workspaceId, monday: m, personalDays: daysToText(usual.personal.days), companyDays: daysToText(usual.company.days) });
  }
  if (data.length) await db.postingWeek.createMany({ data });
}

/** Your usual week: the days and time for each page. It applies from this week on. */
async function setUsualWeekImpl(input: UsualWeek) {
  const workspace = await getWorkspace();
  const { today } = clockFor(workspace);
  const next: UsualWeek = {
    personal: { days: cleanDays(input.personal?.days), time: input.personal?.time ?? "" },
    company: { days: cleanDays(input.company?.days), time: input.company?.time ?? "" },
  };
  for (const c of ["personal", "company"] as const) {
    if (!TIME_RE.test(next[c].time)) throw new Error(`Pick a time for ${CHANNEL_NAMES[c]}.`);
  }
  const since = sinceOf(workspace, today);
  await keepPastWeeks(workspace.id, since, mondayOf(today), parseUsualWeek(workspace.postingWeek));
  await db.workspace.update({
    where: { id: workspace.id },
    data: { postingWeek: JSON.stringify(next), postingSince: since },
  });
  done();
}

/** One week's own days and note. With `usual`, its days become your usual week from this week on. */
async function setWeekImpl(input: { monday: string; personal: number[]; company: number[]; note?: string; usual?: boolean }) {
  const workspace = await getWorkspace();
  const m = monday(input.monday);
  const personalDays = daysToText(input.personal);
  const companyDays = daysToText(input.company);
  const note = (input.note ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  await db.postingWeek.upsert({
    where: { workspaceId_monday: { workspaceId: workspace.id, monday: m } },
    create: { workspaceId: workspace.id, monday: m, personalDays, companyDays, note },
    update: { personalDays, companyDays, note },
  });
  if (input.usual) {
    const old = parseUsualWeek(workspace.postingWeek);
    await setUsualWeekImpl({
      personal: { ...old.personal, days: cleanDays(input.personal) },
      company: { ...old.company, days: cleanDays(input.company) },
    });
  }
  done();
}

/** The week goes back to your usual days. Impressions typed for it stay. */
async function resetWeekImpl(day: string) {
  const workspace = await getWorkspace();
  const m = monday(day);
  const week = await db.postingWeek.findUnique({ where: { workspaceId_monday: { workspaceId: workspace.id, monday: m } } });
  if (!week) return;
  if (week.personalImpressions === null && week.companyImpressions === null) {
    await db.postingWeek.delete({ where: { id: week.id } });
  } else {
    const usual = parseUsualWeek(workspace.postingWeek);
    await db.postingWeek.update({ where: { id: week.id }, data: { personalDays: daysToText(usual.personal.days), companyDays: daysToText(usual.company.days), note: "" } });
  }
  done();
}

/** Impressions for a week, from LinkedIn's analytics, to compare rhythms. Null clears it. */
async function setImpressionsImpl(day: string, page: string, value: number | null) {
  const workspace = await getWorkspace();
  const m = monday(day);
  const c = channel(page);
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100_000_000)) throw new Error("Type a whole number.");
  const n = value === null ? null : Math.round(value);
  const field = c === "personal" ? "personalImpressions" : "companyImpressions";
  const existing = await db.postingWeek.findUnique({ where: { workspaceId_monday: { workspaceId: workspace.id, monday: m } } });
  if (existing) {
    await db.postingWeek.update({ where: { id: existing.id }, data: { [field]: n } });
  } else {
    // A week without days of its own keeps the days it shows now, so the comparison stays right.
    const weeks = await loadPostingWeeks(workspace, { weeksBack: 26, weeksAhead: 1 });
    const week = [...weeks.past, ...weeks.ahead].find((w) => w.monday === m);
    await db.postingWeek.create({
      data: {
        workspaceId: workspace.id,
        monday: m,
        personalDays: daysToText(week?.channels.personal.days ?? []),
        companyDays: daysToText(week?.channels.company.days ?? []),
        [field]: n,
      },
    });
  }
  done();
}

/**
 * A post put up (or scheduled) straight on LinkedIn, such as the company
 * page's, which AILI cannot publish: a plan row marked posted at that day's
 * time. A later day shows as scheduled until then.
 */
async function markOnLinkedInImpl(day: string, page: string) {
  const workspace = await getWorkspace();
  if (!realDay(day)) throw new Error("Pick a day.");
  const c = channel(page);
  const { timeZone } = clockFor(workspace);
  const time = parseUsualWeek(workspace.postingWeek)[c].time;
  const at = wallTimeToDate(`${day}T${time}`, timeZone) ?? new Date();
  await db.planEntry.create({
    data: {
      workspaceId: workspace.id,
      day,
      time,
      kind: "post",
      topic: `${CHANNEL_NAMES[c]} post`,
      channel: CHANNEL_NAMES[c],
      postedAt: at,
      source: "AILI",
    },
  });
  done();
}

// ---------------------------------------------------------------------------
// What the client calls. Each returns { ok, value } or { ok, error } (see action-result.ts).
// ---------------------------------------------------------------------------

export async function setUsualWeek(...args: Parameters<typeof setUsualWeekImpl>) {
  return run(() => setUsualWeekImpl(...args));
}

export async function setWeek(...args: Parameters<typeof setWeekImpl>) {
  return run(() => setWeekImpl(...args));
}

export async function resetWeek(...args: Parameters<typeof resetWeekImpl>) {
  return run(() => resetWeekImpl(...args));
}

export async function setImpressions(...args: Parameters<typeof setImpressionsImpl>) {
  return run(() => setImpressionsImpl(...args));
}

export async function markOnLinkedIn(...args: Parameters<typeof markOnLinkedInImpl>) {
  return run(() => markOnLinkedInImpl(...args));
}
