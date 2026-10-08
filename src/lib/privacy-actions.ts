"use server";

import { run } from "./action-result";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "./data";
import { privacyOn, setPrivacy } from "./privacy-server";

/** Shift + H: recording mode on or off. Returns whether it is now on. */
async function togglePrivacyImpl(): Promise<boolean> {
  const workspace = await getWorkspace();
  const on = !(await privacyOn(workspace.id));
  await setPrivacy(workspace.id, on);
  revalidatePath("/", "layout");
  return on;
}

export async function togglePrivacy(...args: Parameters<typeof togglePrivacyImpl>) {
  return run(() => togglePrivacyImpl(...args));
}
