/*
 * AILI helper, background service worker.
 *
 * Once a minute, while paired and LinkedIn is logged in:
 *   1. deliver any message the user clicked Send on in AILI (one per tick),
 *   2. import history: walk the inbox one page per tick until every
 *      one-to-one conversation active in the last BACKFILL_DAYS is in AILI,
 *   3. after that, every other tick, re-read the first pages of the inbox and
 *      push anything with new activity,
 *   4. once history is in, look up at most two profiles for a current job
 *      title and company (people who need you first, each person once),
 *   5. tell AILI it is alive.
 *
 * It never sends anything on its own. The queue only holds what a human
 * clicked, and AILI caps it per day.
 */

import { postSync, reportLookups, reportOutbox, reportStatus, takeLookups, takeOutbox } from "./aili";
import { LinkedInError, getLinkedInCookies, jitter } from "./linkedin/client";
import {
  fetchConversationsPage,
  fetchCurrentPosition,
  fetchThread,
  getMe,
  sendToConversation,
  sendToRecipient,
  type InboxCategory,
} from "./linkedin/api";
import type { ConversationSummary, PlainMessage } from "./linkedin/normalize";
import { getBackfill, getPairing, getStatus, getSyncedAt, setBackfill, setStatus, setSyncedAt, type Pairing } from "./storage";

const ALARM = "aili-tick";
const TICK_MINUTES = 1;
/** Conversations idle for longer than this are left out of the history import. */
const BACKFILL_DAYS = 180;
/** Pages of 20 conversations to re-scan per category once history is in. */
const RECENT_PAGES: Record<InboxCategory, number> = { PRIMARY_INBOX: 2, SECONDARY_INBOX: 1 };
/** Threads fetched per tick, so a tick stays well inside a minute. */
const THREADS_PER_TICK = 10;
/** How long to back off when LinkedIn answers 429 or a server error. */
const PAUSE_MS = 10 * 60 * 1000;
const CATEGORY_ORDER: InboxCategory[] = ["PRIMARY_INBOX", "SECONDARY_INBOX"];

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

    const paused = (await getStatus()).pausedUntil ?? 0;
    if (!force && paused > Date.now()) return;

    const me = await getMe();
    const delivered = await deliverOutbox(pairing, me.memberUrn);

    const backfill = await getBackfill();
    if (backfill.category !== "done") {
      await backfillStep(pairing, me.memberUrn, me.displayName);
    } else if (force || delivered > 0 || tick % 2 === 1) {
      await scanRecent(pairing, me.memberUrn, me.displayName);
    }
    // Always report, so AILI has your name and photo even on ticks that synced.
    await reportStatus(pairing, { state: "ok", memberUrn: me.memberUrn, displayName: me.displayName, pictureUrl: me.pictureUrl });
    if (backfill.category === "done") await lookupProfiles(pairing);

    await setStatus({ state: "ok", lastError: undefined, pausedUntil: undefined, memberUrn: me.memberUrn, displayName: me.displayName });
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    const loggedOut = err instanceof LinkedInError && (err.status === 401 || err.status === 403);
    const throttled = err instanceof LinkedInError && (err.status === 429 || err.status >= 500);
    if (throttled) message = `LinkedIn asked us to slow down (${err.status}). Pausing for 10 minutes, then continuing.`;
    if (message === "Failed to fetch") message = "Could not reach AILI. Is the app running? Start it with npm run dev, then Sync now.";
    await setStatus({ state: loggedOut ? "logged_out" : "error", lastError: message, pausedUntil: throttled ? Date.now() + PAUSE_MS : undefined });
    const pairing = await getPairing();
    if (pairing) await reportStatus(pairing, { state: loggedOut ? "logged_out" : "error" }).catch(() => {});
  } finally {
    running = false;
  }
}

/**
 * Fills in job titles and companies, two people a tick at most. Whatever was
 * looked up before a pause is reported, so nobody is looked up twice.
 */
async function lookupProfiles(pairing: Pairing): Promise<void> {
  const items = await takeLookups(pairing);
  const results: { id: string; status: "found" | "none"; title?: string; company?: string }[] = [];
  try {
    for (const item of items) {
      await jitter(2000, 3000);
      const found = await fetchCurrentPosition(item.identity);
      results.push(
        found.status === "found"
          ? { id: item.id, status: "found", title: found.position.title, company: found.position.company }
          : { id: item.id, status: "none" },
      );
    }
  } finally {
    if (results.length) await reportLookups(pairing, results).catch(() => {});
  }
}

/** Sends at most one queued message per tick, so sends are spaced out. */
async function deliverOutbox(pairing: Pairing, memberUrn: string): Promise<number> {
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

function cutoff(): number {
  return Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;
}

function isOneToOne(conv: ConversationSummary, memberUrn: string): boolean {
  return conv.participants.filter((p) => p.urn !== memberUrn).length === 1;
}

/**
 * Fetches threads for the given conversations and posts them to AILI.
 * Returns how many were sent. Records each one's activity time so it is not
 * fetched again until something new happens.
 */
async function importConversations(pairing: Pairing, memberUrn: string, displayName: string, list: ConversationSummary[]): Promise<number> {
  if (list.length === 0) return 0;
  const syncedAt = await getSyncedAt();
  const payload = { memberUrn, displayName, conversations: [] as Array<ConversationSummary & { messages: PlainMessage[] }> };
  for (const conv of list) {
    await jitter();
    // The latest 20 messages are enough to work out the next step.
    const messages = await fetchThread(memberUrn, conv.id, 1);
    payload.conversations.push({ ...conv, messages });
  }
  await postSync(pairing, payload);
  for (const conv of payload.conversations) syncedAt[conv.id] = conv.lastActivityAt;
  await setSyncedAt(syncedAt);
  return payload.conversations.length;
}

/**
 * One page of the history import. LinkedIn lists conversations newest first,
 * so once a whole page is older than the cutoff the category is finished.
 */
async function backfillStep(pairing: Pairing, memberUrn: string, displayName: string) {
  const state = await getBackfill();
  const category = state.category as InboxCategory;
  const syncedAt = await getSyncedAt();
  const since = cutoff();
  const pageNo = (state.page ?? 0) + 1;
  await setStatus({ importPhase: `${category === "PRIMARY_INBOX" ? "Focused" : "Other"} inbox, page ${pageNo}` });

  const page = await fetchConversationsPage(memberUrn, category, state.cursor);
  const eligible = page.conversations.filter(
    (c) => isOneToOne(c, memberUrn) && c.lastActivityAt >= since && syncedAt[c.id] === undefined,
  );
  const allOld = page.conversations.length > 0 && page.conversations.every((c) => c.lastActivityAt < since);

  // Import this page in chunks; stay on the page until every eligible thread is in.
  const batch = eligible.slice(0, THREADS_PER_TICK);
  const imported = await importConversations(pairing, memberUrn, displayName, batch);
  const pageDone = eligible.length <= THREADS_PER_TICK;

  let next = { ...state, imported: state.imported + imported, page: pageNo };
  if (pageDone) {
    if (allOld || !page.nextCursor || page.nextCursor === state.cursor) {
      const idx = CATEGORY_ORDER.indexOf(category);
      const following = CATEGORY_ORDER[idx + 1];
      next = { category: following ?? "done", cursor: null, imported: next.imported, page: 0 };
    } else {
      next = { ...next, cursor: page.nextCursor };
    }
  }
  await setBackfill(next);
  if (imported === 0) await reportStatus(pairing, { state: "ok", memberUrn, displayName });
  await setStatus({
    lastSyncAt: Date.now(),
    imported: next.imported,
    backfillDone: next.category === "done",
    importPhase: next.category === "done" ? undefined : `${next.category === "PRIMARY_INBOX" ? "Focused" : "Other"} inbox, page ${(next.page ?? 0) + 1} next`,
  });
}

/** After history is in: re-read the first pages and push whatever has new activity. */
async function scanRecent(pairing: Pairing, memberUrn: string, displayName: string) {
  const syncedAt = await getSyncedAt();
  const since = cutoff();
  const changed: ConversationSummary[] = [];
  let seen = 0;

  for (const category of CATEGORY_ORDER) {
    let cursor: string | null = null;
    for (let page = 0; page < RECENT_PAGES[category]; page++) {
      if (page > 0 || category !== "PRIMARY_INBOX") await jitter();
      const result = await fetchConversationsPage(memberUrn, category, cursor);
      for (const conv of result.conversations) {
        seen += 1;
        if (!isOneToOne(conv, memberUrn)) continue;
        const known = syncedAt[conv.id];
        if (known === undefined && conv.lastActivityAt < since) continue;
        if (known !== undefined && conv.lastActivityAt <= known) continue;
        changed.push(conv);
      }
      cursor = result.nextCursor;
      if (!cursor) break;
    }
  }

  const imported = await importConversations(pairing, memberUrn, displayName, changed.slice(0, THREADS_PER_TICK));
  if (imported === 0) await reportStatus(pairing, { state: "ok", memberUrn, displayName });
  await setStatus({ lastSyncAt: Date.now(), conversations: seen, backfillDone: true });
}
