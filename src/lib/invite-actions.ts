"use server";

import { revalidatePath } from "next/cache";
import { run } from "./action-result";
import { getWorkspace, invitesSince } from "./data";
import { db } from "./db";
import { notWhileRecording } from "./privacy-server";
import { INVITE_CAPS, NOTE_MAX, STALE_DAYS } from "./invites";

/*
 * Connection requests from AILI. Connect puts one in the queue; the helper
 * sends it from your Chrome on its next check (one a minute, never on its
 * own), within the daily limit in Settings, Sending. Withdraw takes one back.
 */

const DAY = 24 * 60 * 60 * 1000;
/** LinkedIn will not take a new request to someone for three weeks after you withdraw one. */
const REASK_AFTER_MS = 21 * DAY;

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

async function queueInviteImpl(personId: string, note: string) {
  const workspace = await getWorkspace();
  await notWhileRecording(workspace.id);
  const person = await db.person.findFirst({ where: { id: personId, workspaceId: workspace.id } });
  if (!person) throw new Error("Not found");
  const who = firstName(person.name);
  if (person.connection === "yes") throw new Error(`You're already connected with ${who}.`);
  if (!person.linkedinUrn && !person.publicId) {
    throw new Error(`AILI doesn't know ${who}'s LinkedIn profile yet. Add their LinkedIn URL first.`);
  }
  if (!workspace.helperLastSeenAt) throw new Error("The Chrome extension is not connected yet.");
  const text = String(note ?? "").trim();
  if (text.length > NOTE_MAX) throw new Error(`LinkedIn takes notes up to ${NOTE_MAX} characters.`);

  const latest = await db.invite.findFirst({ where: { personId: person.id }, orderBy: { createdAt: "desc" } });
  if (latest && ["queued", "sending", "sent", "withdrawing"].includes(latest.status)) {
    throw new Error(`A request to ${who} is already waiting.`);
  }
  if (latest?.status === "withdrawn" && latest.withdrawnAt && Date.now() - latest.withdrawnAt.getTime() < REASK_AFTER_MS) {
    const again = new Date(latest.withdrawnAt.getTime() + REASK_AFTER_MS);
    throw new Error(`LinkedIn lets you ask ${who} again from ${again.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}.`);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if ((await invitesSince(workspace.id, startOfToday)) >= workspace.inviteCap) {
    throw new Error(`That's today's ${workspace.inviteCap} requests. More tomorrow, or change the limit in Settings, Sending.`);
  }

  if (latest?.status === "failed") {
    // Try again: the same request goes back in the queue.
    await db.invite.update({ where: { id: latest.id }, data: { status: "queued", note: text, error: "", claimedAt: null, createdAt: new Date() } });
  } else {
    await db.invite.create({ data: { workspaceId: workspace.id, personId: person.id, note: text } });
  }
  await db.person.update({ where: { id: person.id }, data: { lastActionAt: new Date() } });
  refresh();
}

/**
 * Takes requests back. Not sent yet (or refused): gone at once. Waiting on
 * LinkedIn: the helper withdraws it on its next check. Returns how many.
 */
async function withdrawInvitesImpl(personIds: string[]) {
  const workspace = await getWorkspace();
  const ids = Array.isArray(personIds) ? personIds.slice(0, 500) : [];
  const open = await db.invite.findMany({
    where: { workspaceId: workspace.id, personId: { in: ids }, status: { in: ["queued", "failed", "sent"] } },
  });
  for (const invite of open) {
    if (invite.status === "sent") {
      await db.invite.update({ where: { id: invite.id }, data: { status: "withdrawing", claimedAt: null, error: "" } });
    } else {
      await db.invite.delete({ where: { id: invite.id } });
    }
  }
  refresh();
  return open.length;
}

async function setInviteSettingsImpl(input: { cap?: number; notifyAccepts?: boolean; staleDays?: number }) {
  const workspace = await getWorkspace();
  const data: { inviteCap?: number; notifyAccepts?: boolean; inviteStaleDays?: number } = {};
  if (input.cap !== undefined) {
    if (!INVITE_CAPS.includes(input.cap)) throw new Error("Pick one of the listed limits.");
    data.inviteCap = input.cap;
  }
  if (input.notifyAccepts !== undefined) data.notifyAccepts = Boolean(input.notifyAccepts);
  if (input.staleDays !== undefined) {
    if (!STALE_DAYS.includes(input.staleDays)) throw new Error("Pick one of the listed times.");
    data.inviteStaleDays = input.staleDays;
  }
  await db.workspace.update({ where: { id: workspace.id }, data });
  revalidatePath("/settings", "layout");
  revalidatePath("/people");
}

export async function queueInvite(...args: Parameters<typeof queueInviteImpl>) {
  return run(() => queueInviteImpl(...args));
}

export async function withdrawInvites(...args: Parameters<typeof withdrawInvitesImpl>) {
  return run(() => withdrawInvitesImpl(...args));
}

export async function setInviteSettings(...args: Parameters<typeof setInviteSettingsImpl>) {
  return run(() => setInviteSettingsImpl(...args));
}
