"use server";

import { revalidatePath } from "next/cache";
import { run } from "./action-result";
import { ALERTS_PER_DAY, TOUCHES_TO_CONNECT } from "./alerts";
import { getWorkspace } from "./data";
import { db } from "./db";

/*
 * Post alerts and warm-up touches. Nothing here reaches LinkedIn: it records
 * what you did there (opened a profile, tapped the bell, commented).
 */

function refresh() {
  revalidatePath("/inbox");
  revalidatePath("/people");
}

async function ownPerson(personId: string) {
  const workspace = await getWorkspace();
  const person = await db.person.findFirst({ where: { id: personId, workspaceId: workspace.id } });
  if (!person) throw new Error("Not found");
  return { workspace, person };
}

/** You opened their profile from AILI to tap the bell: the row then asks whether it is on. */
async function openedForAlertsImpl(personId: string) {
  await ownPerson(personId);
  await db.person.update({ where: { id: personId }, data: { alertsOpenedAt: new Date() } });
  refresh();
}

/** Bell on, not possible (no bell for you), later (ask tomorrow), or back to not yet. */
async function setAlertsImpl(personId: string, state: "on" | "impossible" | "later" | "") {
  await ownPerson(personId);
  const data =
    state === "later"
      ? { alertsLaterAt: new Date() }
      : state === "on" || state === "impossible"
        ? { alerts: state, alertsAt: new Date() }
        : { alerts: "", alertsAt: null, alertsOpenedAt: null, alertsLaterAt: null };
  await db.person.update({ where: { id: personId }, data });
  refresh();
}

/** "I commented": one warm-up touch. */
async function addTouchImpl(personId: string) {
  const { workspace } = await ownPerson(personId);
  await db.touch.create({ data: { workspaceId: workspace.id, personId } });
  await db.person.update({ where: { id: personId }, data: { lastActionAt: new Date() } });
  refresh();
}

/** Takes back the latest touch (a mis-click). */
async function removeTouchImpl(personId: string) {
  await ownPerson(personId);
  const latest = await db.touch.findFirst({ where: { personId }, orderBy: { createdAt: "desc" } });
  if (latest) await db.touch.delete({ where: { id: latest.id } });
  refresh();
}

async function setAlertSettingsImpl(input: { nudge?: boolean; perDay?: number; touchesToConnect?: number }) {
  const workspace = await getWorkspace();
  const data: { alertsNudge?: boolean; alertsPerDay?: number; touchesToConnect?: number } = {};
  if (input.nudge !== undefined) data.alertsNudge = Boolean(input.nudge);
  if (input.perDay !== undefined) {
    if (!ALERTS_PER_DAY.includes(input.perDay)) throw new Error("Pick one of the listed numbers.");
    data.alertsPerDay = input.perDay;
  }
  if (input.touchesToConnect !== undefined) {
    if (!TOUCHES_TO_CONNECT.includes(input.touchesToConnect)) throw new Error("Pick one of the listed numbers.");
    data.touchesToConnect = input.touchesToConnect;
  }
  await db.workspace.update({ where: { id: workspace.id }, data });
  revalidatePath("/settings", "layout");
  refresh();
}

export async function openedForAlerts(...args: Parameters<typeof openedForAlertsImpl>) {
  return run(() => openedForAlertsImpl(...args));
}
export async function setAlerts(...args: Parameters<typeof setAlertsImpl>) {
  return run(() => setAlertsImpl(...args));
}
export async function addTouch(...args: Parameters<typeof addTouchImpl>) {
  return run(() => addTouchImpl(...args));
}
export async function removeTouch(...args: Parameters<typeof removeTouchImpl>) {
  return run(() => removeTouchImpl(...args));
}
export async function setAlertSettings(...args: Parameters<typeof setAlertSettingsImpl>) {
  return run(() => setAlertSettingsImpl(...args));
}
