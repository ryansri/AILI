/** Calls to the AILI server. */

import { getBackfill, getStatus, startImportOver, type Pairing } from "./storage";

export interface OutboxItem {
  id: string;
  body: string;
  conversationId: string | null;
  recipientUrn: string | null;
  /** When there is no member id yet: their /in/ address, for one profile read at send time. */
  publicId?: string | null;
  personName: string;
  /** Scheduled or a second message: read the chat first; a message from them after this time pauses it. */
  checkReplySince?: number;
}

export class AiliError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T = unknown>(pairing: Pairing, path: string, init: RequestInit = {}): Promise<T> {
  const url = `${pairing.serverUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let said = "";
    try {
      said = JSON.parse(text)?.error ?? "";
    } catch {}
    throw new AiliError(
      res.status === 401
        ? "AILI rejected the token. Paste a fresh one from Settings."
        : said || `AILI returned ${res.status} ${text.slice(0, 120)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export function checkPairing(pairing: Pairing): Promise<{ workspace: string; dailyCap: number }> {
  return call<{ workspace: string; dailyCap: number }>(pairing, "/api/helper/status");
}

export async function reportStatus(
  pairing: Pairing,
  body: { state: string; memberUrn?: string; displayName?: string; pictureUrl?: string },
) {
  // The version lets AILI spot an old helper still loaded in Chrome.
  const version = chrome.runtime.getManifest().version;
  // Progress, so AILI can show the import and any problem without opening the popup.
  // The import's own record is the truth for progress; the popup status can lag a step.
  const [status, backfill] = await Promise.all([getStatus(), getBackfill()]);
  const progress = {
    imported: backfill.imported ?? 0,
    importing: backfill.category !== "done",
    phase: status.importPhase,
    pausedUntil: status.pausedUntil && status.pausedUntil > Date.now() ? status.pausedUntil : undefined,
    // Why it failed, or why it is resting (today's limit, or LinkedIn pushed back).
    error: body.state === "error" || (status.pausedUntil ?? 0) > Date.now() ? status.lastError : undefined,
  };
  const res = await call<{ ok: boolean; resync?: boolean }>(pairing, "/api/helper/status", {
    method: "POST",
    body: JSON.stringify({ ...body, version, progress }),
  });
  // AILI has none of the conversations this helper imported (its data was
  // reset): import the history again from the next run.
  if (res?.resync) await startImportOver();
  return res;
}

export interface ReplyToNotify {
  personId: string;
  name: string;
  body: string;
  sentAt: number;
}

/** A new conversation you started: AILI asks whether the person is a lead. */
export interface LeadToAsk {
  personId: string;
  name: string;
  sentAt: number;
}

export function postSync(pairing: Pairing, payload: unknown): Promise<{ notify?: ReplyToNotify[]; ask?: LeadToAsk[] }> {
  return call(pairing, "/api/helper/sync", { method: "POST", body: JSON.stringify(payload) });
}

/** The answer to "Add to Leads?": true moves them to Leads, false keeps them in Other. */
export function answerLead(pairing: Pairing, personId: string, lead: boolean) {
  return call(pairing, "/api/helper/lead", { method: "POST", body: JSON.stringify({ personId, lead }) });
}

/** The next message to send, and when the next scheduled one is due (to wake for it on time). */
export async function takeOutbox(pairing: Pairing): Promise<{ items: OutboxItem[]; nextDueAt?: number }> {
  const data = await call<{ items?: OutboxItem[]; nextDueAt?: number }>(pairing, "/api/helper/outbox");
  return { items: Array.isArray(data?.items) ? data.items : [], nextDueAt: typeof data?.nextDueAt === "number" ? data.nextDueAt : undefined };
}

export function reportOutbox(
  pairing: Pairing,
  id: string,
  body: {
    status: "sent" | "failed" | "paused";
    externalId?: string;
    conversationId?: string;
    recipientUrn?: string;
    sentAt?: number;
    error?: string;
    notConnected?: boolean;
  },
) {
  return call<{ ok: boolean; nextDueAt?: number }>(pairing, `/api/helper/outbox/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** A connection request to send or withdraw: the user clicked Connect or Withdraw in AILI. */
export interface InviteItem {
  id: string;
  name: string;
  recipientUrn: string | null;
  publicId: string | null;
  note: string;
  invitationId: string | null;
  sharedSecret: string | null;
}

export async function takeInvites(pairing: Pairing): Promise<{ send: InviteItem | null; withdraw: InviteItem | null; checkNetwork: boolean }> {
  const data = await call<{ send?: InviteItem | null; withdraw?: InviteItem | null; checkNetwork?: boolean }>(pairing, "/api/helper/invites");
  return { send: data?.send ?? null, withdraw: data?.withdraw ?? null, checkNetwork: data?.checkNetwork === true };
}

export function reportInvite(
  pairing: Pairing,
  id: string,
  body:
    | { status: "sent"; invitationId?: string; sentAt?: number; recipientUrn?: string }
    | { status: "failed" | "withdraw-failed"; error: string }
    | { status: "withdrawn" },
) {
  return call(pairing, `/api/helper/invites/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(body) });
}

/** Someone who just accepted your request, for a desktop notice. */
export interface AcceptedToNotify {
  personId: string;
  name: string;
  headline: string;
}

export async function reportNetwork(
  pairing: Pairing,
  body: {
    sent?: { memberId: string; publicId?: string; invitationId?: string; sharedSecret?: string; sentAt?: number; message?: string; pictureUrl?: string }[];
    sentComplete?: boolean;
    connections?: { memberId: string; publicId?: string; connectedAt?: number; pictureUrl?: string }[];
  },
): Promise<AcceptedToNotify[]> {
  const data = await call<{ accepted?: AcceptedToNotify[] }>(pairing, "/api/helper/network", { method: "POST", body: JSON.stringify(body) });
  return Array.isArray(data?.accepted) ? data.accepted : [];
}

export interface PersonCheck {
  /** lead is false for someone in Other: in AILI, but not tracked as a lead. */
  person: { id: string; name: string; stage: string; lead?: boolean } | null;
  /** Someone in AILI has this name; the helper can confirm by member id. */
  maybe?: boolean;
  stages: { key: string; label: string }[];
  tags: { id: string; label: string }[];
}

export function checkPerson(pairing: Pairing, publicId: string, name = ""): Promise<PersonCheck> {
  return call(pairing, `/api/helper/people?publicId=${encodeURIComponent(publicId)}&name=${encodeURIComponent(name)}`);
}

/** Confirms someone is already in AILI by member id, and saves their /in/ address there. */
export function linkPerson(pairing: Pairing, body: { publicId: string; urn: string }): Promise<Pick<PersonCheck, "person">> {
  return call(pairing, "/api/helper/people", { method: "POST", body: JSON.stringify({ ...body, link: true }) });
}

export function addPerson(
  pairing: Pairing,
  body: {
    publicId: string;
    urn?: string;
    name: string;
    headline?: string;
    pictureUrl?: string;
    jobTitle?: string;
    company?: string;
    stage: string;
    tagId?: string;
    newTag?: string;
  },
): Promise<{ id: string; existed: boolean; tracked?: boolean; stage: string; tagId?: string }> {
  return call(pairing, "/api/helper/people", { method: "POST", body: JSON.stringify(body) });
}

/** The morning reminder, when it is due: how many leads to tap the bell for, and the first. */
export interface AlertsNudge {
  count: number;
  first: { personId: string; name: string; url: string };
}

export async function takeAlertsNudge(pairing: Pairing): Promise<AlertsNudge | null> {
  const data = await call<{ nudge?: AlertsNudge | null }>(pairing, "/api/helper/alerts");
  return data?.nudge ?? null;
}

/** You tapped the bell on someone's profile. AILI says who, if they are in AILI. */
export async function reportBellTap(pairing: Pairing, memberId: string): Promise<{ id: string; name: string; fresh: boolean } | null> {
  const data = await call<{ person?: { id: string; name: string; fresh: boolean } | null }>(pairing, "/api/helper/alerts", {
    method: "POST",
    body: JSON.stringify({ memberId }),
  });
  return data?.person ?? null;
}

/** You opened a profile from the reminder. */
export function reportAlertsOpened(pairing: Pairing, personId: string) {
  return call(pairing, "/api/helper/alerts", { method: "POST", body: JSON.stringify({ opened: personId }) });
}

export interface WarmupToNotify {
  personId: string;
  name: string;
  kind: "reply" | "engage";
  text: string;
}

/** Warm-up seen on LinkedIn: your comments, and replies and likes from your notifications. */
export async function reportTouches(
  pairing: Pairing,
  body: { touches: unknown[]; read?: { cards: number; error?: string } },
): Promise<WarmupToNotify[]> {
  const data = await call<{ notify?: WarmupToNotify[] }>(pairing, "/api/helper/touches", { method: "POST", body: JSON.stringify(body) });
  return data?.notify ?? [];
}
