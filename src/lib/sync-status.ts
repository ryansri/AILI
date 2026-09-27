import { relativeTime } from "./next-step";
import type { HelperStatus } from "./types";

/*
 * The one line at the top of the inbox list that says what sync is doing.
 * Quiet when all is well, amber with the reason and the fix when not.
 */

export type SyncTone = "off" | "busy" | "ok" | "warn";

export interface SyncLine {
  tone: SyncTone;
  /** Bold part. */
  title: string;
  /** The rest, e.g. the fix. */
  detail?: string;
}

/** After this long without a check-in, sync counts as stopped. The helper checks in every minute. */
export const STOPPED_AFTER_MS = 5 * 60 * 1000;

const ago = (iso: string, now: Date) => {
  const t = relativeTime(iso, now);
  return t === "now" ? "just now" : `${t} ago`;
};

export function syncLine(helper: HelperStatus, now: Date = new Date()): SyncLine {
  if (!helper.lastSeenAt) return { tone: "off", title: "Not syncing.", detail: "The Chrome helper is not connected." };
  const quiet = now.getTime() - new Date(helper.lastSeenAt).getTime() > STOPPED_AFTER_MS;
  // Syncing happens in Chrome, whatever browser AILI is open in.
  if (quiet) return { tone: "warn", title: `Last synced ${ago(helper.lastSeenAt, now)}.`, detail: "Open Chrome to get the latest." };
  if (helper.outdated) return { tone: "warn", title: "The helper is out of date.", detail: "Reload it in chrome://extensions." };
  if (helper.state === "logged_out") return { tone: "warn", title: "LinkedIn is logged out.", detail: "Log in to LinkedIn in Chrome to resume." };
  if (helper.pausedUntil) {
    const mins = Math.max(1, Math.ceil((new Date(helper.pausedUntil).getTime() - now.getTime()) / 60000));
    return { tone: "warn", title: "LinkedIn asked to slow down.", detail: `Resumes in ${mins} min.` };
  }
  if (helper.state === "error") return { tone: "warn", title: "Sync hit a problem.", detail: helper.error ?? "It will try again within a minute." };
  if (helper.importing) return { tone: "busy", title: "Importing", detail: `${helper.imported} so far` };
  return { tone: "ok", title: `Synced ${ago(helper.lastSeenAt, now)}` };
}
