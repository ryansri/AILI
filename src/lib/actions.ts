"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getStages, getWorkspace } from "./data";
import { PROTECTED_STAGE_KEYS } from "./stage-rules";
import { fillTemplate } from "./templates";
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
  revalidatePath("/settings", "layout");
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

async function updateStageImpl(personId: string, stage: string) {
  const { workspace, person } = await ownPerson(personId);
  if (!(await stageExists(workspace.id, stage))) throw new Error("Unknown stage");
  const data: { stage: Stage; stageChangedAt?: Date; connectedAt?: Date; requestedAt?: Date; lastActionAt: Date } = {
    stage,
    ...touched(),
  };
  if (stage !== person.stage) data.stageChangedAt = new Date();
  if (stage === "requested" && !person.requestedAt) data.requestedAt = new Date();
  if (TALKING.includes(stage) && !person.connectedAt) data.connectedAt = new Date();
  await db.person.update({ where: { id: personId }, data });
  refresh();
}

async function updateNotesImpl(personId: string, notes: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { notes: clean(notes, 5000), ...touched() } });
  refresh();
}

async function toggleStarImpl(personId: string) {
  const { person } = await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { starred: !person.starred, ...touched() } });
  refresh();
}

/** Snooze for a number of days, or pass an ISO date. Null clears the snooze. */
async function snoozeImpl(personId: string, until: number | string | null) {
  await ownPerson(personId);
  let date: Date | null = null;
  if (typeof until === "number") date = new Date(Date.now() + until * DAY);
  else if (typeof until === "string") date = new Date(until);
  if (date && Number.isNaN(date.getTime())) throw new Error("Bad snooze date");
  await db.person.update({ where: { id: personId }, data: { snoozedUntil: date, ...touched() } });
  refresh();
}

/** Done: nothing more to do with this person until a new message arrives. Clears any snooze. */
async function markDoneImpl(personId: string) {
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
async function reopenImpl(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { handledAt: null, ...touched() } });
  refresh();
}

async function archivePersonImpl(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { archivedAt: new Date() } });
  refresh();
}

/**
 * Records a message logged by hand: the manual send flow ("I pasted this into
 * LinkedIn") and "Log their reply".
 */
async function logMessageImpl(input: {
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
  const updates: {
    snoozedUntil: null;
    handledAt: null;
    stage?: Stage;
    stageChangedAt?: Date;
    connectedAt?: Date;
    lastActionAt: Date;
  } = {
    snoozedUntil: null,
    handledAt: null,
    ...touched(),
  };
  if (["warming", "requested", "connected"].includes(person.stage)) {
    updates.stage = "conversation";
    updates.stageChangedAt = new Date();
  }
  if (!person.connectedAt) updates.connectedAt = sentAt;
  // A message the user sent by hand replaces any draft from Claude or ChatGPT.
  const draft = input.direction === "out" ? { draft: null, draftSource: null, draftAt: null } : {};
  await db.person.update({ where: { id: input.personId }, data: { ...updates, ...draft } });
  refresh();
}

/**
 * Hands a message to the Chrome helper to deliver. The user clicked Send in
 * AILI; the helper is only the courier. Refuses past the daily cap.
 */
async function queueSendImpl(input: { personId: string; body: string; followUp?: 1 | 2 }) {
  const { workspace, person } = await ownPerson(input.personId);
  const body = clean(input.body, 8000);
  if (!body) throw new Error("Empty message");
  if (!person.linkedinUrn) throw new Error("AILI does not know this person on LinkedIn yet. Send it by hand this time.");
  // Queued while Chrome is closed too: the extension sends it the next time it runs.
  if (!workspace.helperLastSeenAt) throw new Error("The Chrome extension is not connected yet.");

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
  await db.person.update({
    where: { id: person.id },
    data: { handledAt: null, draft: null, draftSource: null, draftAt: null, ...touched() },
  });
  refresh();
}

/** Discard on a draft from Claude or ChatGPT. */
async function discardDraftImpl(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { draft: null, draftSource: null, draftAt: null } });
  revalidatePath("/inbox");
}

async function cancelQueuedImpl(outboxId: string) {
  const workspace = await getWorkspace();
  await db.outbox.deleteMany({ where: { id: outboxId, workspaceId: workspace.id, status: "queued" } });
  refresh();
}

/** Adds a stage at the end of the list. Returns its key. */
async function createStageImpl(label: string) {
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
async function reorderStagesImpl(keys: string[]) {
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

/** Stages the app's rules move people into or out of. They can be renamed, not deleted. */
const PROTECTED_STAGES = PROTECTED_STAGE_KEYS;

async function renameStageImpl(key: string, label: string) {
  const workspace = await getWorkspace();
  const name = clean(label, 40);
  if (!name) throw new Error("Stage needs a name");
  const stages = await getStages(workspace.id);
  if (!stages.some((s) => s.key === key)) throw new Error("Not found");
  if (stages.some((s) => s.key !== key && s.label.toLowerCase() === name.toLowerCase())) {
    throw new Error(`There is already a stage called "${name}".`);
  }
  await db.stage.update({ where: { workspaceId_key: { workspaceId: workspace.id, key } }, data: { label: name } });
  refresh();
}

/** Deletes a stage after moving everyone in it to another stage. */
async function deleteStageImpl(key: string, moveTo: string) {
  const workspace = await getWorkspace();
  if (PROTECTED_STAGES.includes(key)) throw new Error("AILI's rules use this stage, so it can be renamed but not deleted.");
  const stages = await getStages(workspace.id);
  if (!stages.some((s) => s.key === key)) throw new Error("Not found");
  if (key === moveTo || !stages.some((s) => s.key === moveTo)) throw new Error("Pick another stage for its people.");
  await db.$transaction([
    db.person.updateMany({ where: { workspaceId: workspace.id, stage: key }, data: { stage: moveTo, stageChangedAt: new Date() } }),
    db.stage.delete({ where: { workspaceId_key: { workspaceId: workspace.id, key } } }),
  ]);
  refresh();
}

async function createTagImpl(label: string, color: string) {
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
async function updateTagImpl(tagId: string, input: { label?: string; color?: string }) {
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
async function deleteTagImpl(tagId: string) {
  const workspace = await getWorkspace();
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: workspace.id } });
  if (!tag) throw new Error("Not found");
  await db.tag.delete({ where: { id: tagId } });
  refresh();
}

async function setPersonTagImpl(personId: string, tagId: string, on: boolean) {
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

async function createPersonImpl(input: PersonInput) {
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
      stageChangedAt: new Date(),
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

async function updatePersonImpl(personId: string, input: PersonInput) {
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
// Onboarding
// ---------------------------------------------------------------------------

/** Onboarding is done (or skipped): from now on the app opens even with nothing synced. */
async function finishOnboardingImpl() {
  const workspace = await getWorkspace();
  if (!workspace.onboardedAt) await db.workspace.update({ where: { id: workspace.id }, data: { onboardedAt: new Date() } });
  refresh();
}

// ---------------------------------------------------------------------------
// Leads and Other
// ---------------------------------------------------------------------------

/** Makes someone in Other a lead, in the stage and tag you picked. */
async function trackAsLeadImpl(personId: string, input: { stage: string; tagId?: string }) {
  const { workspace, person } = await ownPerson(personId);
  if (!(await stageExists(workspace.id, input.stage))) throw new Error("Unknown stage");
  const now = new Date();
  await db.person.update({
    where: { id: personId },
    data: {
      lead: true,
      stage: input.stage,
      ...(input.stage !== person.stage ? { stageChangedAt: now } : {}),
      ...(input.stage === "requested" && !person.requestedAt ? { requestedAt: now } : {}),
      ...(TALKING.includes(input.stage) && !person.connectedAt ? { connectedAt: now } : {}),
      ...touched(),
    },
  });
  if (input.tagId) {
    const tag = await db.tag.findFirst({ where: { id: input.tagId, workspaceId: workspace.id } });
    if (tag) {
      await db.personTag.upsert({
        where: { personId_tagId: { personId, tagId: tag.id } },
        update: {},
        create: { personId, tagId: tag.id },
      });
    }
  }
  refresh();
}

/** Takes people out of your leads. Their conversations stay readable in Other. */
async function moveToOtherImpl(personIds: string[]) {
  const workspace = await getWorkspace();
  const ids = [...new Set(personIds)].slice(0, 500);
  const res = await db.person.updateMany({
    where: { id: { in: ids }, workspaceId: workspace.id },
    data: { lead: false },
  });
  refresh();
  return res.count;
}

// ---------------------------------------------------------------------------
// Many people at once (People page)
// ---------------------------------------------------------------------------

/** The ids that belong to the caller's workspace, capped so one click stays small. */
async function ownIds(workspaceId: string, personIds: string[]) {
  const ids = [...new Set(personIds)].slice(0, 500);
  const rows = await db.person.findMany({
    where: { id: { in: ids }, workspaceId, archivedAt: null },
    select: { id: true, stage: true, requestedAt: true, connectedAt: true },
  });
  return rows;
}

async function bulkSetStageImpl(personIds: string[], stage: string) {
  const workspace = await getWorkspace();
  if (!(await stageExists(workspace.id, stage))) throw new Error("Unknown stage");
  const people = await ownIds(workspace.id, personIds);
  const now = new Date();
  for (const p of people) {
    if (p.stage === stage) continue;
    await db.person.update({
      where: { id: p.id },
      data: {
        stage,
        stageChangedAt: now,
        ...(stage === "requested" && !p.requestedAt ? { requestedAt: now } : {}),
        ...(TALKING.includes(stage) && !p.connectedAt ? { connectedAt: now } : {}),
        ...touched(),
      },
    });
  }
  refresh();
  return people.length;
}

async function bulkAddTagImpl(personIds: string[], tagId: string) {
  const workspace = await getWorkspace();
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId: workspace.id } });
  if (!tag) throw new Error("Unknown tag");
  const people = await ownIds(workspace.id, personIds);
  for (const p of people) {
    await db.personTag.upsert({
      where: { personId_tagId: { personId: p.id, tagId } },
      update: {},
      create: { personId: p.id, tagId },
    });
  }
  refresh();
  return people.length;
}

async function bulkArchiveImpl(personIds: string[]) {
  const workspace = await getWorkspace();
  const people = await ownIds(workspace.id, personIds);
  await db.person.updateMany({
    where: { id: { in: people.map((p) => p.id) }, workspaceId: workspace.id },
    data: { archivedAt: new Date() },
  });
  refresh();
  return people.length;
}

export interface ImportRow {
  name: string;
  linkedinUrl?: string;
  company?: string;
  jobTitle?: string;
}

/**
 * Adds people from a CSV. Anyone whose LinkedIn profile is already in AILI is
 * skipped, so importing the same list twice is harmless.
 */
async function importPeopleImpl(input: { rows: ImportRow[]; stage?: string; tagId?: string }) {
  const workspace = await getWorkspace();
  const stage = input.stage && (await stageExists(workspace.id, input.stage)) ? input.stage : "warming";
  const tag = input.tagId ? await db.tag.findFirst({ where: { id: input.tagId, workspaceId: workspace.id } }) : null;
  const existing = await db.person.findMany({
    where: { workspaceId: workspace.id, publicId: { not: null } },
    select: { publicId: true },
  });
  const known = new Set(existing.map((p) => p.publicId!.toLowerCase()));
  const now = new Date();
  const result = { added: 0, skipped: 0 };
  for (const row of input.rows.slice(0, 1000)) {
    const name = clean(row.name, 120);
    const linkedinUrl = clean(row.linkedinUrl, 300);
    const publicId = publicIdFromUrl(linkedinUrl);
    if (!name || (publicId && known.has(publicId.toLowerCase()))) {
      result.skipped += 1;
      continue;
    }
    if (publicId) known.add(publicId.toLowerCase());
    await db.person.create({
      data: {
        workspaceId: workspace.id,
        name,
        company: clean(row.company, 120),
        jobTitle: clean(row.jobTitle, 120),
        linkedinUrl,
        publicId,
        stage,
        stageChangedAt: now,
        requestedAt: stage === "requested" ? now : null,
        connectedAt: TALKING.includes(stage) ? now : null,
        ...(tag ? { tags: { create: [{ tagId: tag.id }] } } : {}),
      },
    });
    result.added += 1;
  }
  refresh();
  return result;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function cleanTemplate(input: { name: string; body: string }) {
  const name = clean(input.name, 80);
  const body = String(input.body ?? "").trim().slice(0, 8000);
  if (!name) throw new Error("The template needs a name.");
  if (!body) throw new Error("The template needs a message.");
  return { name, body };
}

async function createTemplateImpl(input: { name: string; body: string }) {
  const workspace = await getWorkspace();
  const data = cleanTemplate(input);
  const created = await db.template.create({ data: { workspaceId: workspace.id, ...data } });
  refresh();
  return created.id;
}

async function updateTemplateImpl(id: string, input: { name: string; body: string }) {
  const workspace = await getWorkspace();
  const found = await db.template.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!found) throw new Error("Not found");
  await db.template.update({ where: { id }, data: cleanTemplate(input) });
  refresh();
}

async function deleteTemplateImpl(id: string) {
  const workspace = await getWorkspace();
  const found = await db.template.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!found) throw new Error("Not found");
  await db.template.delete({ where: { id } });
  refresh();
}

/**
 * Queues one message per person, written out from the text (template fields
 * filled per person). The helper sends them one a minute. Stops at the daily
 * cap; skips people AILI cannot reach on LinkedIn and people with a message
 * already waiting. Every send still starts with this click.
 */
async function queueBulkImpl(input: { personIds: string[]; body: string }) {
  const workspace = await getWorkspace();
  const body = String(input.body ?? "").trim().slice(0, 8000);
  if (!body) throw new Error("Write a message first.");
  const ids = [...new Set(input.personIds)].slice(0, 500);
  const people = await db.person.findMany({
    where: { id: { in: ids }, workspaceId: workspace.id, archivedAt: null },
    include: { outbox: { where: { status: { in: ["queued", "sending"] } }, select: { id: true } } },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [sentToday, queued] = await Promise.all([
    db.message.count({ where: { direction: "out", sentAt: { gte: startOfToday }, person: { workspaceId: workspace.id } } }),
    db.outbox.count({ where: { workspaceId: workspace.id, status: { in: ["queued", "sending"] } } }),
  ]);
  let room = Math.max(0, workspace.dailyCap - sentToday - queued);

  const result = { queued: 0, noLinkedIn: 0, alreadyWaiting: 0, overCap: 0 };
  for (const person of people) {
    if (!person.linkedinUrn) {
      result.noLinkedIn += 1;
      continue;
    }
    if (person.outbox.length > 0) {
      result.alreadyWaiting += 1;
      continue;
    }
    if (room <= 0) {
      result.overCap += 1;
      continue;
    }
    const text = fillTemplate(body, { name: person.name, company: person.company, jobTitle: person.jobTitle });
    await db.outbox.create({ data: { workspaceId: workspace.id, personId: person.id, body: text } });
    await db.person.update({ where: { id: person.id }, data: { handledAt: null, ...touched() } });
    room -= 1;
    result.queued += 1;
  }
  refresh();
  return result;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function updateDailyCapImpl(cap: number) {
  const workspace = await getWorkspace();
  const value = Math.max(1, Math.min(100, Math.round(Number(cap) || 0)));
  await db.workspace.update({ where: { id: workspace.id }, data: { dailyCap: value } });
  refresh();
}

/** Desktop notifications for new replies, shown by the helper. */
async function updateNotifyRepliesImpl(on: boolean) {
  const workspace = await getWorkspace();
  await db.workspace.update({ where: { id: workspace.id }, data: { notifyReplies: Boolean(on) } });
  refresh();
}

async function updateAccountImpl(input: { name: string; email: string }) {
  const workspace = await getWorkspace();
  const name = clean(input.name, 80);
  const email = clean(input.email, 200).toLowerCase();
  if (!name) throw new Error("Name is required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email does not look right");
  const initials = name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  await db.workspace.update({ where: { id: workspace.id }, data: { name, email, initials } });
  refresh();
}

async function changePasswordImpl(input: { current: string; next: string }) {
  const workspace = await getWorkspace();
  if (!workspace.passwordHash || !(await verifyPassword(input.current, workspace.passwordHash))) {
    throw new Error("Current password is wrong");
  }
  if (input.next.length < 8) throw new Error("Use at least 8 characters");
  await db.workspace.update({ where: { id: workspace.id }, data: { passwordHash: await hashPassword(input.next) } });
}

/** Makes a new helper token. The old one stops working at once. */
async function rotateHelperTokenImpl(): Promise<string> {
  const workspace = await getWorkspace();
  const token = newHelperToken();
  await db.workspace.update({
    where: { id: workspace.id },
    data: { helperToken: token, helperState: "never", helperLastSeenAt: null },
  });
  refresh();
  return token;
}

// ---------------------------------------------------------------------------
// What the client calls. Each returns { ok, value } or { ok, error } (see action-result.ts).
// ---------------------------------------------------------------------------

export async function updateStage(...args: Parameters<typeof updateStageImpl>) {
  return run(() => updateStageImpl(...args));
}

export async function updateNotes(...args: Parameters<typeof updateNotesImpl>) {
  return run(() => updateNotesImpl(...args));
}

export async function toggleStar(...args: Parameters<typeof toggleStarImpl>) {
  return run(() => toggleStarImpl(...args));
}

export async function snooze(...args: Parameters<typeof snoozeImpl>) {
  return run(() => snoozeImpl(...args));
}

export async function markDone(...args: Parameters<typeof markDoneImpl>) {
  return run(() => markDoneImpl(...args));
}

export async function reopen(...args: Parameters<typeof reopenImpl>) {
  return run(() => reopenImpl(...args));
}

export async function archivePerson(...args: Parameters<typeof archivePersonImpl>) {
  return run(() => archivePersonImpl(...args));
}

export async function logMessage(...args: Parameters<typeof logMessageImpl>) {
  return run(() => logMessageImpl(...args));
}

export async function queueSend(...args: Parameters<typeof queueSendImpl>) {
  return run(() => queueSendImpl(...args));
}

export async function discardDraft(...args: Parameters<typeof discardDraftImpl>) {
  return run(() => discardDraftImpl(...args));
}

export async function cancelQueued(...args: Parameters<typeof cancelQueuedImpl>) {
  return run(() => cancelQueuedImpl(...args));
}

export async function createStage(...args: Parameters<typeof createStageImpl>) {
  return run(() => createStageImpl(...args));
}

export async function reorderStages(...args: Parameters<typeof reorderStagesImpl>) {
  return run(() => reorderStagesImpl(...args));
}

export async function renameStage(...args: Parameters<typeof renameStageImpl>) {
  return run(() => renameStageImpl(...args));
}

export async function deleteStage(...args: Parameters<typeof deleteStageImpl>) {
  return run(() => deleteStageImpl(...args));
}

export async function createTag(...args: Parameters<typeof createTagImpl>) {
  return run(() => createTagImpl(...args));
}

export async function updateTag(...args: Parameters<typeof updateTagImpl>) {
  return run(() => updateTagImpl(...args));
}

export async function deleteTag(...args: Parameters<typeof deleteTagImpl>) {
  return run(() => deleteTagImpl(...args));
}

export async function setPersonTag(...args: Parameters<typeof setPersonTagImpl>) {
  return run(() => setPersonTagImpl(...args));
}

export async function createPerson(...args: Parameters<typeof createPersonImpl>) {
  return run(() => createPersonImpl(...args));
}

export async function updatePerson(...args: Parameters<typeof updatePersonImpl>) {
  return run(() => updatePersonImpl(...args));
}

export async function finishOnboarding(...args: Parameters<typeof finishOnboardingImpl>) {
  return run(() => finishOnboardingImpl(...args));
}

export async function trackAsLead(...args: Parameters<typeof trackAsLeadImpl>) {
  return run(() => trackAsLeadImpl(...args));
}

export async function moveToOther(...args: Parameters<typeof moveToOtherImpl>) {
  return run(() => moveToOtherImpl(...args));
}

export async function bulkSetStage(...args: Parameters<typeof bulkSetStageImpl>) {
  return run(() => bulkSetStageImpl(...args));
}

export async function bulkAddTag(...args: Parameters<typeof bulkAddTagImpl>) {
  return run(() => bulkAddTagImpl(...args));
}

export async function bulkArchive(...args: Parameters<typeof bulkArchiveImpl>) {
  return run(() => bulkArchiveImpl(...args));
}

export async function importPeople(...args: Parameters<typeof importPeopleImpl>) {
  return run(() => importPeopleImpl(...args));
}

export async function createTemplate(...args: Parameters<typeof createTemplateImpl>) {
  return run(() => createTemplateImpl(...args));
}

export async function updateTemplate(...args: Parameters<typeof updateTemplateImpl>) {
  return run(() => updateTemplateImpl(...args));
}

export async function deleteTemplate(...args: Parameters<typeof deleteTemplateImpl>) {
  return run(() => deleteTemplateImpl(...args));
}

export async function queueBulk(...args: Parameters<typeof queueBulkImpl>) {
  return run(() => queueBulkImpl(...args));
}

export async function updateDailyCap(...args: Parameters<typeof updateDailyCapImpl>) {
  return run(() => updateDailyCapImpl(...args));
}

export async function updateNotifyReplies(...args: Parameters<typeof updateNotifyRepliesImpl>) {
  return run(() => updateNotifyRepliesImpl(...args));
}

export async function updateAccount(...args: Parameters<typeof updateAccountImpl>) {
  return run(() => updateAccountImpl(...args));
}

export async function changePassword(...args: Parameters<typeof changePasswordImpl>) {
  return run(() => changePasswordImpl(...args));
}

export async function rotateHelperToken(...args: Parameters<typeof rotateHelperTokenImpl>) {
  return run(() => rotateHelperTokenImpl(...args));
}
