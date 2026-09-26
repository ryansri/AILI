/*
 * AILI helper, background service worker.
 *
 * Once a minute, while paired and LinkedIn is logged in:
 *   1. deliver any message the user clicked Send on in AILI (one per tick),
 *   2. every other tick, read the inbox and push new conversations and
 *      messages to AILI,
 *   3. tell AILI it is alive.
 *
 * It never sends anything on its own. The queue only holds what a human
 * clicked, and AILI caps it per day.
 */

import { postSync, reportOutbox, reportStatus, takeOutbox } from "./aili";
import { LinkedInError, getLinkedInCookies, jitter } from "./linkedin/client";
import { fetchConversationsPage, fetchThread, getMe, sendToConversation, sendToRecipient, type InboxCategory } from "./linkedin/api";
import type { ConversationSummary, PlainMessage } from "./linkedin/normalize";
import { getPairing, getStatus, getSyncedAt, setStatus, setSyncedAt } from "./storage";

const ALARM = "aili-tick";
const TICK_MINUTES = 1;
/** Conversations idle for longer than this are not imported on first sync. */
const BACKFILL_DAYS = 90;
/** Pages of 20 conversations to scan per category on each sync. */
const PAGES: Record<InboxCategory, number> = { PRIMARY_INBOX: 2, SECONDARY_INBOX: 1 };

let running = false;
let tick = 0;

chrome.runtime.onInstalled.addListener(() => schedule());
chrome.runtime.onStartup.addListener(() => schedule());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void cycle({ force: false });
});
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "sync-now") {
    void cycle({ force: true }).then(() => reply({ ok: true }));
    return true;
  }
  return false;
});

async function schedule() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) chrome.alarms.create(ALARM, { periodInMinutes: TICK_MINUTES });
}

export async function cycle({ force }: { force: boolean }): Promise<void> {
  if (running) return;
  running = true;
  tick += 1;
  try {
    const pairing = await getPairing();
    if (!pairing) {
      await setStatus({ state: "idle" });
      return;
    }

    if (!(await getLinkedInCookies())) {
      await setStatus({ state: "logged_out", lastError: undefined });
      await reportStatus(pairing, { state: "logged_out" }).catch(() => {});
      return;
    }

    const me = await getMe();

    const delivered = await deliverOutbox(pairing, me.memberUrn);
    if (force || delivered > 0 || tick % 2 === 1) {
      await syncInbox(pairing, me.memberUrn, me.displayName);
    } else {
      await reportStatus(pairing, { state: "ok", memberUrn: me.memberUrn, displayName: me.displayName });
    }
    await setStatus({ state: "ok", lastError: undefined, memberUrn: me.memberUrn, displayName: me.displayName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const loggedOut = err instanceof LinkedInError && (err.status === 401 || err.status === 403);
    await setStatus({ state: loggedOut ? "logged_out" : "error", lastError: message });
    const pairing = await getPairing();
    if (pairing) await reportStatus(pairing, { state: loggedOut ? "logged_out" : "error" }).catch(() => {});
  } finally {
    running = false;
  }
}

/** Sends at most one queued message per tick, so sends are spaced out. */
async function deliverOutbox(pairing: Awaited<ReturnType<typeof getPairing>> & object, memberUrn: string): Promise<number> {
  const items = await takeOutbox(pairing);
  let delivered = 0;
  for (const item of items) {
    try {
      await jitter(1500, 3000);
      const sent = item.conversationId
        ? { ...(await sendToConversation(memberUrn, item.conversationId, item.body)), conversationId: item.conversationId }
        : item.recipientUrn
          ? await sendToRecipient(memberUrn, item.recipientUrn, item.body)
          : null;
      if (!sent) throw new Error("No LinkedIn id for this person");
      await reportOutbox(pairing, item.id, {
        status: "sent",
        externalId: sent.id || undefined,
        conversationId: sent.conversationId,
        sentAt: sent.sentAt || Date.now(),
      });
      delivered += 1;
      const status = await getStatus();
      await setStatus({ sentToday: (status.sentToday ?? 0) + 1 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await reportOutbox(pairing, item.id, { status: "failed", error: message }).catch(() => {});
      if (err instanceof LinkedInError && (err.status === 401 || err.status === 403)) throw err;
    }
  }
  return delivered;
}

async function syncInbox(pairing: Awaited<ReturnType<typeof getPairing>> & object, memberUrn: string, displayName: string) {
  const syncedAt = await getSyncedAt();
  const cutoff = Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;
  const changed: ConversationSummary[] = [];
  let seen = 0;

  for (const category of Object.keys(PAGES) as InboxCategory[]) {
    let cursor: string | null = null;
    for (let page = 0; page < PAGES[category]; page++) {
      if (page > 0 || category !== "PRIMARY_INBOX") await jitter();
      const result = await fetchConversationsPage(memberUrn, category, cursor);
      for (const conv of result.conversations) {
        seen += 1;
        const others = conv.participants.filter((p) => p.urn !== memberUrn);
        if (others.length !== 1) continue; // group threads are not outreach
        const known = syncedAt[conv.id];
        if (known === undefined && conv.lastActivityAt < cutoff) continue; // old and never seen
        if (known !== undefined && conv.lastActivityAt <= known) continue; // nothing new
        changed.push(conv);
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
  }

  const payload = { memberUrn, displayName, conversations: [] as Array<ConversationSummary & { messages: PlainMessage[] }> };
  for (const conv of changed.slice(0, 15)) {
    await jitter();
    const firstTime = syncedAt[conv.id] === undefined;
    const messages = await fetchThread(memberUrn, conv.id, firstTime ? 3 : 1);
    payload.conversations.push({ ...conv, messages });
  }

  if (payload.conversations.length > 0) {
    await postSync(pairing, payload);
    for (const conv of payload.conversations) syncedAt[conv.id] = conv.lastActivityAt;
    await setSyncedAt(syncedAt);
  } else {
    await reportStatus(pairing, { state: "ok", memberUrn, displayName });
  }
  await setStatus({ lastSyncAt: Date.now(), conversations: seen });
}
