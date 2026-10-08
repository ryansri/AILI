import "server-only";
import { db } from "./db";

/** Recording mode is per account, so the helper's pop-ups can stay quiet too. */
const key = (workspaceId: string) => `private:${workspaceId}`;

export async function privacyOn(workspaceId: string): Promise<boolean> {
  const row = await db.appState.findUnique({ where: { key: key(workspaceId) } });
  return row?.value === "on";
}

export async function setPrivacy(workspaceId: string, on: boolean): Promise<void> {
  const k = key(workspaceId);
  if (on) await db.appState.upsert({ where: { key: k }, create: { key: k, value: "on" }, update: { value: "on" } });
  else await db.appState.deleteMany({ where: { key: k } });
}

/**
 * In recording mode the screen shows made-up details. Saving an edit or
 * sending from there could write that over the real ones, or send it to a
 * real person, so it is refused until Shift + H turns the mode off.
 */
export async function notWhileRecording(workspaceId: string): Promise<void> {
  if (await privacyOn(workspaceId)) {
    throw new Error("Recording mode is on, so AILI won't save or send this. Press Shift + H to turn it off.");
  }
}
