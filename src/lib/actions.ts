"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getWorkspace } from "./data";
import { isStage, isTagColor, type Stage, type TagColor } from "./types";

/*
 * Server actions for the single workspace. Every action re-reads the pages
 * that show people, so the inbox, people table and today list stay in step.
 *
 * Authentication arrives with the Chrome helper in step 3. Until then the app
 * is single user and local.
 */

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
}

const DAY = 24 * 60 * 60 * 1000;

function clean(value: FormDataEntryValue | string | null | undefined, max = 2000): string {
  return String(value ?? "").trim().slice(0, max);
}

export async function updateStage(personId: string, stage: string) {
  if (!isStage(stage)) throw new Error("Unknown stage");
  const data: { stage: Stage; connectedAt?: Date; requestedAt?: Date } = { stage };
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  if (stage === "requested" && !person.requestedAt) data.requestedAt = new Date();
  if (
    ["connected", "conversation", "call", "pilot", "won"].includes(stage) &&
    !person.connectedAt
  ) {
    data.connectedAt = new Date();
  }
  await db.person.update({ where: { id: personId }, data });
  refresh();
}

export async function updateNotes(personId: string, notes: string) {
  await db.person.update({ where: { id: personId }, data: { notes: clean(notes, 5000) } });
  refresh();
}

export async function toggleStar(personId: string) {
  const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
  await db.person.update({ where: { id: personId }, data: { starred: !person.starred } });
  refresh();
}

/** Snooze for a number of days, or pass an ISO date. Null clears the snooze. */
export async function snooze(personId: string, until: number | string | null) {
  let date: Date | null = null;
  if (typeof until === "number") date = new Date(Date.now() + until * DAY);
  else if (typeof until === "string") date = new Date(until);
  if (date && Number.isNaN(date.getTime())) throw new Error("Bad snooze date");
  await db.person.update({ where: { id: personId }, data: { snoozedUntil: date } });
  refresh();
}

export async function archivePerson(personId: string) {
  await db.person.update({ where: { id: personId }, data: { archivedAt: new Date() } });
  refresh();
}

/**
 * Records a message. Used by the manual send flow ("I pasted this into LinkedIn")
 * and by "Log their reply". The Chrome helper will call the same thing in step 3.
 */
export async function logMessage(input: {
  personId: string;
  direction: "in" | "out";
  body: string;
  followUp?: 1 | 2;
  sentAt?: string;
}) {
  const body = clean(input.body, 8000);
  if (!body) throw new Error("Empty message");
  const sentAt = input.sentAt ? new Date(input.sentAt) : new Date();
  await db.message.create({
    data: {
      personId: input.personId,
      direction: input.direction,
      body,
      sentAt,
      followUp: input.direction === "out" ? (input.followUp ?? null) : null,
      source: "manual",
    },
  });
  const updates: { snoozedUntil: null; stage?: Stage; connectedAt?: Date } = { snoozedUntil: null };
  const person = await db.person.findUniqueOrThrow({ where: { id: input.personId } });
  // A message either way means we are talking. Nudge early stages forward.
  if (["warming", "requested", "connected"].includes(person.stage)) updates.stage = "conversation";
  if (!person.connectedAt) updates.connectedAt = sentAt;
  await db.person.update({ where: { id: input.personId }, data: updates });
  refresh();
}

export async function createTag(label: string, color: string) {
  const workspace = await getWorkspace();
  const cleanLabel = clean(label, 40);
  if (!cleanLabel) throw new Error("Tag needs a name");
  const tag = await db.tag.upsert({
    where: { workspaceId_label: { workspaceId: workspace.id, label: cleanLabel } },
    update: {},
    create: {
      workspaceId: workspace.id,
      label: cleanLabel,
      color: isTagColor(color) ? color : ("stone" satisfies TagColor),
    },
  });
  refresh();
  return tag.id;
}

export async function setPersonTag(personId: string, tagId: string, on: boolean) {
  if (on) {
    await db.personTag.upsert({
      where: { personId_tagId: { personId, tagId } },
      update: {},
      create: { personId, tagId },
    });
  } else {
    await db.personTag.deleteMany({ where: { personId, tagId } });
  }
  refresh();
}

export interface PersonInput {
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  linkedinUrl?: string;
  stage?: string;
  notes?: string;
  tagIds?: string[];
}

export async function createPerson(input: PersonInput) {
  const workspace = await getWorkspace();
  const name = clean(input.name, 120);
  if (!name) throw new Error("Name is required");
  const stage = input.stage && isStage(input.stage) ? input.stage : "warming";
  const person = await db.person.create({
    data: {
      workspaceId: workspace.id,
      name,
      headline: clean(input.headline, 200),
      company: clean(input.company, 120),
      location: clean(input.location, 120),
      linkedinUrl: clean(input.linkedinUrl, 300),
      stage,
      notes: clean(input.notes, 5000),
      requestedAt: stage === "requested" ? new Date() : null,
      connectedAt: ["connected", "conversation", "call", "pilot", "won"].includes(stage)
        ? new Date()
        : null,
      tags: { create: (input.tagIds ?? []).map((tagId) => ({ tagId })) },
    },
  });
  refresh();
  return person.id;
}

export async function updatePerson(personId: string, input: PersonInput) {
  const name = clean(input.name, 120);
  if (!name) throw new Error("Name is required");
  await db.person.update({
    where: { id: personId },
    data: {
      name,
      headline: clean(input.headline, 200),
      company: clean(input.company, 120),
      location: clean(input.location, 120),
      linkedinUrl: clean(input.linkedinUrl, 300),
    },
  });
  refresh();
}
