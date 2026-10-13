/*
 * AILI helper, background service worker.
 *
 * Kept quiet on purpose: LinkedIn restricts accounts when a tool reads too
 * much. Every 15 minutes, between 7 am and 9 pm, while paired and LinkedIn is
 * logged in:
 *   1. deliver any message the user clicked Send on in AILI (one per tick),
 *   2. send or withdraw at most one connection request the user clicked
 *      Connect or Withdraw on, and every few hours read your sent requests
 *      and newest connections, so AILI knows who accepted,
 *   3. import history: walk the inbox one page per tick until every
 *      one-to-one conversation active in the last BACKFILL_DAYS is in AILI,
 *   4. after that, re-read the first page of the inbox and push anything with
 *      new activity,
 *   5. tell AILI it is alive, and once a day remind you about post alerts.
 * Clicking Send or Sync now in AILI runs one straight away, at any hour, and
 * a scheduled message (or the second of a pair) wakes it at its time. Just
 * before sending one of those it reads that chat, and pauses it if they wrote.
 *
 * It never reads profiles in the background, never reads your notifications,
 * and stops at DAILY_LIMIT requests a day. If LinkedIn pushes back once, it
 * rests for a day (see linkedin/client.ts).
 *
 * When a check finds a new reply, or someone accepts your request, it shows a
 * desktop notification (if you have them on in AILI Settings). Clicking one
 * opens that conversation in AILI.
 *
 * It also notices, without changing anything or asking LinkedIn, when you tap
 * the bell on someone's profile, so AILI can tick off their post alerts, and
 * when you comment on someone's post: the warm-up AILI shows beside each lead.
 *
 * It never sends anything on its own. The queues only hold what a human
 * clicked (Send, Connect, Withdraw), and AILI caps them per day.
 */

import {
  addPerson,
  answerLead,
  linkPerson,
  postSync,
  reportAlertsOpened,
  reportBellTap,
  reportInvite,
  reportNetwork,
  reportOutbox,
  reportStatus,
  reportTouches,
  takeAlertsNudge,
  takeInvites,
  takeOutbox,
  type AcceptedToNotify,
  type LeadToAsk,
  type ReplyToNotify,
} from "./aili";
import { HoldError, LinkedInError, getLinkedInCookies, jitter } from "./linkedin/client";
import { getBudget } from "./linkedin/budget";
import {
  fetchConversationsPage,
  fetchProfile,
  fetchRecentConnections,
  fetchSentInvitations,
  fetchThread,
  getMe,
  sendInvitation,
  sendToConversation,
  sendToRecipient,
  withdrawInvitation,
  type InboxCategory,
} from "./linkedin/api";
import { bellTapFrom, commentFrom, type ConversationSummary, type PlainMessage } from "./linkedin/normalize";
import { getBackfill, getPairing, getStatus, getSyncedAt, setBackfill, setStatus, setSyncedAt, type Pairing } from "./storage";
import { AILI_TAB_PATTERNS } from "./config";

const ALARM = "aili-tick";
const SOON = "aili-soon";
const TICK_MINUTES = 15;
/** Local hours the helper syncs on its own: 7 am to 9 pm. */
const FIRST_HOUR = 7;
const LAST_HOUR = 21;
/** Conversations idle for longer than this are left out of the history import. */
const BACKFILL_DAYS = 180;
/** Pages of 20 conversations to re-scan per category once history is in. */
const RECENT_PAGES: Record<InboxCategory, number> = { PRIMARY_INBOX: 1, SECONDARY_INBOX: 1 };
/** The Other inbox (message requests) is read once an hour, not every tick. */
const OTHER_INBOX_EVERY_MS = 60 * 60 * 1000;
/** Clicking Send again and again does not re-read the inbox more than this often. */
const SCAN_GAP_MS = 5 * 60 * 1000;
/** Threads fetched per tick, so a tick stays well inside a minute. */
const THREADS_PER_TICK = 10;
/** How long to back off when LinkedIn has a server error. (A 429 rests a whole day.) */
const PAUSE_MS = 60 * 60 * 1000;
const CATEGORY_ORDER: InboxCategory[] = ["PRIMARY_INBOX", "SECONDARY_INBOX"];

let running = false;

chrome.runtime.onInstalled.addListener(() => {
  schedule();
  void reachOpenAiliTabs();
});
chrome.runtime.onStartup.addListener(() => schedule());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void cycle({ force: false });
  // A scheduled message is due: run now rather than wait for the next 15-minute check.
  if (alarm.name === SOON) {
    if (running) chrome.alarms.create(SOON, { when: Date.now() + 30_000 });
    else void cycle({ force: true });
  }
});

/** Wake for the next scheduled message on time (one alarm, replaced each run). */
function wakeAt(at: number | undefined) {
  if (!at || at <= Date.now() || at - Date.now() > 24 * 60 * 60 * 1000) return;
  chrome.alarms.create(SOON, { when: at + 3000 });
}
chrome.notifications.onClicked.addListener((id) => {
  void openFromNotification(id);
});
chrome.notifications.onButtonClicked.addListener((id, button) => {
  void answerFromNotification(id, button);
});

/*
 * Post alerts: when LinkedIn's own page (not the helper) sends a request that
 * turns on the bell for someone, tell AILI. The helper only reads the request
 * as it goes by; it never changes or blocks it.
 */
function bodyText(body: chrome.webRequest.OnBeforeRequestDetails["requestBody"] | null | undefined): string {
  if (!body) return "";
  if (body.raw?.length) return body.raw.map((part) => (part.bytes ? new TextDecoder().decode(part.bytes) : "")).join("");
  return body.formData ? JSON.stringify(body.formData) : "";
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Requests from a LinkedIn tab only: the helper's own calls have no tab.
    if (details.tabId < 0) return undefined;
    const body = bodyText(details.requestBody);
    const memberId = bellTapFrom(details.url, details.method, body);
    if (memberId) void onBellTap(memberId);
    const comment = commentFrom(details.url, details.method, body);
    if (comment) void onComment(details.tabId, comment).catch(() => {});
    return undefined;
  },
  { urls: ["https://www.linkedin.com/voyager/api/*"] },
  ["requestBody"],
);

const lastTap = new Map<string, number>();

async function onBellTap(memberId: string): Promise<void> {
  if (Date.now() - (lastTap.get(memberId) ?? 0) < 15_000) return;
  lastTap.set(memberId, Date.now());
  const [pairing, status] = await Promise.all([getPairing(), getStatus()]);
  if (!pairing || status.memberUrn?.endsWith(`:${memberId}`)) return;
  const person = await reportBellTap(pairing, memberId).catch(() => null);
  if (!person?.fresh) return;
  const base = pairing.serverUrl.replace(/\/$/, "");
  chrome.notifications.create(`aili|${base}/inbox?person=${encodeURIComponent(person.id)}|bell`, {
    type: "basic",
    iconUrl: "icon-128.png",
    title: `Post alerts on for ${person.name}`,
    message: "AILI ticked it off. LinkedIn will tell you when they post.",
    priority: 0,
  });
}
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "sync-now") {
    void cycle({ force: true }).then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === "match-profile") {
    void matchProfile(msg.publicId).then(reply, () => reply({ person: null }));
    return true;
  }
  if (msg?.type === "add-person") {
    void addFromProfile(msg).then(reply, (err) => reply({ error: err instanceof Error ? err.message : String(err) }));
    return true;
  }
  return false;
});

/**
 * Chrome only adds the AILI page script to tabs opened after the extension is
 * installed or updated. An AILI tab already open (say, on onboarding's
 * "Install the extension" step) gets it here, so it moves on without a reload.
 */
async function reachOpenAiliTabs() {
  const tabs = await chrome.tabs.query({ url: AILI_TAB_PATTERNS }).catch(() => []);
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["aili-page.js"] }).catch(() => {});
  }
}

async function schedule() {
  const existing = await chrome.alarms.get(ALARM);
  // Replaces the once-a-minute alarm of helpers before 0.16.
  if (existing?.periodInMinutes !== TICK_MINUTES) chrome.alarms.create(ALARM, { periodInMinutes: TICK_MINUTES });
}

export async function cycle({ force }: { force: boolean }): Promise<void> {
  if (running) return;
  running = true;
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

    // On its own, only in the day. Send or Sync now in AILI runs at any hour.
    const hour = new Date().getHours();
    if (!force && (hour < FIRST_HOUR || hour >= LAST_HOUR)) {
      // Still say it is alive (to AILI only), so AILI shows it resting rather than stopped.
      await reportStatus(pairing, { state: "resting" }).catch(() => {});
      return;
    }
    // A server error pause, or LinkedIn's pushback (that one is checked again for every request).
    const status = await getStatus();
    if ((status.pausedUntil ?? 0) > Date.now()) return;

    const me = await getMe();
    const delivered = await deliverOutbox(pairing, me.memberUrn);
    await handleInvites(pairing, me.memberUrn);

    const backfill = await getBackfill();
    if (backfill.category !== "done") {
      await backfillStep(pairing, me.memberUrn, me.displayName);
    } else if (delivered > 0 || Date.now() - (status.lastSyncAt ?? 0) >= SCAN_GAP_MS) {
      await scanRecent(pairing, me.memberUrn, me.displayName);
    }
    // Always report, so AILI has your name and photo even on ticks that synced.
    await reportStatus(pairing, { state: "ok", memberUrn: me.memberUrn, displayName: me.displayName, pictureUrl: me.pictureUrl });
    // The morning reminder: AILI decides when. No LinkedIn request.
    await remindAlerts(pairing).catch(() => {});

    await setStatus({ state: "ok", lastError: undefined, pausedUntil: undefined, memberUrn: me.memberUrn, displayName: me.displayName, publicId: me.publicId });
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    // Today's limit, or LinkedIn pushed back (429 or 999): the helper rests (see linkedin/budget.ts).
    const pushback = err instanceof LinkedInError && (err.status === 429 || err.status === 999);
    const hold = err instanceof HoldError || pushback;
    const loggedOut = err instanceof LinkedInError && (err.status === 401 || err.status === 403);
    const serverError = err instanceof LinkedInError && err.status >= 500 && err.status !== 999;
    if (serverError) message = `LinkedIn had a problem (${err.status}). Trying again in an hour.`;
    if (message === "Failed to fetch") message = "Could not reach AILI. Is the app running? Start it with npm run dev, then Sync now.";
    const pausedUntil = err instanceof HoldError ? err.until : pushback ? (await getBudget()).holdUntil : serverError ? Date.now() + PAUSE_MS : undefined;
    // Resting or at today's limit is not an error: say so in the popup and wait.
    await setStatus({ state: loggedOut ? "logged_out" : hold ? "ok" : "error", lastError: message, pausedUntil });
    const pairing = await getPairing();
    if (pairing) await reportStatus(pairing, { state: loggedOut ? "logged_out" : hold ? "ok" : "error" }).catch(() => {});
  } finally {
    running = false;
  }
}

/** Not a failure of this one item: logged out, resting, or LinkedIn asked to slow down. */
function paused(err: unknown): boolean {
  return err instanceof HoldError || (err instanceof LinkedInError && [401, 429, 999].includes(err.status));
}

const memberIdOf = (urn: string | null | undefined) => (urn ?? "").split(":").pop() ?? "";

/**
 * Connection requests: sends at most one the user clicked Connect on, withdraws
 * at most one they clicked Withdraw on, and when AILI says it is time, reads
 * your sent requests and newest connections so AILI knows who accepted.
 */
async function handleInvites(pairing: Pairing, memberUrn: string): Promise<void> {
  const { send, withdraw, checkNetwork } = await takeInvites(pairing);
  const myId = memberIdOf(memberUrn);

  if (send) {
    try {
      await jitter(1500, 3000);
      let memberId = memberIdOf(send.recipientUrn);
      let recipientUrn: string | undefined;
      if (!memberId && send.publicId) {
        const profile = await readProfile(send.publicId);
        memberId = memberIdOf(profile?.urn);
        recipientUrn = profile?.urn;
      }
      if (!memberId) throw new Error("Could not find their LinkedIn profile. Check their LinkedIn URL in AILI.");
      const { invitationId } = await sendInvitation(memberId, send.note);
      await reportInvite(pairing, send.id, { status: "sent", invitationId: invitationId || undefined, sentAt: Date.now(), recipientUrn });
    } catch (err) {
      // Logged out, resting or asked to slow down: AILI hands the request out again later.
      if (paused(err)) throw err;
      await reportInvite(pairing, send.id, { status: "failed", error: err instanceof Error ? err.message : String(err) }).catch(() => {});
    }
  }

  if (withdraw) {
    try {
      await jitter(1500, 3000);
      let { invitationId, sharedSecret } = withdraw;
      if (!invitationId) {
        const memberId = memberIdOf(withdraw.recipientUrn);
        const { sent } = await fetchSentInvitations(myId);
        const match = sent.find(
          (s) => (memberId && s.memberId === memberId) || (withdraw.publicId && s.publicId?.toLowerCase() === withdraw.publicId.toLowerCase()),
        );
        invitationId = match?.invitationId ?? null;
        sharedSecret = match?.sharedSecret ?? null;
      }
      // Not in your sent requests any more: nothing left to withdraw.
      if (invitationId) await withdrawInvitation(invitationId, sharedSecret ?? undefined);
      await reportInvite(pairing, withdraw.id, { status: "withdrawn" });
    } catch (err) {
      if (paused(err)) throw err;
      await reportInvite(pairing, withdraw.id, { status: "withdraw-failed", error: err instanceof Error ? err.message : String(err) }).catch(() => {});
    }
  }

  if (checkNetwork) await checkNetworkNow(pairing, myId);
}

/** Your sent requests and newest connections, to AILI; then a notice for leads who accepted. */
async function checkNetworkNow(pairing: Pairing, myId: string): Promise<void> {
  const body: Parameters<typeof reportNetwork>[1] = {};
  const stop = (err: unknown) => paused(err) || (err instanceof LinkedInError && err.status >= 500);
  try {
    const { sent, complete } = await fetchSentInvitations(myId);
    body.sent = sent;
    body.sentComplete = complete;
  } catch (err) {
    if (stop(err)) throw err;
  }
  await jitter();
  try {
    body.connections = await fetchRecentConnections(myId);
  } catch (err) {
    if (stop(err)) throw err;
  }
  // Reported even when LinkedIn gave nothing, so AILI waits 15 minutes before asking again.
  const accepted = await reportNetwork(pairing, body);
  if (accepted.length) await showAccepted(pairing, accepted);
}

/** A profile read in the last few minutes, so it costs one LinkedIn request at most. */
const profileCache = new Map<string, { at: number; profile: Awaited<ReturnType<typeof fetchProfile>> }>();

async function readProfile(publicId: string) {
  const hit = profileCache.get(publicId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.profile;
  const profile = await fetchProfile(publicId);
  profileCache.set(publicId, { at: Date.now(), profile });
  return profile;
}

/**
 * The popup found someone in AILI with this name but not this /in/ address
 * (people imported from messages carry a member id). Reads the profile's
 * member id and asks AILI whether it is the same person. Only for a name
 * already in AILI, so rare, and one read at most for each profile.
 */
async function matchProfile(publicId: string) {
  const pairing = await getPairing();
  if (!pairing) return { person: null };
  const profile = await readProfile(publicId);
  if (!profile?.urn) return { person: null };
  return linkPerson(pairing, { publicId, urn: profile.urn });
}

/**
 * "Add to AILI" from the popup, for the profile open in the current tab. The
 * popup reads the name, headline and photo from the page, so this asks
 * LinkedIn nothing. The member id is read once later, only if you click
 * Connect or Send.
 */
async function addFromProfile(msg: { publicId: string; name: string; headline?: string; pictureUrl?: string; stage: string; tagId?: string; newTag?: string }) {
  const pairing = await getPairing();
  if (!pairing) throw new Error("Connect the helper to AILI first.");
  if (!msg.name) throw new Error("Could not read this profile. Reload the page and try again.");
  return addPerson(pairing, {
    publicId: msg.publicId,
    name: msg.name,
    headline: msg.headline,
    pictureUrl: msg.pictureUrl,
    stage: msg.stage,
    tagId: msg.tagId || undefined,
    newTag: msg.newTag || undefined,
  });
}

/**
 * Sends at most one queued message per tick, so sends are spaced out. A
 * scheduled message or the second of a pair: reads that chat first, and if
 * they have written since you wrote it, pauses it for you instead (one
 * request). Returns how many went or were paused, so the inbox is read after.
 */
async function deliverOutbox(pairing: Pairing, memberUrn: string): Promise<number> {
  const { items, nextDueAt } = await takeOutbox(pairing);
  wakeAt(nextDueAt);
  let delivered = 0;
  for (const item of items) {
    try {
      await jitter(1500, 3000);
      if (item.checkReplySince && item.conversationId) {
        const { messages } = await fetchThread(memberUrn, item.conversationId, 1);
        if (messages.some((m) => m.senderUrn !== memberUrn && m.sentAt > item.checkReplySince!)) {
          const res = await reportOutbox(pairing, item.id, { status: "paused" });
          wakeAt(res?.nextDueAt);
          delivered += 1;
          continue;
        }
      }
      // Added from their profile, so no member id yet: read the profile once, now that you clicked Send.
      let recipientUrn = item.recipientUrn ?? undefined;
      let readUrn: string | undefined;
      if (!item.conversationId && !recipientUrn && item.publicId) {
        readUrn = (await readProfile(item.publicId))?.urn || undefined;
        recipientUrn = readUrn;
      }
      const sent = item.conversationId
        ? { ...(await sendToConversation(memberUrn, item.conversationId, item.body)), conversationId: item.conversationId }
        : recipientUrn
          ? await sendToRecipient(memberUrn, recipientUrn, item.body)
          : null;
      if (!sent) throw new Error("Could not find them on LinkedIn. Check their LinkedIn address in AILI, or send it by hand.");
      const res = await reportOutbox(pairing, item.id, {
        status: "sent",
        externalId: sent.id || undefined,
        conversationId: sent.conversationId,
        recipientUrn: readUrn,
        sentAt: sent.sentAt || Date.now(),
      });
      // The second of a pair is due in a minute or two: wake for it.
      wakeAt(res?.nextDueAt);
      delivered += 1;
      const status = await getStatus();
      await setStatus({ sentToday: (status.sentToday ?? 0) + 1 });
    } catch (err) {
      // Resting or asked to slow down: leave it queued for later, it did not fail.
      if (paused(err)) throw err;
      const message = err instanceof Error ? err.message : String(err);
      // LinkedIn would not start a conversation with them: most often you are not connected yet.
      const notConnected = !item.conversationId && err instanceof LinkedInError && [400, 403, 422].includes(err.status);
      await reportOutbox(pairing, item.id, { status: "failed", error: message, notConnected }).catch(() => {});
      // Logged out or asked to slow down: stop this tick. A refused message is only that message.
      if (err instanceof LinkedInError && (err.status === 401 || err.status === 429 || err.status >= 500)) throw err;
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
async function importConversations(
  pairing: Pairing,
  memberUrn: string,
  displayName: string,
  list: ConversationSummary[],
  { notify }: { notify: boolean },
): Promise<number> {
  if (list.length === 0) return 0;
  const syncedAt = await getSyncedAt();
  const payload = { memberUrn, displayName, conversations: [] as Array<ConversationSummary & { messages: PlainMessage[]; seenAt?: number }> };
  for (const conv of list) {
    await jitter();
    // The latest 20 messages are enough to work out the next step.
    const { messages, seenAt } = await fetchThread(memberUrn, conv.id, 1);
    payload.conversations.push({ ...conv, messages, ...(seenAt ? { seenAt } : {}) });
  }
  const response = await postSync(pairing, payload);
  if (notify && response?.notify?.length) await showReplies(pairing, response.notify);
  if (notify && response?.ask?.length) await askAboutLeads(pairing, response.ask);
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
  // No notifications while history comes in, only for replies found afterwards.
  const imported = await importConversations(pairing, memberUrn, displayName, batch, { notify: false });
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

  const { otherScanAt = 0 } = (await chrome.storage.local.get("otherScanAt")) as { otherScanAt?: number };
  const readOther = Date.now() - otherScanAt >= OTHER_INBOX_EVERY_MS;
  for (const category of CATEGORY_ORDER) {
    if (category === "SECONDARY_INBOX" && !readOther) continue;
    if (category === "SECONDARY_INBOX") await chrome.storage.local.set({ otherScanAt: Date.now() });
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

  const imported = await importConversations(pairing, memberUrn, displayName, changed.slice(0, THREADS_PER_TICK), {
    notify: true,
  });
  if (imported === 0) await reportStatus(pairing, { state: "ok", memberUrn, displayName });
  await setStatus({ lastSyncAt: Date.now(), conversations: seen, backfillDone: true });
}

/** At most this many separate notifications per check; more than that become one summary. */
const MAX_NOTIFICATIONS = 3;

/** Desktop notifications for new replies. Clicking one opens that person in AILI. */
async function showReplies(pairing: Pairing, replies: ReplyToNotify[]): Promise<void> {
  const base = pairing.serverUrl.replace(/\/$/, "");
  const show = (id: string, title: string, message: string) =>
    new Promise<void>((resolve) =>
      chrome.notifications.create(id, { type: "basic", iconUrl: "icon-128.png", title, message, priority: 1 }, () => resolve()),
    );
  if (replies.length > MAX_NOTIFICATIONS) {
    await show(`aili|${base}/inbox`, `${replies.length} new replies`, replies.map((r) => r.name).slice(0, 6).join(", "));
    return;
  }
  for (const r of replies) {
    await show(`aili|${base}/inbox?person=${encodeURIComponent(r.personId)}|${r.sentAt}`, r.name, r.body);
  }
}

/**
 * "Add to Leads?" for new conversations you started on LinkedIn. One person:
 * a notice with Add to Leads and Not a lead. Several at once: one notice that
 * opens Other in AILI, where each one asks the same question.
 */
async function askAboutLeads(pairing: Pairing, people: LeadToAsk[]): Promise<void> {
  const base = pairing.serverUrl.replace(/\/$/, "");
  const show = (id: string, options: chrome.notifications.NotificationCreateOptions) =>
    new Promise<void>((resolve) => chrome.notifications.create(id, options, () => resolve()));
  if (people.length > 1) {
    await show(`aili|${base}/inbox?view=other`, {
      type: "basic",
      iconUrl: "icon-128.png",
      title: `You started ${people.length} new conversations`,
      message: `${people.map((p) => p.name).slice(0, 5).join(", ")}. Add the leads among them in AILI.`,
      priority: 1,
    });
    return;
  }
  const [p] = people;
  await show(`ask|${base}/inbox?person=${encodeURIComponent(p.personId)}|${p.personId}`, {
    type: "basic",
    iconUrl: "icon-128.png",
    title: `You messaged ${p.name}`,
    message: "Add them to Leads in AILI?",
    buttons: [{ title: "Add to Leads" }, { title: "Not a lead" }],
    requireInteraction: true,
    priority: 1,
  });
}

/**
 * "Turn on post alerts for 5 leads": Start opens the list in AILI. For one
 * person, Open profile goes straight to their LinkedIn profile.
 */
async function remindAlerts(pairing: Pairing): Promise<void> {
  const nudge = await takeAlertsNudge(pairing);
  if (!nudge) return;
  const base = pairing.serverUrl.replace(/\/$/, "");
  const options: chrome.notifications.NotificationCreateOptions =
    nudge.count === 1
      ? {
          type: "basic",
          iconUrl: "icon-128.png",
          title: `${nudge.first.name}: turn on post alerts`,
          message: "Opens their LinkedIn profile. Tap the bell there and AILI ticks it off.",
          buttons: [{ title: "Open profile" }, { title: "Tomorrow" }],
          priority: 1,
        }
      : {
          type: "basic",
          iconUrl: "icon-128.png",
          title: `Turn on post alerts for ${nudge.count} leads`,
          message: "So LinkedIn tells you when they post. About a minute.",
          buttons: [{ title: "Start" }, { title: "Tomorrow" }],
          priority: 1,
        };
  const id = nudge.count === 1 ? `alertone|${nudge.first.url}|${nudge.first.personId}` : `alerts|${base}/people?alerts=1`;
  await new Promise<void>((resolve) => chrome.notifications.create(id, options, () => resolve()));
}

/** Opens the page a post alerts notice points to; for one person, AILI hears that you opened it. */
async function openAlerts(id: string): Promise<void> {
  const [prefix, url, personId] = id.split("|");
  chrome.notifications.clear(id);
  if (!url) return;
  await chrome.tabs.create({ url });
  if (prefix === "alertone" && personId) {
    const pairing = await getPairing();
    if (pairing) await reportAlertsOpened(pairing, personId).catch(() => {});
  }
}

/** "Jaimes accepted your request": Say hello opens the conversation in AILI. */
async function showAccepted(pairing: Pairing, people: AcceptedToNotify[]): Promise<void> {
  const base = pairing.serverUrl.replace(/\/$/, "");
  for (const p of people.slice(0, MAX_NOTIFICATIONS)) {
    await new Promise<void>((resolve) =>
      chrome.notifications.create(
        `hello|${base}/inbox?person=${encodeURIComponent(p.personId)}|${p.personId}`,
        {
          type: "basic",
          iconUrl: "icon-128.png",
          title: `${p.name} accepted your request`,
          message: `${p.headline ? `${p.headline}. ` : ""}Say hello?`,
          buttons: [{ title: "Say hello" }, { title: "Later" }],
          priority: 1,
        },
        () => resolve(),
      ),
    );
  }
}

/** The buttons on an "Add to Leads?" or "accepted" notice. */
async function answerFromNotification(id: string, button: number): Promise<void> {
  const [prefix, url, personId] = id.split("|");
  if (prefix === "alerts" || prefix === "alertone") {
    if (button === 0) await openAlerts(id);
    else chrome.notifications.clear(id);
    return;
  }
  if (prefix === "hello") {
    chrome.notifications.clear(id);
    if (button === 0 && url) await chrome.tabs.create({ url });
    return;
  }
  if (prefix !== "ask" || !personId) return;
  chrome.notifications.clear(id);
  const pairing = await getPairing();
  if (pairing) await answerLead(pairing, personId, button === 0).catch(() => {});
}

async function openFromNotification(id: string): Promise<void> {
  const [prefix, url] = id.split("|");
  if (prefix === "alerts" || prefix === "alertone") return openAlerts(id);
  if ((prefix !== "aili" && prefix !== "ask" && prefix !== "hello") || !url) return;
  await chrome.tabs.create({ url });
  chrome.notifications.clear(id);
}

/* ------------------------------------------------------------- warm-up */

const lastComment = new Map<string, number>();

/**
 * Runs in the LinkedIn tab where you just commented: whose post it was (their
 * /in/ address) and its first words. Reads the page only.
 */
function postAuthorOnPage(postUrn: string): { publicId: string; postText: string } | null {
  const id = postUrn.split(":").pop() ?? "";
  const post =
    document.querySelector(`[data-urn="${postUrn}"], [data-id="${postUrn}"], [data-activity-urn="${postUrn}"]`) ??
    (id ? document.querySelector(`[data-urn*="${id}"], [data-id*="${id}"]`) : null);
  const inLink = (root: ParentNode | null) => {
    const a = root?.querySelector<HTMLAnchorElement>(
      '.update-components-actor__meta-link, .update-components-actor a[href*="/in/"], a.app-aware-link[href*="/in/"], a[href*="/in/"]',
    );
    return /\/in\/([^/?#]+)/.exec(a?.getAttribute("href") ?? "")?.[1] ?? "";
  };
  let publicId = inLink(post);
  // On someone's own activity page, the posts are theirs.
  if (!publicId) publicId = /^\/in\/([^/]+)\/recent-activity/.exec(location.pathname)?.[1] ?? "";
  if (!publicId) return null;
  const text = (post?.querySelector(".update-components-text, .feed-shared-update-v2__description") as HTMLElement | null)?.innerText ?? "";
  return { publicId: decodeURIComponent(publicId), postText: text.replace(/\s+/g, " ").trim().slice(0, 120) };
}

/** You just commented on a post: tell AILI whose, if they are in AILI. */
async function onComment(tabId: number, comment: { postUrn: string; text: string }): Promise<void> {
  if (Date.now() - (lastComment.get(comment.postUrn) ?? 0) < 15_000) return;
  lastComment.set(comment.postUrn, Date.now());
  const [pairing, status] = await Promise.all([getPairing(), getStatus()]);
  if (!pairing) return;
  const [found] = await chrome.scripting.executeScript({ target: { tabId }, func: postAuthorOnPage, args: [comment.postUrn] });
  const author = found?.result as { publicId: string; postText: string } | null | undefined;
  // Your own post (a reply to someone's comment on it) is not warm-up.
  if (!author?.publicId || author.publicId === status.publicId) return;
  await reportTouches(pairing, {
    touches: [
      {
        kind: "comment",
        publicId: author.publicId,
        text: comment.text || (author.postText ? `On: ${author.postText}` : ""),
        externalId: `comment:${comment.postUrn}:${Date.now()}`,
        at: Date.now(),
      },
    ],
  });
}

