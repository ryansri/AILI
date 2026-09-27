/** Calls to the AILI server. */

import { getBackfill, getStatus, startImportOver, type Pairing } from "./storage";

export interface OutboxItem {
  id: string;
  body: string;
  conversationId: string | null;
  recipientUrn: string | null;
  personName: string;
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
    error: body.state === "error" ? status.lastError : undefined,
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

export function postSync(pairing: Pairing, payload: unknown): Promise<{ notify?: ReplyToNotify[] }> {
  return call(pairing, "/api/helper/sync", { method: "POST", body: JSON.stringify(payload) });
}

export async function takeOutbox(pairing: Pairing): Promise<OutboxItem[]> {
  const data = await call<{ items?: OutboxItem[] }>(pairing, "/api/helper/outbox");
  return Array.isArray(data?.items) ? data.items : [];
}

export function reportOutbox(
  pairing: Pairing,
  id: string,
  body: { status: "sent" | "failed"; externalId?: string; conversationId?: string; sentAt?: number; error?: string },
) {
  return call(pairing, `/api/helper/outbox/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(body) });
}

export interface LookupItem {
  id: string;
  name: string;
  identity: string;
}

export async function takeLookups(pairing: Pairing): Promise<LookupItem[]> {
  const data = await call<{ items?: LookupItem[] }>(pairing, "/api/helper/profiles");
  return Array.isArray(data?.items) ? data.items : [];
}

export function reportLookups(
  pairing: Pairing,
  results: { id: string; status: "found" | "none"; title?: string; company?: string }[],
) {
  return call(pairing, "/api/helper/profiles", { method: "POST", body: JSON.stringify({ results }) });
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
