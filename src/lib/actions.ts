"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getStages, getWorkspace, HELPER_ONLINE_MS } from "./data";
import { newHelperToken, hashPassword, verifyPassword } from "./auth";
import { isTagColor, type Stage, type TagColor } from "./types";

/*
 * Server actions. Every one resolves the logged-in workspace first and only
 * touches rows inside it, so a forged request cannot reach another account.
 */

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  revalidatePath("/settings");
}

const DAY = 24 * 60 * 60 * 1000;

function clean(value: FormDataEntryValue | string | null | undefined, max = 2000): string {
  return String(value ?? "").trim().slice(0, max);
}

/** Loads a person only if it belongs to the caller's workspace. */
async function ownPerson(personId: string) {
  const workspace = await getWorkspace();
  const person = await db.person.findFirst({ where: { id: personId, workspaceId: workspace.id } });
  if (!person) throw new Error("Not found");
  return { workspace, person };
}

const TALKING: Stage[] = ["connected", "conversation", "call", "pilot", "won"];

/** Every user action wakes a stale conversation. */
function touched() {
  return { lastActionAt: new Date() };
}

/** True when the key is one of the workspace's stages. */
async function stageExists(workspaceId: string, key: string) {
  const stages = await getStages(workspaceId);
  return stages.some((s) => s.key === key);
}

export async function updateStage(personId: string, stage: string) {
  const { workspace, person } = await ownPerson(personId);
  if (!(await stageExists(workspace.id, stage))) throw new Error("Unknown stage");
  const data: { stage: Stage; connectedAt?: Date; requestedAt?: Date; lastActionAt: Date } = { stage, ...touched() };
  if (stage === "requested" && !person.requestedAt) data.requestedAt = new Date();
  if (TALKING.includes(stage) && !person.connectedAt) data.connectedAt = new Date();
  await db.person.update({ where: { id: personId }, data });
  refresh();
}

export async function updateNotes(personId: string, notes: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { notes: clean(notes, 5000), ...touched() } });
  refresh();
}

export async function toggleStar(personId: string) {
  const { person } = await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { starred: !person.starred, ...touched() } });
  refresh();
}

/** Snooze for a number of days, or pass an ISO date. Null clears the snooze. */
export async function snooze(personId: string, until: number | string | null) {
  await ownPerson(personId);
  let date: Date | null = null;
  if (typeof until === "number") date = new Date(Date.now() + until * DAY);
  else if (typeof until === "string") date = new Date(until);
  if (date && Number.isNaN(date.getTime())) throw new Error("Bad snooze date");
  await db.person.update({ where: { id: personId }, data: { snoozedUntil: date, ...touched() } });
  refresh();
}

/** Done: nothing more to do with this person until a new message arrives. Clears any snooze. */
export async function markDone(personId: string) {
  await ownPerson(personId);
  // Stamp it after the newest message, so a clock that runs ahead cannot undo Done.
  const latest = await db.message.findFirst({ where: { personId }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
  const handledAt = new Date(Math.max(Date.now(), latest?.sentAt.getTime() ?? 0));
  await db.person.update({
    where: { id: personId },
    data: { handledAt, snoozedUntil: null, ...touched() },
  });
  refresh();
}

/** Undo Done: the next step comes back from the messages. */
export async function reopen(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { handledAt: null, ...touched() } });
  refresh();
}

export async function archivePerson(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { archivedAt: new Date() } });
  refresh();
}

/**
 * Records a message logged by hand: the manual send flow ("I pasted this into
 * LinkedIn") and "Log their reply".
 */
export async function logMessage(input: {
  personId: string;
  direction: "in" | "out";
  body: string;
  followUp?: 1 | 2;
  sentAt?: string;
}) {
  const { person } = await ownPerson(input.personId);
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
  const updates: { snoozedUntil: null; handledAt: null; stage?: Stage; connectedAt?: Date; lastActionAt: Date } = {
    snoozedUntil: null,
    handledAt: null,
    ...touched(),
  };
  if (["warming", "requested", "connected"].includes(person.stage)) updates.stage = "conversation";
  if (!person.connectedAt) updates.connectedAt = sentAt;
  await db.person.update({ where: { id: input.personId }, data: updates });
  refresh();
}

/**
 * Hands a message to the Chrome helper to deliver. The user clicked Send in
 * AILI; the helper is only the courier. Refuses past the daily cap.
 */
export async function queueSend(input: { personId: string; body: string; followUp?: 1 | 2 }) {
  const { workspace, person } = await ownPerson(input.personId);
  const body = clean(input.body, 8000);
  if (!body) throw new Error("Empty message");
  if (!person.linkedinUrn) throw new Error("AILI does not know this person on LinkedIn yet. Send it by hand this time.");
  const online = Date.now() - (workspace.helperLastSeenAt?.getTime() ?? 0) < HELPER_ONLINE_MS;
  if (!online || workspace.helperState !== "ok") throw new Error("The Chrome helper is not connected.");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [sentToday, queued] = await Promise.all([
    db.message.count({ where: { direction: "out", sentAt: { gte: startOfToday }, person: { workspaceId: workspace.id } } }),
    db.outbox.count({ where: { workspaceId: workspace.id, status: { in: ["queued", "sending"] } } }),
  ]);
  if (sentToday + queued >= workspace.dailyCap) throw new Error(`Daily cap of ${workspace.dailyCap} reached.`);

  await db.outbox.create({
    data: { workspaceId: workspace.id, personId: person.id, body, followUp: input.followUp ?? null },
  });
  await db.person.update({ where: { id: person.id }, data: { handledAt: null, ...touched() } });
  refresh();
}

export async function cancelQueued(outboxId: string) {
  const workspace = await getWorkspace();
  await db.outbox.deleteMany({ where: { id: outboxId, workspaceId: workspace.id, status: "queued" } });
  refresh();
}

/** Adds a stage at the end of the list. Returns its key. */
export async function createStage(label: string) {
  const workspace = await getWorkspace();
  const cleanLabel = clean(label, 40);
  if (!cleanLabel) throw new Error("Stage needs a name");
  const stages = await getStages(workspace.id);
  const existing = stages.find((s) => s.label.toLowerCase() === cleanLabel.toLowerCase());
  if (existing) return existing.key;
  const key = `s_${Math.random().toString(36).slice(2, 10)}`;
  await db.stage.create({ data: { workspaceId: workspace.id, key, label: cleanLabel, position: stages.length } });
  refresh();
  return key;
}

/** Saves a new order. Keys not in the workspace are ignored; missing ones keep their place after the rest. */
export async function reorderStages(keys: string[]) {
  const workspace = await getWorkspace();
  const stages = await getStages(workspace.id);
  const known = new Set(stages.map((s) => s.key));
  const ordered = [...new Set(keys.filter((k) => known.has(k)))];
  for (const s of stages) if (!ordered.includes(s.key)) ordered.push(s.key);
  await db.$transaction(
    ordered.map((key, position) =>
      db.stage.update({ where: { workspaceId_key: { workspaceId: workspace.id, key } }, data: { position } }),
    ),
  );
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

/** Renames or recolours a tag. A name already used by another tag is refused. */
export async function updateTag(tagId: string, input: { label?: string; color?: string }) {
  const workspace = await getWorkspace();
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: workspace.id } });
  if (!tag) throw new Error("Not found");
  const label = input.label === undefined ? tag.label : clean(input.label, 40);
  if (!label) throw new Error("Tag needs a name");
  const clash = await db.tag.findFirst({ where: { workspaceId: workspace.id, label, NOT: { id: tagId } } });
  if (clash) throw new Error(`There is already a tag called "${label}".`);
  await db.tag.update({
    where: { id: tagId },
    data: { label, color: input.color && isTagColor(input.color) ? input.color : tag.color },
  });
  refresh();
}

/** Deletes a tag. It comes off everyone who had it; the people stay. */
export async function deleteTag(tagId: string) {
  const workspace = await getWorkspace();
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: workspace.id } });
  if (!tag) throw new Error("Not found");
  await db.tag.delete({ where: { id: tagId } });
  refresh();
}

export async function setPersonTag(personId: string, tagId: string, on: boolean) {
  const { workspace } = await ownPerson(personId);
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: workspace.id } });
  if (!tag) throw new Error("Unknown tag");
  if (on) {
    await db.personTag.upsert({
      where: { personId_tagId: { personId, tagId } },
      update: {},
      create: { personId, tagId },
    });
  } else {
    await db.personTag.deleteMany({ where: { personId, tagId } });
  }
  await db.person.update({ where: { id: personId }, data: touched() });
  refresh();
}

export interface PersonInput {
  name: string;
  headline?: string;
  jobTitle?: string;
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
  const stage = input.stage && (await stageExists(workspace.id, input.stage)) ? input.stage : "warming";
  const tagIds = (input.tagIds ?? []).filter(Boolean);
  const validTags = tagIds.length
    ? await db.tag.findMany({ where: { id: { in: tagIds }, workspaceId: workspace.id }, select: { id: true } })
    : [];
  const person = await db.person.create({
    data: {
      workspaceId: workspace.id,
      name,
      headline: clean(input.headline, 200),
      jobTitle: clean(input.jobTitle, 120),
      company: clean(input.company, 120),
      location: clean(input.location, 120),
      linkedinUrl: clean(input.linkedinUrl, 300),
      publicId: publicIdFromUrl(clean(input.linkedinUrl, 300)),
      stage,
      notes: clean(input.notes, 5000),
      requestedAt: stage === "requested" ? new Date() : null,
      connectedAt: TALKING.includes(stage) ? new Date() : null,
      ...touched(),
      tags: { create: validTags.map((t) => ({ tagId: t.id })) },
    },
  });
  refresh();
  return person.id;
}

export async function updatePerson(personId: string, input: PersonInput) {
  await ownPerson(personId);
  const name = clean(input.name, 120);
  if (!name) throw new Error("Name is required");
  const linkedinUrl = clean(input.linkedinUrl, 300);
  await db.person.update({
    where: { id: personId },
    data: {
      name,
      ...(input.headline !== undefined ? { headline: clean(input.headline, 200) } : {}),
      jobTitle: clean(input.jobTitle, 120),
      company: clean(input.company, 120),
      location: clean(input.location, 120),
      linkedinUrl,
      publicId: publicIdFromUrl(linkedinUrl) ?? undefined,
      profileEditedAt: new Date(),
      ...touched(),
    },
  });
  refresh();
}

function publicIdFromUrl(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateDailyCap(cap: number) {
  const workspace = await getWorkspace();
  const value = Math.max(1, Math.min(100, Math.round(Number(cap) || 0)));
  await db.workspace.update({ where: { id: workspace.id }, data: { dailyCap: value } });
  refresh();
}

export async function updateAccount(input: { name: string; email: string }) {
  const workspace = await getWorkspace();
  const name = clean(input.name, 80);
  const email = clean(input.email, 200).toLowerCase();
  if (!name) throw new Error("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email does not look right");
  const initials = name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  await db.workspace.update({ where: { id: workspace.id }, data: { name, email, initials } });
  refresh();
}

export async function changePassword(input: { current: string; next: string }) {
  const workspace = await getWorkspace();
  if (!workspace.passwordHash || !(await verifyPassword(input.current, workspace.passwordHash))) {
    throw new Error("Current password is wrong");
  }
  if (input.next.length < 8) throw new Error("Use at least 8 characters");
  await db.workspace.update({ where: { id: workspace.id }, data: { passwordHash: await hashPassword(input.next) } });
}

/** Makes a new helper token. The old one stops working at once. */
export async function rotateHelperToken(): Promise<string> {
  const workspace = await getWorkspace();
  const token = newHelperToken();
  await db.workspace.update({
    where: { id: workspace.id },
    data: { helperToken: token, helperState: "never", helperLastSeenAt: null },
  });
  refresh();
  return token;
}
